// C2a / F49: Customize's Your image, Wash and Fade, including a new Start
// Page after a same-profile relaunch. The fork has one layout with widgets.
// Shipping pin 8a4e57e78: src/main/settings.js:238-242 (Auto, Fade 100),
// src/main/wallpaper-model.js:7-26 (Wash choices and Fade percent),
// src/main/wallpaper.js:74-81 (PNG decoding/re-encoding) and
// src/main/wallpaper-model.js:15 (JPEG quality 85).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {NativeFixture} from './lib/fixture.mjs';
import {installDriver} from './lib/test-driver.mjs';
import {assertRendering,assertNodeRuntime} from './lib/render-guard.mjs';
import {jsLiteral} from './lib/js-literal.mjs';
import {createWorld} from './world.mjs';
const [configFile,out]=process.argv.slice(2),config=JSON.parse(fs.readFileSync(configFile));
assertNodeRuntime();assert.equal(fs.existsSync(out),false,'expected a new output folder; found an existing folder');fs.mkdirSync(out,{recursive:true});
const f=new NativeFixture(),w=createWorld(f),result={candidate:config.candidate,checks:[]};
const parent=fs.mkdtempSync(path.join(os.tmpdir(),'blanc-recheck-f49-'));
const visible=()=>assertRendering(e=>f.host.eval(e));

// PNG encoder and file-chooser CDP calls follow native-island-backdrop.mjs.
// This small synthetic input is generated only inside this run's output.
function bandsPng(file,width=64,height=40){
 const palette=[[214,64,52],[44,96,214],[38,160,84],[236,184,44]];
 const raw=Buffer.alloc((width*3+1)*height);
 for(let y=0;y<height;y++){raw[y*(width*3+1)]=0;for(let x=0;x<width;x++){const c=palette[Math.floor((x+y)/8)%palette.length],o=y*(width*3+1)+1+x*3;raw[o]=c[0];raw[o+1]=c[1];raw[o+2]=c[2];}}
 const table=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
 const crc=b=>{let c=0xffffffff;for(const x of b)c=table[(c^x)&255]^(c>>>8);return (c^0xffffffff)>>>0;};
 const chunk=(type,data)=>{const t=Buffer.from(type),len=Buffer.alloc(4),sum=Buffer.alloc(4);len.writeUInt32BE(data.length);sum.writeUInt32BE(crc(Buffer.concat([t,data])));return Buffer.concat([len,t,data,sum]);};
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width,0);ihdr.writeUInt32BE(height,4);ihdr[8]=8;ihdr[9]=2;
 fs.writeFileSync(file,Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]));
}
const newStartPage=async()=>{const before=new Set((await f.targets()).map(t=>t.id));await w.call('newTab');
 const t=await w.waitFor(async()=>(await f.targets()).find(t=>t.type==='page'&&/newtab/.test(t.url)&&!before.has(t.id)),Boolean,'F49 expected a new Start Page target',10000).catch(e=>assert.fail(e.message));
 const cdp=await f.connectTarget(t);await w.waitFor(()=>cdp.eval(`document.body.classList.contains('layout-ready')`),Boolean,'F49 expected the Start Page drawn',10000).catch(e=>assert.fail(e.message));return cdp;};
const read=cdp=>cdp.eval(`(()=>{const saved=JSON.parse(localStorage.getItem('blanc.prototype.start.preferences.v1')||'{}').wallpaper;
 const layer=[...document.querySelectorAll('.start-wallpaper-layer')].find(l=>l.classList.contains('is-visible')&&l.dataset.wallpaperPhase==='custom');
 const css=layer&&getComputedStyle(layer);return {source:wallpaperState.source,image:wallpaperState.image,hasImage:wallpaperState.hasImage,
  style:wallpaperState.style,wash:wallpaperState.wash,savedStyle:saved?.style,savedWash:saved?.wash,
  appliedStyle:document.body.dataset.wallpaperStyle,appliedWash:getComputedStyle(document.body).getPropertyValue('--start-wallpaper-wash').trim(),
  stylePick:document.querySelector('[data-wallpaper-style-pick="light"]').getAttribute('aria-pressed'),
  fade:Number(document.getElementById('customWallpaperWash').value),
  drawn:!!layer&&layer.dataset.wallpaperImage===wallpaperState.image&&css.backgroundImage.includes(wallpaperState.image)&&Number(css.opacity)===1,
  error:document.getElementById('customWallpaperError').hidden?null:document.getElementById('customWallpaperError').textContent};})()`);
