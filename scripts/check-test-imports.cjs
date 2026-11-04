// Resolve imports without executing tests (some tests deliberately launch browsers).
const fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module')
const ts=require('typescript')
const failures=[];let checked=0
for(const name of fs.readdirSync(__dirname).filter(name=>/^test-.*\.cjs$/.test(name))){
 const file=path.join(__dirname,name),resolve=createRequire(file).resolve
 const source=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.JS)
 const visit=node=>{
  if(ts.isStringLiteralLike(node)&&node.text.startsWith('../dist-electron/')){
   checked++
   try{resolve(node.text)}catch{
    const line=source.getLineAndCharacterOfPosition(node.getStart()).line+1
    failures.push(`${name}:${line} missing ${node.text}`)
   }
  }
  ts.forEachChild(node,visit)
 }
 visit(source)
}
if(failures.length){console.error(failures.join('\n')+'\nRun npm run build before this check. Retired feature tests belong in the restore archive.');process.exitCode=1}
else console.log(`PASS ${checked} desktop test imports resolve`)
