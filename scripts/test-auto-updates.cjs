const assert=require('node:assert/strict')
const {EventEmitter}=require('node:events')
const {UpdateManager}=require('../dist-electron/updates.js')
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))
class FakeUpdater extends EventEmitter {
  checks=0;downloads=0;installs=0;fail=false
  setFeedURL(value){this.feed=value}
  async checkForUpdates(){this.checks++;this.emit('checking-for-update');if(this.fail)throw Error('Offline');this.emit('update-available',{version:'1.4.18'})}
  async downloadUpdate(){this.downloads++}
  quitAndInstall(){this.installs++}
}
async function main(){
 let saved={},busy=false,writeFails=false
 const events=[],u=new FakeUpdater()
 const options={updater:u,enabled:true,feedUrl:'https://mamalead.com/updates/windows/',disabledMessage:'Installed app only',readPreferences:()=>saved,savePreferences:p=>{if(writeFails)throw Error('Disk full');saved={...p}},emit:s=>events.push(s),busy:()=>busy,initialDelayMs:10,intervalMs:35}
 const manager=new UpdateManager(options)
 manager.start()
 try {
  await pause(25)
  assert.ok(u.checks>=1);assert.equal(manager.status().state,'available');assert.equal(u.downloads,0)
  assert.equal(u.allowDowngrade,false);assert.equal(u.allowPrerelease,false);assert.equal(u.autoInstallOnAppQuit,false)
  await pause(45);assert.ok(u.checks>=2,'app periodically checks while open even when downloads are off')
  assert.ok(saved.lastCheckedAt)
  manager.setAutoDownload(true)
  assert.equal(u.downloads,1);assert.equal(saved.autoDownload,true);assert.equal(u.autoDownload,false);assert.equal(u.autoInstallOnAppQuit,true)
  await Promise.all([manager.check(),manager.download()]);assert.equal(u.downloads,1)
  u.emit('download-progress',{percent:41.6});assert.equal(manager.status().percent,42)
  u.emit('update-downloaded',{version:'1.4.18'});assert.equal(manager.status().state,'ready');assert.equal(u.installs,0,'never restarts automatically')
  busy=true;assert.equal(manager.install().started,false);assert.match(manager.status().message,/current scan/)
  manager.setAutoDownload(false);assert.equal(u.autoInstallOnAppQuit,false);assert.equal(saved.autoDownload,false)
  busy=false;assert.equal(manager.install().started,true);assert.equal(u.installs,1);assert.equal(manager.install().started,false)
  assert.ok(events.some(s=>s.state==='available'));assert.ok(events.some(s=>s.state==='ready'))
 } finally {manager.dispose()}
 const count=u.checks;await pause(45);assert.equal(u.checks,count,'disposing cancels polling')
 const reboot=new UpdateManager({...options,updater:new FakeUpdater(),readPreferences:()=>({autoDownload:true,lastCheckedAt:saved.lastCheckedAt}),initialDelayMs:60000,intervalMs:60000})
 reboot.start();assert.equal(reboot.status().autoDownload,true);assert.ok(reboot.status().lastCheckedAt)
 writeFails=true;assert.throws(()=>reboot.setAutoDownload(false),/Disk full/);assert.equal(reboot.status().autoDownload,true);writeFails=false;reboot.dispose()
 const bad=new UpdateManager({...options,readPreferences:()=>({autoDownload:'true',lastCheckedAt:'bad date'})})
 assert.equal(bad.status().autoDownload,false);assert.equal(bad.status().lastCheckedAt,null);assert.throws(()=>bad.setAutoDownload('true'),/on or off/)
 const offlineUpdater=new FakeUpdater();offlineUpdater.fail=true
 const offline=new UpdateManager({...options,updater:offlineUpdater,initialDelayMs:60000,intervalMs:60000})
 offline.start();await offline.check();assert.equal(offline.status().state,'error');offlineUpdater.fail=false;await offline.check();assert.equal(offline.status().state,'available');offline.dispose()
 const disabled=new UpdateManager({...options,updater:new FakeUpdater(),enabled:false})
 disabled.start();await disabled.check();disabled.setAutoDownload(true);assert.equal(disabled.status().state,'disabled');assert.equal(disabled.status().enabled,false);disabled.dispose()
 console.log('PASS automatic startup and periodic checks, opt-in downloads, persistence, progress, no duplicate download, no forced restart, busy guard, quit-install preference, error retry, disabled build and timer cleanup')
}
main().catch(error=>{console.error(error);process.exitCode=1})