// Compare pixels, rather than blob URLs (which belong to one document).
// An independently decoded input is re-encoded at shipping's JPEG quality;
// the source is deliberately below shipping's 3840px no-enlargement bound
// (src/main/wallpaper-model.js:14-15,54-59 at the pin).
const pixels=async(cdp,source=null)=>{
 const data=await cdp.eval(`(async()=>{const img=new Image();img.src=${source?jsLiteral(source):'wallpaperState.image'};await img.decode();
  const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);
  ${source?`const jpeg=new Image();jpeg.src=c.toDataURL('image/jpeg',85/100);await jpeg.decode();ctx.clearRect(0,0,c.width,c.height);ctx.drawImage(jpeg,0,0);`:''}
  return {width:c.width,height:c.height,pixels:[...ctx.getImageData(0,0,c.width,c.height).data]};})()`);
 return {width:data.width,height:data.height,sha256:crypto.createHash('sha256').update(Buffer.from(data.pixels)).digest('hex')};
};
try{
 await f.launch(config,path.join(parent,'fixture'),{testHooks:true,diskAssets:false});await installDriver(f.host);await visible();await w.reset();
 const page=await newStartPage();
 const controls=await page.eval(`(()=>{const p=document.getElementById('customizePopover');if(!p.matches(':popover-open'))document.getElementById('customizeButton').click();
  const b=document.getElementById('customWallpaperToggle');return {open:p.matches(':popover-open'),enabled:!b.disabled,source:wallpaperState.source,style:wallpaperState.style,wash:wallpaperState.wash};})()`);
 assert.deepEqual(controls,{open:true,enabled:true,source:'sunrise',style:'auto',wash:100},`F49 expected Customize open, Your image enabled, Sunrise/Auto/Fade 100; found ${JSON.stringify(controls)}`);
 const photo=path.resolve(out,'wallpaper.png');bandsPng(photo);
 const expectedPixels=await pixels(page,'data:image/png;base64,'+fs.readFileSync(photo).toString('base64'));
 await page.send('Page.enable');await page.send('Page.setInterceptFileChooserDialog',{enabled:true});
 let chooser;page.on('Page.fileChooserOpened',event=>{chooser=event;});
 await page.eval(`document.getElementById('customWallpaperToggle').click(),1`);
 await w.waitFor(()=>chooser,Boolean,'F49 expected Your image to open the intercepted file chooser',10000).catch(e=>assert.fail(e.message));
 assert.ok(chooser.backendNodeId,`F49 expected a file-input backendNodeId; found ${JSON.stringify(chooser)}`);
 await page.send('DOM.setFileInputFiles',{files:[photo],backendNodeId:chooser.backendNodeId});
 let d=await w.waitFor(()=>read(page),d=>d.source==='custom'&&d.hasImage&&d.drawn,'F49 expected the chosen image drawn as the custom wallpaper',10000).catch(e=>assert.fail(e.message));
 assert.equal(d.error,null,`F49 expected no import error; found ${JSON.stringify(d.error)}`);
 const imported=await pixels(page);
 assert.deepEqual(imported,expectedPixels,`F49 expected the generated PNG's decoded JPEG pixels ${JSON.stringify(expectedPixels)}; found ${JSON.stringify(imported)}`);
 result.checks.push('Your image in Customize imports the output-folder PNG and draws its decoded image on the Start Page');

 const tuning=await page.eval(`(()=>{const shown=e=>!e.hidden&&getComputedStyle(e).display!=='none'&&e.getBoundingClientRect().height>0;
  const style=document.querySelector('[data-wallpaper-style-pick="light"]'),fade=document.getElementById('customWallpaperWash');
  return {wash:shown(style)&&!style.disabled,fade:shown(fade)&&!fade.disabled};})()`);
 assert.deepEqual(tuning,{wash:true,fade:true},`F49 expected visible, enabled Wash and Fade controls for Your image; found ${JSON.stringify(tuning)}`);
 await page.eval(`document.querySelector('[data-wallpaper-style-pick="light"]').click(),1`);
 d=await w.waitFor(()=>read(page),d=>d.savedStyle==='light'&&d.style==='light'&&d.appliedStyle==='light'&&d.stylePick==='true','F49 expected Wash Light saved, selected and applied',8000).catch(e=>assert.fail(e.message));
 assert.notEqual(d.style,controls.style,`F49 expected Wash to change from ${controls.style}; found ${d.style}`);
 result.checks.push('the Wash Light control changes and stores the wash style and applies it to the page');

 // Zero is a shipping-supported Fade endpoint, distinct from its 100 default
 // (src/main/wallpaper-model.js:21-26); use the real input/change handlers.
 await page.eval(`(()=>{const s=document.getElementById('customWallpaperWash');s.value='0';s.dispatchEvent(new Event('input',{bubbles:true}));s.dispatchEvent(new Event('change',{bubbles:true}));return 1;})()`);
 d=await w.waitFor(()=>read(page),d=>d.savedWash===0&&d.wash===0&&d.fade===0&&d.appliedWash==='0','F49 expected Fade 0 saved and applied as wash multiplier 0',8000).catch(e=>assert.fail(e.message));
 result.checks.push('the Fade slider changes from 100 to 0, stores 0 and applies the zero wash multiplier');

 await w.relaunch();await visible();
 const next=await newStartPage();
 d=await w.waitFor(()=>read(next),d=>d.source==='custom'&&d.hasImage&&d.drawn,'F49 expected the custom image drawn on a new Start Page after relaunch',10000).catch(e=>assert.fail(e.message));
 const kept={style:d.style,savedStyle:d.savedStyle,appliedStyle:d.appliedStyle,selected:d.stylePick,wash:d.wash,savedWash:d.savedWash,fade:d.fade,multiplier:d.appliedWash};
 assert.deepEqual(kept,{style:'light',savedStyle:'light',appliedStyle:'light',selected:'true',wash:0,savedWash:0,fade:0,multiplier:'0'},`F49 expected Wash Light and Fade 0 stored, selected and applied after relaunch; found ${JSON.stringify(kept)}`);
 const restored=await pixels(next);
 assert.deepEqual(restored,imported,`F49 expected the same image pixels after relaunch ${JSON.stringify(imported)}; found ${JSON.stringify(restored)}`);
 result.checks.push('a new Start Page after same-profile relaunch draws the same image with Wash Light and Fade 0');
 await visible();result.result='pass';
}catch(error){result.result=error.code==='BLANC_ENVIRONMENT_STOP'?'blocked-environment':'fail';result.error=String(error.stack);process.exitCode=1;}
finally{
 const exit=await f.close();if(exit?.code!==0){result.exit=exit;result.result='fail';process.exitCode=1;}
 if(f.directory&&fs.existsSync(path.join(f.directory,'browser.log')))fs.copyFileSync(path.join(f.directory,'browser.log'),path.join(out,'browser.log'));
 fs.rmSync(parent,{recursive:true,force:true});fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}
