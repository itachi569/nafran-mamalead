const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path')
const asar=require('@electron/asar')
const directory=path.dirname(process.env.MAMALEAD_TEST_EXE||'')
assert.ok(process.env.MAMALEAD_TEST_EXE,'Set MAMALEAD_TEST_EXE')
const archive=path.join(directory,'resources/app.asar')
const entries=asar.listPackage(archive)
const forbidden=entries.filter(name=>/(^|[\\/])(?:\.secrets|secrets|userdata|user-data|test-results|screenshots)([\\/]|$)|\.(?:db|sqlite|sqlite3|env|enc)$|license_info_\d+|billing-installation.*\.enc$/i.test(name))
assert.deepEqual(forbidden,[],'No saved user data or credential files in the installer')
const raw=fs.readFileSync(archive),privateConfig=path.resolve('.secrets/mamalead-turnstile.env')
let secretChecked=false
if(fs.existsSync(privateConfig)) {
  const line=fs.readFileSync(privateConfig,'utf8').split(/\r?\n/).find(line=>/^TURNSTILE_SECRET_KEY=/.test(line))
  assert.ok(line,'Expected private Turnstile secret')
  const value=line.slice(line.indexOf('=')+1).trim().replace(/^['"]|['"]$/g,'')
  assert.ok(value.length>20)
  assert.equal(raw.includes(Buffer.from(value)),false,'Private server secret must not be packaged')
  secretChecked=true
}
const result={passed:true,archiveEntries:entries.length,noUserDatabase:true,noCredentialFiles:true,privateServerSecretExcluded:secretChecked}
if(process.env.MAMALEAD_QA_OUTPUT){fs.mkdirSync(process.env.MAMALEAD_QA_OUTPUT,{recursive:true});fs.writeFileSync(path.join(process.env.MAMALEAD_QA_OUTPUT,'package-clean.json'),JSON.stringify(result,null,2))}
console.log(JSON.stringify(result))
