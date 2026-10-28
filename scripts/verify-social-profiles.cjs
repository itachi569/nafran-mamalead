// Real parser, crawler and SQLite repair regression coverage; no production data or credentials.
const assert=require('node:assert/strict'),{createServer}=require('node:http'),{mkdtempSync}=require('node:fs'),{join}=require('node:path'),{tmpdir}=require('node:os');
const {canonicalSocialProfile:profile}=require('../dist-electron/social-profile.js');
const {WebsiteEnricher,socialLinksFromHtml}=require('../dist-electron/enrichment/website.js');
const {LocalDatabase}=require('../dist-electron/db/local-db.js'),{Repository}=require('../dist-electron/db/repository.js');
const checks=[];function check(name,fn){fn();checks.push(name);console.log('PASS '+name)}
async function main(){
 check('profile variants canonicalize without turning channels into handles',()=>{
  assert.equal(profile('https://m.facebook.com/Acme/about?mibextid=123').profileUrl,'https://www.facebook.com/Acme');
  assert.equal(profile('https://facebook.com/people/Acme/61590701073400').profileUrl,'https://www.facebook.com/profile.php?id=61590701073400');
  assert.equal(profile('https://youtube.com/channel/UCabcDEF123/about').profileUrl,'https://www.youtube.com/channel/UCabcDEF123');
  assert.equal(profile('https://de.linkedin.com/company/acme/about').profileUrl,'https://www.linkedin.com/company/acme');
 });
 check('media, login, navigation and share URLs are never profiles',()=>{
  for(const url of ['https://facebook.com/login/device-based/regular/login','https://facebook.com/recover/initiate','https://facebook.com/photo.php?id=12345','https://facebook.com/Acme/posts/123','https://instagram.com/p/ABcd','https://instagram.com/explore','https://youtube.com/about/press','https://youtube.com/watch?v=abc','https://youtu.be/abc','https://tiktok.com/@acme/video/123','https://linkedin.com/feed','https://x.com/intent/post?text=hello'])assert.equal(profile(url),null,url);
 });
 const html=`<a href=https://m.facebook.com/Acme/about?ref=footer>Facebook</a><a href="https://www.facebook.com/Acme?ref=other">Facebook</a><a href=https://facebook.com/AcmeNorth>North branch</a><a href="https://instagram.com/p/ABC">Post</a><a href="https://youtube.com/watch?v=x">Video</a><script type="application/ld+json">{"@type":"Organization","sameAs":["https://instagram.com/acme/","https://linkedin.com/company/acme"]}</script><script>window.cache={"randomVideo":"https://youtube.com/@unrelated","socialLinks":["https://tiktok.com/@acme","https://x.com/acme"]}</script><template><a href="https://facebook.com/templatejunk">Fake</a></template>`;
 check('all six platforms, branch accounts and JSON config links survive; feed caches do not',()=>{
  const found=socialLinksFromHtml(html,'https://acme.test');assert.equal(found.length,6);assert.equal(found.filter(s=>s.platform==='facebook').length,2);assert(!found.some(s=>/unrelated|templatejunk|\/p\//.test(s.profileUrl)));
 });
 check('platform pages retain own account and explicit owner links, not feed/navigation',()=>{
  const page=`<a href="https://youtube.com/@stranger">Other channel</a><a href="https://facebook.com/youtube">Corporate footer</a><script>var ytInitialData={"recommendations":[{"url":"https://youtube.com/@stranger2"}],"channelHeaderLinksRenderer":{"primaryLinks":[{"url":"https://www.youtube.com/redirect?q=https%3A%2F%2Finstagram.com%2Facme"}]}};</script>`;
  const found=socialLinksFromHtml(page,'https://youtube.com/c/Acme');assert.equal(found.length,2);assert(found.some(s=>s.profileUrl==='https://www.youtube.com/c/Acme'));assert(found.some(s=>s.profileUrl==='https://www.instagram.com/acme'));
 });
 const db=new LocalDatabase(join(mkdtempSync(join(tmpdir(),'mamalead-social-repair-')),'leads.db')),repo=new Repository(db),ws=db.ensureWorkspace().id,at=new Date().toISOString();
 for(const [id,website] of [['fb','https://facebook.com/Acme'],['yt','https://youtube.com/c/Acme'],['web','https://acme.test'],['id','https://facebook.com/profile.php?id=61590701073400']])db.run('insert into leads (id,workspace_id,name,website,provider,captured_at) values (?,?,?,?,?,?)',[id,ws,id,website,'import',at]);
 let n=0;function legacy(lead,url,platform,source='website'){db.run('insert into social_profiles (id,workspace_id,lead_id,platform,handle,profile_url,source,discovered_at,updated_at) values (?,?,?,?,?,?,?,?,?)',['old-'+n++,ws,lead,platform,'legacy',url,source,at,at])}
 legacy('fb','https://facebook.com/Acme','facebook');legacy('fb','https://m.facebook.com/Acme/about?ref=footer','facebook');legacy('fb','https://facebook.com/login','facebook');legacy('fb','https://facebook.com/OtherAccount','facebook');legacy('fb','https://instagram.com/Acme','instagram');
 legacy('yt','https://youtube.com/c/Acme','youtube');legacy('yt','https://youtube.com/about/press','youtube');legacy('yt','https://youtube.com/@stranger','youtube');legacy('yt','https://facebook.com/youtube','facebook');legacy('yt','https://youtube.com/@ApprovedBranch','youtube','import');
 legacy('web','https://facebook.com/Acme','facebook');legacy('web','https://m.facebook.com/Acme/about','facebook');legacy('web','https://facebook.com/AcmeNorth','facebook');legacy('id','https://facebook.com/people/Acme/61590701073400','facebook');
 const report=repo.repairSocialProfiles();
 check('legacy repair removes duplicates/feed pollution, preserves branches and imported accounts',()=>{
  assert.equal(db.query("select * from social_profiles where lead_id='fb'").length,2);assert.equal(db.query("select * from social_profiles where lead_id='yt'").length,2);assert.equal(db.query("select * from social_profiles where lead_id='web'").length,2);assert.equal(db.query("select * from social_profiles where lead_id='id'")[0].profile_url,'https://www.facebook.com/profile.php?id=61590701073400');assert.equal(db.one('select count(*) n from leads').n,4);
 });
 check('changed originals are recoverable; second repair is idempotent',()=>{
  assert.equal(db.one('select count(*) n from social_profile_repairs').n,report.removed+report.normalized);assert(db.query('select original_json from social_profile_repairs').every(row=>JSON.parse(row.original_json).profile_url));assert.deepEqual(repo.repairSocialProfiles(),{removed:0,normalized:0,added:0});
 });
 check('future inserts/edits reject non-profile endpoints',()=>{
  assert.throws(()=>repo.upsertSocialProfile({workspaceId:ws,leadId:'fb',platform:'facebook',profileUrl:'https://facebook.com/login'}));const id=db.one("select id from social_profiles where lead_id='fb' and platform='facebook'").id;assert.throws(()=>repo.updateSocialProfile(id,{profileUrl:'https://facebook.com/photo.php?id=12345'}));
 });db.close();
 const requests=[],server=createServer((req,res)=>{
  requests.push(req.url);res.setHeader('content-type','text/html');
  if(req.url==='/')res.end('<a href="/contact-us">Contact us</a><a href="/about">About</a><a href="/blog">Blog</a><a href="https://facebook.com/Acme">Facebook</a>');
  else if(req.url==='/contact-us')setTimeout(()=>res.end(html),120);
  else if(req.url==='/about')setTimeout(()=>res.end('<a href="https://youtube.com/channel/UCAbc123">YouTube</a>'),180);
  else if(req.url==='/slow')setTimeout(()=>res.end('late'),1000);else{res.statusCode=404;res.end('missing')}
 });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port,enricher=new WebsiteEnricher();
 try{
  const start=performance.now(),found=await enricher.inspectSocialFast(base),elapsedMs=Math.round(performance.now()-start);
  check('fast crawler reads contact-only links, keeps seven distinct profiles and skips unrelated pages',()=>{assert.equal(found.error,null);assert.equal(found.socials.length,7);assert.equal(found.pagesRead.length,3);assert(!requests.includes('/blog'));assert(elapsedMs<2000,elapsedMs+'ms')});
  const controller=new AbortController();controller.abort();await assert.rejects(enricher.inspectSocialFast(base,controller.signal),{name:'AbortError'});checks.push('pre-cancelled scans stop immediately');
  const during=new AbortController(),pending=enricher.inspectSocialFast(base+'/slow',during.signal);setTimeout(()=>during.abort(),30);await assert.rejects(pending,{name:'AbortError'});checks.push('in-flight cancellation stops network reads');
  const realFetch=global.fetch;global.fetch=async()=>new Response('blocked',{status:403});try{const result=await enricher.inspectSocialFast('https://facebook.com/Acme');assert.equal(result.error,null);assert.equal(result.socials[0].profileUrl,'https://www.facebook.com/Acme');checks.push('blocked platforms retain the supplied known profile without crawling a feed')}finally{global.fetch=realFetch}
  console.log(JSON.stringify({checks:checks.length,elapsedMs,repair:report,passed:true},null,2));
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await enricher.close()}
}
main().catch(error=>{console.error(error);process.exitCode=1});
