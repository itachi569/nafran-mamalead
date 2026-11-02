import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {readFileSync,mkdirSync} from 'node:fs'
import {resolve,join} from 'node:path'
import {chromium} from 'playwright'
const out=resolve('screenshots/qa-1.4.31/admin');mkdirSync(out,{recursive:true})
const html=readFileSync('admin-dashboard/index.html','utf8').replace("return (this.props.dataSource ?? 'live') === 'fixture';","return true;")
const server=createServer((req,res)=>{res.setHeader('content-type',req.url.endsWith('.js')?'application/javascript':'text/html');res.end(req.url.endsWith('.js')?readFileSync('admin-dashboard/'+req.url.slice('/admin/'.length)):html)})
await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true})
try {
 const page=await browser.newPage({viewport:{width:1440,height:950}}),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log('UI ERROR',e.message)});page.on('console',m=>{if(m.type()==='error')console.log(m.text())})
 await page.goto('http://127.0.0.1:'+server.address().port+'/admin/');
 await page.getByRole('button',{name:'View previous history',exact:true}).waitFor();
 assert.match(await page.getByRole('region',{name:'Activity reporting period'}).innerText(),/Activity from/);
 assert.match(await page.getByRole('region',{name:'Customer activity',exact:true}).innerText(),/0 total downloads/);
 await page.getByRole('button',{name:'View previous history',exact:true}).click();
 assert.match(await page.getByRole('region',{name:'Activity reporting period'}).innerText(),/Previous history/);
 assert.match(await page.getByRole('region',{name:'Customer activity',exact:true}).innerText(),/1 total downloads/);
 await page.getByRole('button',{name:'Back to current reporting',exact:true}).click();
 assert.match(await page.getByRole('region',{name:'Customer activity',exact:true}).innerText(),/0 total downloads/);
 for(const section of ['Overview','Revenue','Users','Purchases']){
  await page.getByRole('button',{name:section,exact:true}).click();
  assert.doesNotMatch(await page.locator('body').innerText(),/Decision Maker|Decision pass|Add-on active|with add-on/i);
  await page.screenshot({path:join(out,'admin-'+section.toLowerCase()+'.png'),fullPage:true});
 }
 await page.getByRole('button',{name:'Support',exact:true}).click()
 await page.getByText('Export needs a second try',{exact:true}).waitFor({timeout:8000}).catch(async e=>{console.log(await page.locator('body').innerText());await page.screenshot({path:join(out,'admin-debug.png'),fullPage:true});throw e});assert.match(await page.locator('.support-pager').innerText(),/Showing 1–1 of 1/)
 assert.match(await page.getByRole('button',{name:'Needs reply messages',exact:true}).innerText(),/1/);await page.locator('.support-table').getByRole('button',{name:/Reply to Sarah Ahmed/}).click()
 await page.getByRole('heading',{name:'Sarah Ahmed',exact:true}).waitFor();assert.match(await page.getByRole('button',{name:'Needs reply messages',exact:true}).innerText(),/1/)
 await page.getByLabel('Reply to s••••@example.test').fill('Thanks for reporting this. Please try the latest app update.')
 await page.getByRole('button',{name:'Review reply',exact:true}).click();await page.getByRole('dialog').waitFor();await page.getByRole('button',{name:'Keep editing'}).click()
 await page.getByRole('button',{name:'Review reply',exact:true}).click();await page.getByRole('button',{name:'Send reply',exact:true}).click()
 await page.getByText('Your reply',{exact:true}).waitFor();assert.match(await page.getByRole('button',{name:'Needs reply messages',exact:true}).innerText(),/0/);await page.getByText('Email sent',{exact:false}).first().waitFor();assert.equal(await page.getByLabel('Reply status',{exact:true}).inputValue(),'replied')
 await page.getByText('Private notes & technical details',{exact:true}).click();await page.getByLabel('Internal note',{exact:true}).fill('Check the export formatting in the next regression run.')
 await page.getByRole('button',{name:'Add internal note'}).click();await page.locator('.support-thread').getByText('Internal note',{exact:true}).waitFor()
 await page.screenshot({path:join(out,'admin-ticket.png'),fullPage:true})
 await page.getByRole('button',{name:'Close ticket view'}).click();await page.getByRole('button',{name:'All messages',exact:true}).click();await page.getByText('Showing 1–3 of 3',{exact:true}).waitFor()
 await page.getByLabel('Search the current view').fill('DEMO02');await page.getByText('Showing 1–1 of 1',{exact:true}).waitFor();assert.equal(await page.locator('.support-table tbody tr').count(),1)
 await page.getByLabel('Search the current view').fill('');await page.getByText('Showing 1–3 of 3',{exact:true}).waitFor();await page.screenshot({path:join(out,'admin-inbox.png'),fullPage:true})
 await page.setViewportSize({width:600,height:850});await page.getByRole('navigation').getByRole('button',{name:/Support/}).waitFor();await page.screenshot({path:join(out,'admin-mobile.png'),fullPage:true})
 assert.deepEqual(errors,[]);console.log('PASS admin without retired Decision Maker controls; support UI: fixture list, filters, live search, detail, reply confirmation, reply, internal note, mobile navigation and no renderer errors')
}finally{await browser.close();await new Promise(r=>server.close(r))}
