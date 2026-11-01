const {join}=require('node:path')

/** Let the installed Electron package choose its platform-specific source executable. */
function electronTestExecutable(packaged=false){
  if(!packaged)return require('electron')
  const configured=process.env.MAMALEAD_TEST_EXE||process.env.MAMALEAD_TEST_EXECUTABLE
  if(configured)return configured
  if(process.platform==='win32')return join(__dirname,'../release/win-unpacked/MamaLead.exe')
  throw new Error('Set MAMALEAD_TEST_EXE to the packaged app executable when using --packaged on this platform.')
}
module.exports={electronTestExecutable}
