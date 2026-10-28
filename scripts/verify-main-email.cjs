const assert=require('node:assert/strict'),{mkdtempSync}=require('node:fs'),{join}=require('node:path'),{tmpdir}=require('node:os');
const {WebsiteEnricher,publishedPhonesFromHtml,normalisePhone}=require('../dist-electron/enrichment/website.js'),{LocalDatabase}=require('../dist-electron/db/local-db.js'),{Repository}=require('../dist-electron/db/repository.js');
async function main(){
 const realFetch=global.fetch,seen=[];global.fetch=async raw=>{
  const u=new URL(String(raw));seen.push(u.href);
  if(u.pathname==='/robots.txt')return new Response('Sitemap: https://'+u.host+'/sitemap.xml');
  if(u.pathname==='/sitemap.xml')return new Response('<urlset><url><loc>https://'+u.host+'/contact-us</loc></url></urlset>');
  if(u.hostname==='primary.test')return new Response('<a href="mailto:notice@primary.test">Legal</a><a href="mailto:info@primary.test">Contact us</a><a href="mailto:person@primary.test">Team</a>');
  if(u.hostname==='empty.test')return new Response('<h1>A company with a contact form only</h1>');
  if(u.pathname==='/contact-us')return new Response(u.hostname==='gmail.test'?'<a href="mailto:published-business@gmail.com">Email our business</a>':'<a href="mailto:notice@law.test">Legal notice</a><a href="mailto:mark@law.test">Email Mark</a><a href="mailto:steve@law.test">Email Steve</a><header><a href="tel:+442079460123">Call us</a></header>');
  return new Response('<a href="/contact-us">Contact us</a><a href="mailto:notice@law.test">Legal</a>');
 };
 const enricher=new WebsiteEnricher();try{
  const first=await enricher.inspectContactFast('https://primary.test',undefined,true);assert.deepEqual(first.emails.map(e=>e.value),['info@primary.test']);assert.equal(seen.length,1);assert.equal(first.emails[0].page,'https://primary.test/');
  const law=await enricher.inspectContactFast('https://law.test',undefined,true);assert.deepEqual(law.emails.map(e=>e.value),['mark@law.test']);assert.equal(law.emails[0].page,'https://law.test/contact-us');
  const gmail=await enricher.inspectContactFast('https://gmail.test',undefined,true);assert.deepEqual(gmail.emails.map(e=>e.value),['published-business@gmail.com']);
  const empty=await enricher.inspectContactFast('https://empty.test',undefined,true);assert.equal(empty.emails.length,0);assert(!empty.emails.some(e=>e.value==='info@empty.test'));
  const phones=publishedPhonesFromHtml('<header><a href="tel:+442079460123">Call us</a></header>','https://law.test/contact-us');assert.equal(phones[0].score,100);
  for(const ip of ['10.255.255.255','127.255.255.255','169.254.255.255','239.255.255.255'])assert.equal(normalisePhone(ip),'');assert(normalisePhone('410.391.5520'));
 }finally{global.fetch=realFetch;await enricher.close()}
 console.log('PASS one published main email, early stop, Contact page, published Gmail allowed, no guessed fallback, header phone score <=100');
 const db=new LocalDatabase(join(mkdtempSync(join(tmpdir(),'mamalead-main-email-')),'leads.db')),repo=new Repository(db),ws=db.ensureWorkspace().id,at=new Date().toISOString();
 for(const id of ['legacy','rescan','no-email'])db.run('insert into leads (id,workspace_id,name,website,provider,captured_at) values (?,?,?,?,?,?)',[id,ws,id,'https://law.test','import',at]);
 for(const [index,value] of ['notice@law.test','mark@law.test','steve@law.test'].entries())db.run('insert into lead_contacts (id,lead_id,workspace_id,kind,value,source,score,created_at) values (?,?,?,?,?,?,?,?)',['old-'+index,'legacy',ws,'email',value,'https://law.test/contact-us',90,at]);
 repo.addDecisionMaker({workspaceId:ws,leadId:'legacy',fullName:'Mark Scheuerman',title:'Founder',email:'owner@law.test'});repo.upsertContact({leadId:'legacy',kind:'phone',value:'+442079460123',score:105});
 assert.equal(repo.collapseBusinessEmails().removed,2);assert.deepEqual(repo.listContacts(ws,'email',['legacy']).map(r=>r.value),['mark@law.test']);assert.equal(db.one('select count(*) n from email_contact_archive').n,2);assert.equal(db.one('select count(*) n from decision_makers').n,1);assert.equal(repo.listContacts(ws,'phone')[0].score,100);assert.equal(repo.collapseBusinessEmails().removed,0);
 repo.upsertContact({leadId:'rescan',kind:'email',value:'notice@law.test',source:'https://law.test/contact-us'});repo.upsertContact({leadId:'rescan',kind:'email',value:'info@law.test',source:'https://law.test/contact-us'});repo.upsertContact({leadId:'rescan',kind:'email',value:'staff@law.test',source:'https://law.test/team'});assert.deepEqual(repo.listContacts(ws,'email',['rescan']).map(r=>r.value),['info@law.test']);
 repo.replaceMainEmail('rescan',{value:'hello@law.test',page:'https://law.test/contact-us',score:80});assert.deepEqual(repo.listContacts(ws,'email',['rescan']).map(r=>r.value),['hello@law.test']);const row=repo.listContacts(ws,'email',['rescan'])[0];repo.updateEmailValidation(row.id,{status:'valid',verified:true,score:95,message:'Mailbox accepted',provider:'leadsangel'});repo.replaceMainEmail('rescan',{value:'hello@law.test',page:'https://law.test/contact-us',score:70});assert.equal(repo.listContacts(ws,'email',['rescan'])[0].score,95);assert.equal(repo.listContacts(ws,'email',['rescan'])[0].verified,1);
 repo.replaceMainEmail('rescan');assert.equal(repo.listContacts(ws,'email',['rescan']).length,0);assert.equal(repo.listContacts(ws,'email',['no-email']).length,0);db.close();
 console.log('PASS legacy alternatives archived, one active email on upsert/rescan, validation preserved, no-email scans stay blank, owner/phone data unaffected');
}main().catch(e=>{console.error(e);process.exitCode=1});
