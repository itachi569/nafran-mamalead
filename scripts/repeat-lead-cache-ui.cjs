const {spawnSync}=require('node:child_process'),path=require('node:path')
for(let attempt=1;attempt<=5;attempt++){
 console.log(`Cache UI run ${attempt}/5 (new isolated profile)`)
 const result=spawnSync(process.execPath,[path.join(__dirname,'verify-lead-cache-ui.cjs'),...process.argv.slice(2)],{stdio:'inherit',timeout:180000})
 if(result.error||result.status!==0){console.error(result.error||`Cache UI run ${attempt} failed (${result.status})`);process.exit(1)}
}
console.log('PASS cache UI 5/5 consecutive runs')
