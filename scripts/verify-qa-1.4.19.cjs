const assert=require('node:assert/strict')
const {mkdtempSync,writeFileSync}=require('node:fs')
const {tmpdir}=require('node:os')
const {join}=require('node:path')
const {LocalDatabase}=require('../dist-electron/db/local-db.js')
const {Repository}=require('../dist-electron/db/repository.js')
const {EnrichmentRunner}=require('../dist-electron/enrichment/runner.js')
const {WebsiteEnricher}=require('../dist-electron/enrichment/website.js')
const {phoneInfo}=require('../dist-electron/phone-format.js')
const {userError}=require('../dist-electron/user-errors.js')
const {buildFormattedExport}=require('../dist-electron/export/writer.js')
const ExcelJS=require('exceljs')
const {PDFDocument}=require('pdf-lib')
async function main(){
  const folder=mkdtempSync(join(tmpdir(),'mamalead-qa-1919-')),db=new LocalDatabase(join(folder,'leads.db')),repo=new Repository(db),workspace=db.ensureWorkspace().id
  const at=new Date().toISOString()
  const run=repo.saveRun(workspace,{provider:'chromium-maps',status:'done',keywords:['clinic'],location:'Lahore',maxResultsPerKeyword:5,detail:true,durationMs:10000,startedAt:at,finishedAt:at,error:null,leads:[
    {id:'good',name:'Clinic — Lahore',phone:'03001234567',website:'https://good.test',address:'Lahore, Pakistan',rating:4.6,reviewCount:30},
    {id:'failed',name:'Unavailable Clinic',website:'https://failed.test'},
    {id:'empty',name:'Contact Form Only',website:'https://empty.test'},
    {id:'directory',name:'Listed Clinic',website:'https://oladoc.com/pakistan/lahore/clinic'},
  ].map(lead=>({...lead,capturedAt:at,placeRef:lead.id}))})
  const rows=repo.listLeads(workspace,{limit:50}).rows,byName=Object.fromEntries(rows.map(row=>[row.name,row.id]))
  const reads=[]
  const inspect=async website=>{reads.push(website);return {emails:[],phones:website.includes('good.test')?[{value:'+923001234567',page:website,score:90}]:[],socials:[],people:[],pagesRead:[website],error:website.includes('failed.test')?'net::ERR_TIMED_OUT':null}}
  WebsiteEnricher.prototype.inspectPhoneFast=inspect
  WebsiteEnricher.prototype.close=async()=>{}
  repo.importWebsites(workspace,['unrelated-import.test'])
  assert.ok(repo.leadsNeedingContact(workspace,'email',100,run.runId).every(row=>row.website!=='https://unrelated-import.test/'),'automatic enrichment must stay inside its Maps run')
  assert.equal(repo.leadsNeedingContact(workspace,'email',100,run.runId).length,3)
  const job=repo.queueJob(workspace,'phone',rows.map(row=>row.id),{runId:run.runId}),events=[]
  await new EnrichmentRunner(db,repo,{onProgress:p=>events.push(p)}).drain()
  assert.equal(reads.length,3,'directory must never be fetched')
  const outcomes=repo.scanOutcomes(workspace,'phone')
  assert.equal(outcomes[byName['Clinic — Lahore']].status,'found')
  assert.equal(outcomes[byName['Contact Form Only']].status,'not-published')
  assert.equal(outcomes[byName['Unavailable Clinic']].status,'error')
  assert.equal(outcomes[byName['Listed Clinic']].status,'skipped')
  const status=repo.jobStatus(workspace,job.jobId)
  assert.equal(status.processed,4);assert.equal(status.failed,1);assert.equal(Object.keys(status.outcomes).length,4)
  assert.ok(events.some(p=>p.status==='running'&&p.processed>0&&p.processed<4),'per-lead progress')
  assert.ok(events.filter(p=>p.jobId===job.jobId).every(p=>p.runId===run.runId),'activity retains its source run id')
  assert.equal(repo.phoneLedger(workspace).find(row=>row.name==='Clinic — Lahore').lineType,'mobile')
  assert.equal(phoneInfo('03001234567','Lahore, Pakistan').number,'+923001234567')
  assert.equal(phoneInfo('+447911123456').mobile,true)
  assert.equal(repo.phoneSummary(workspace).mobile,1)
  console.log('PASS per-lead failures, empty vs blocked, directory isolation, progress and PK/UK phones')
  repo.saveRun(workspace,{provider:'chromium-maps',status:'failed',keywords:['x'],location:'Lahore',maxResultsPerKeyword:1,detail:true,durationMs:999999,startedAt:at,finishedAt:at,error:'failed',leads:[]})
  assert.equal(repo.runCounts(workspace).medianMs,10000)
  const good=byName['Clinic — Lahore']
  repo.upsertContact({leadId:good,kind:'email',value:'hello@good.test',source:'https://good.test',verified:true,score:95})
  repo.upsertContact({leadId:good,kind:'phone',value:'+924212345678',source:'https://good.test',score:80})
  assert.equal(repo.leadSummary(workspace).withEmail,repo.listLeads(workspace,{filter:'email'}).total)
  assert.equal(repo.leadSummary(workspace).withPhone,repo.listLeads(workspace,{filter:'phone'}).total)
  assert.ok(repo.listLeads(workspace,{}).rows.find(r=>r.id===good).score<100)
  assert.equal(repo.getLead(workspace,good).score,repo.listLeads(workspace,{}).rows.find(r=>r.id===good).score)
  assert.ok(repo.listLeads(workspace,{}).rows.find(r=>r.name==='Contact Form Only').score<50)
  console.log('PASS filter counts, completeness scores, successful-run duration statistics')
  const request={kind:'leads',limit:1,leadIds:[good],columns:['Business name','Phone','Email','Address'],fileName:'qa',delimiter:','}
  const xlsx=await buildFormattedExport(repo,workspace,{...request,format:'xlsx'})
  const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(xlsx.content)
  const sheet=workbook.worksheets[0]
  assert.equal(sheet.getCell('B4').value,'Phone 1');assert.equal(sheet.getCell('C4').value,'Phone 2')
  assert.equal(sheet.getCell('B5').value,'+923001234567');assert.equal(sheet.getCell('A5').value,'Clinic — Lahore')
  assert.ok(xlsx.content.length<200000,'one-row Excel must not embed megabytes of logos')
  const pdf=await buildFormattedExport(repo,workspace,{...request,format:'pdf'})
  assert.equal((await PDFDocument.load(pdf.content)).getPageCount(),1)
  assert.ok(pdf.content.length<150000,'subset font and resized logos should stay small')
  writeFileSync(join(folder,'qa.pdf'),pdf.content);writeFileSync(join(folder,'qa.xlsx'),xlsx.content)
  console.log('PASS branded export layout, separate normalized phone columns, compact PDF/Excel',JSON.stringify({pdf:pdf.content.length,xlsx:xlsx.content.length,folder}))
  assert.doesNotMatch(userError("Error invoking remote method 'billing:activate': Error: fetch failed"),/invoking|fetch failed/)
  assert.match(userError('Executable doesn\'t exist. Please run playwright install'),/latest MamaLead/)
  assert.match(userError('Secure storage is unavailable'),/keychain/)
  assert.doesNotMatch(userError('Website SSL certificate has expired'),/license/)
  db.close()
  const reopened=new LocalDatabase(join(folder,'leads.db'))
  assert.equal(new Repository(reopened).scanOutcomes(workspace,'phone')[byName['Unavailable Clinic']].status,'error');reopened.close()
  console.log('PASS friendly errors and persisted scan failures survive restart')
}
main().catch(error=>{console.error(error);process.exitCode=1})
