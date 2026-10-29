const assert=require('node:assert/strict')
const {mkdtempSync}=require('node:fs')
const {join}=require('node:path')
const {tmpdir}=require('node:os')
const {DatabaseSync}=require('node:sqlite')
const {LocalDatabase}=require('../dist-electron/db/local-db.js')
const {Repository}=require('../dist-electron/db/repository.js')
const {buildExport}=require('../dist-electron/export/writer.js')
const file=join(mkdtempSync(join(tmpdir(),'mamalead-owner-evidence-')),'leads.db')
let db=new LocalDatabase(file),repo=new Repository(db)
const workspaceId=db.ensureWorkspace().id
const leadId=repo.importWebsites(workspaceId,['https://northstar.test'],false).leadIds[0]
const input={workspaceId,leadId,fullName:'Janet Cole',title:'Founder',email:'janet@northstar.test',source:'https://northstar.test/about'}
const id=repo.addDecisionMaker(input).id
db.close()
// Recreate the previous release's schema with a real saved contact, then upgrade in place.
const legacy=new DatabaseSync(file)
legacy.exec('alter table decision_makers drop column email_evidence')
legacy.close()
db=new LocalDatabase(file);repo=new Repository(db)
try {
  assert.equal(repo.decisionMakerLedger(workspaceId)[0].id,id)
  assert.equal(repo.decisionMakerLedger(workspaceId)[0].email_evidence,'page')
  repo.addDecisionMaker({...input,source:'https://directory.test/janet',emailEvidence:'search-index',replaceEmail:true})
  assert.equal(repo.decisionMakerLedger(workspaceId)[0].email_evidence,'search-index')
  repo.addDecisionMaker({...input,email:'',source:'',replaceEmail:false})
  const kept=repo.decisionMakerLedger(workspaceId)[0]
  assert.equal(kept.email,input.email)
  assert.equal(kept.email_evidence,'search-index')
  assert.equal(kept.source,'https://directory.test/janet')
  const exported=buildExport(repo,workspaceId,{kind:'people',limit:1,leadIds:[leadId],columns:['Owner','Owner email','Email evidence','Source'],delimiter:'csv',fileName:'owners.csv'})
  assert.match(exported.body,/Search index; live page unavailable/)
  repo.addDecisionMaker({...input,replaceEmail:true})
  assert.equal(repo.decisionMakerLedger(workspaceId)[0].email_evidence,'page')
  repo.addDecisionMaker({...input,email:'',replaceEmail:true})
  assert.equal(repo.decisionMakerLedger(workspaceId)[0].email,'')
  assert.equal(repo.decisionMakerLedger(workspaceId).length,1)
  console.log(JSON.stringify({passed:true,checks:['legacy contact survives additive migration','indexed evidence persists across incomplete retries','exports preserve the weaker evidence label','readable page upgrades evidence and a completed empty rescan clears it','rescans retain one contact identity'],customerDatabaseAccess:false},null,2))
} finally {db.close()}
