const fs=require('node:fs'),path=require('node:path')
const failures=[]
function scan(directory){
  for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
    const file=path.join(directory,entry.name)
    if(entry.isDirectory())scan(file)
    else if(/\.(?:[cm]?js|tsx?)$/.test(entry.name)){
      fs.readFileSync(file,'utf8').split(/\r?\n/).forEach((line,index)=>{
        if(/\belectron[.]exe\b/i.test(line))failures.push(path.relative(__dirname,file)+':'+(index+1))
      })
    }
  }
}
scan(__dirname)
if(failures.length){console.error('Windows-only Electron executable paths found:\n'+failures.join('\n'));process.exitCode=1}
else console.log('PASS source UI scripts use platform-independent Electron executable resolution')
