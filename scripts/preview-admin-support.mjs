import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
const dir=resolve('admin-dashboard');
const html=readFileSync(resolve(dir,'index.html'),'utf8')
 .replace("return (this.props.dataSource ?? 'live') === 'fixture';","return true;")
 .replace("view: 'overview', q: ''","view: 'support', q: ''")
 .replace(/this\.load\(\);\s+if \(!this\.isFixture\(\)\)/, 'this.load();this.supportLoad(); if (!this.isFixture())');
createServer((req,res)=>{
 const path=new URL(req.url,'http://localhost').pathname;
 if(path==='/admin/'||path==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);return}
 const name=path.replace(/^\/admin\//,'');
 if(!['support.js','vendor/react.production.min.js','vendor/react-dom.production.min.js','vendor/babel.min.js'].includes(name)){res.writeHead(404);res.end();return}
 try{res.setHeader('Content-Type','application/javascript');res.end(readFileSync(resolve(dir,name)))}catch{res.writeHead(404);res.end()}
}).listen(8812,'127.0.0.1',()=>console.log('Local sample-data preview: http://127.0.0.1:8812/admin/ — no live APIs or customer emails.'));
