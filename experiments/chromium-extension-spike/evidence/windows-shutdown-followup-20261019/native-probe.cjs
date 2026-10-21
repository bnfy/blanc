const {app,BrowserWindow}=require('electron');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'blanc-helper-probe-'));
app.setPath('userData',profile);
app.on('will-quit',()=>fs.rmSync(profile,{recursive:true,force:true}));
const variant=process.argv[2] || 'display-capture-broker';
const {attachHelperWindow,createHelperAuthority}=require(path.join(process.cwd(),'src/main',variant));
process.on('uncaughtException',e=>{console.error(e.stack);app.exit(1)});
app.whenReady().then(()=>{
 const win=attachHelperWindow({BrowserWindow,authority:createHelperAuthority(),lockPrivilegedNavigation:()=>{}});
 win.webContents.on('did-fail-load',()=>{});
 setTimeout(()=>{win.destroy();setTimeout(()=>{console.log(variant+': destroy passed');app.quit()},500)},1000);
});
