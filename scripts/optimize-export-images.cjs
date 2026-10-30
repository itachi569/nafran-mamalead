// Run once with Electron when source logo artwork changes. Assets remain usable in Node tests.
const {app,nativeImage}=require('electron')
const {writeFileSync}=require('node:fs')
const {resolve}=require('node:path')
app.whenReady().then(()=>{
  for(const [source,target,width,jpeg] of [
    ['mamalead-original.jpeg','mamalead-print.jpeg',500,true],
    ['mamalead-logo.png','mamalead-header.png',240,false],
    ['mamalead-watermark.png','mamalead-sheet.png',360,false],
  ]){
    const image=nativeImage.createFromPath(resolve('electron/export/assets',source)).resize({width})
    if(image.isEmpty())throw new Error('Could not read '+source)
    const data=jpeg?image.toJPEG(78):image.toPNG()
    writeFileSync(resolve('electron/export/assets',target),data)
    console.log(target+': '+data.length+' bytes')
  }
  app.quit()
}).catch(error=>{console.error(error);app.exit(1)})
