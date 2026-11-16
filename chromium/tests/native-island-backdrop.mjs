// The Island's band continues the Start Page's wallpaper (owner, 2026-11-13).
// The page lays its wallpaper out from the window's corner, under the band,
// and the Island host paints the band's slice of the same layers, so the seam
// between them disappears: Sunrise's own wallpaper and your photo (which the
// host reads from the Start Page's storage). Match site colors off returns the
// band to its theme color and the page to its own crop.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import assert from 'node:assert/strict';
import {NativeFixture} from './lib/fixture.mjs';
import {installDriver} from './lib/test-driver.mjs';
import {assertRendering,assertNodeRuntime} from './lib/render-guard.mjs';
import {jsLiteral} from './lib/js-literal.mjs';
import {createWorld} from './world.mjs';
import {inSettings} from './adapters/commands.mjs';
const [configFile,out]=process.argv.slice(2),config=JSON.parse(fs.readFileSync(configFile));
assertNodeRuntime();assert.equal(fs.existsSync(out),false);fs.mkdirSync(out,{recursive:true});
const f=new NativeFixture(),w=createWorld(f),result={candidate:config.candidate,checks:[]};
const parent=fs.mkdtempSync(path.join(os.tmpdir(),'blanc-island-backdrop-'));

// A photo with saturated diagonal bands right up to its top edge: a flat
// band color, or a mirrored one, cannot match it along the seam.
function bandsPng(file,width=1600,height=1000){
 const palette=[[214,64,52],[44,96,214],[38,160,84],[236,184,44],[150,60,190],[20,20,24]];
 const raw=Buffer.alloc((width*3+1)*height);
 for(let y=0;y<height;y++){raw[y*(width*3+1)]=0;for(let x=0;x<width;x++){const c=palette[Math.floor((x+y*1.6)/90)%palette.length],o=y*(width*3+1)+1+x*3;raw[o]=c[0];raw[o+1]=c[1];raw[o+2]=c[2];}}
 const table=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
 const crc=b=>{let c=0xffffffff;for(const x of b)c=table[(c^x)&255]^(c>>>8);return (c^0xffffffff)>>>0;};
 const chunk=(type,data)=>{const t=Buffer.from(type),len=Buffer.alloc(4),sum=Buffer.alloc(4);len.writeUInt32BE(data.length);sum.writeUInt32BE(crc(Buffer.concat([t,data])));return Buffer.concat([len,t,data,sum]);};
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width,0);ihdr.writeUInt32BE(height,4);ihdr[8]=8;ihdr[9]=2;
 fs.writeFileSync(file,Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]));
}

const newStartPage=async()=>{const before=new Set((await f.targets()).map(t=>t.id));await w.call('newTab');
 const t=await w.waitFor(async()=>(await f.targets()).find(t=>t.type==='page'&&/newtab/.test(t.url)&&!before.has(t.id)),Boolean,'a new Start Page',10000);
 const cdp=await f.connectTarget(t);await w.waitFor(()=>cdp.eval(`document.body.classList.contains('layout-ready')`),Boolean,'the Start Page drawn',10000);return cdp;};
// Both sides of the seam, as the page and the host lay them out.
const geometry=page=>Promise.all([
 page.eval(`(()=>{const root=document.documentElement;return {band:getComputedStyle(root).getPropertyValue('--island-band-h').trim(),flag:root.hasAttribute('data-island-band'),
  width:innerWidth,height:innerHeight,layers:[...document.querySelectorAll('.start-wallpaper-layer')].filter(l=>getComputedStyle(l).display!=='none').map(l=>Math.round(l.getBoundingClientRect().top)),
  base:getComputedStyle(document.body,'::before').content};})()`),
 f.host.eval(`(()=>{const box=document.getElementById('bandBackdrop'),strip=document.getElementById('strip').contentDocument;const r=box?.getBoundingClientRect();
  return {shown:document.documentElement.hasAttribute('data-band-backdrop')&&!!box&&!box.hidden,width:r&&Math.round(r.width),height:r&&Math.round(r.height),
   images:[...(box?.children??[])].filter(e=>!e.hidden).map(e=>e.style.backgroundImage),stripClear:strip?.documentElement.hasAttribute('data-band-backdrop')&&getComputedStyle(strip.getElementById('strip')).backgroundColor,
   band:parseFloat(getComputedStyle(document.getElementById('headerBackdrop')).height)};})()`)]);
// The band's last rows and the page's first, compared column by column.
async function seam(page,label){
 const hostShot=(await f.host.send('Page.captureScreenshot',{format:'png'})).data;
 const pageShot=(await page.send('Page.captureScreenshot',{format:'png',clip:{x:0,y:0,width:await page.eval('innerWidth'),height:4,scale:1}})).data;
 const s=await page.eval(`(async()=>{const load=async b=>{const i=new Image();i.src='data:image/png;base64,'+b;await i.decode();const c=document.createElement('canvas');c.width=i.width;c.height=i.height;const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(i,0,0);return {x,w:i.width,h:i.height};};
  const host=await load(${jsLiteral(hostShot)}),pg=await load(${jsLiteral(pageShot)});const at=(img,fx,y)=>[...img.x.getImageData(Math.min(img.w-1,Math.floor(fx*img.w)),y,1,1).data].slice(0,3);
  const diffs=[],spread=[];for(let k=0;k<48;k++){const fx=0.04+k*0.92/47;const a=at(host,fx,host.h-1),b=at(pg,fx,0);diffs.push((Math.abs(a[0]-b[0])+Math.abs(a[1]-b[1])+Math.abs(a[2]-b[2]))/3);spread.push(a);}
  const mean=diffs.reduce((s,d)=>s+d,0)/diffs.length,avg=[0,1,2].map(i=>spread.reduce((s,c)=>s+c[i],0)/spread.length);
  const median=[...diffs].sort((a,b)=>a-b)[diffs.length>>1];
  return {mean,median,max:Math.max(...diffs),variety:Math.sqrt(spread.reduce((s,c)=>s+[0,1,2].reduce((t,i)=>t+(c[i]-avg[i])**2,0),0)/spread.length)};})()`);
 result[label]=s;return s;
}
try{
 await f.launch(config,path.join(parent,'fixture'),{testHooks:true,diskAssets:false});
 await installDriver(f.host);await assertRendering(e=>f.host.eval(e));await w.reset();
 const page=await newStartPage();
 let [p,h]=await w.waitFor(()=>geometry(page),([p,h])=>p.flag&&h.shown,'the band continues the Start Page',10000);
 result.sunrise={page:p,host:h};
 assert.equal(p.band,`${h.band}px`,'the page lays its wallpaper out under the band the host draws');
 assert.ok(p.layers.every(top=>top===-h.band),`the wallpaper layers start at the window's top (${p.layers})`);
 assert.equal(p.base,'""','the body\'s own background is laid out the same way');
 assert.equal(h.width,p.width,'the host lays the layers out at the page\'s width');
 assert.equal(h.height,p.height+h.band,'and over the page\'s height plus the band');
 assert.equal(h.stripClear,'rgba(0, 0, 0, 0)','the strip lets the band show through');
 let s=await seam(page,'sunriseSeam');
 assert.ok(s.mean<6,`Sunrise continues across the seam (mean difference ${s.mean.toFixed(1)})`);
 result.checks.push('Sunrise: the page lays its wallpaper out under the band, the host paints the band\'s slice, and the seam matches');

 // Your photo, chosen as a person would (the file chooser answered here):
 // the host reads it from the Start Page's storage by its key.
 const photo=path.join(parent,'bands.png');bandsPng(photo);
 await page.send('Page.enable');await page.send('Page.setInterceptFileChooserDialog',{enabled:true});
 const chosen=new Promise(resolve=>page.on('Page.fileChooserOpened',resolve));
 const picking=page.eval(`window.bowserPages.start.chooseWallpaper().then(r=>!!r.ok)`,undefined,30000);
 const chooser=await chosen;await page.send('DOM.setFileInputFiles',{files:[photo],backendNodeId:chooser.backendNodeId});
 assert.equal(await picking,true,'the photo is saved');
 [p,h]=await w.waitFor(()=>geometry(page),([p,h])=>h.shown&&h.images.some(i=>i.includes('blob:')),'the band draws your photo',15000);
 result.photo={page:p,host:h};
 assert.ok(h.images.every(i=>!i.includes('blanc-wallpaper:')),'the photo is drawn from the host\'s own copy');
 await new Promise(r=>setTimeout(r,2600)); // the page's 2 s cross-fade
 s=await seam(page,'photoSeam');
 // Under the page's wash the bands are softer; a flat band spreads about 0.
 assert.ok(s.variety>15,`the photo's bands cross the seam (spread ${s.variety.toFixed(1)})`);
 // JPEG ringing at a band's edge can leave a few columns apart; the median
 // column is where a flat or mirrored band would show.
 assert.ok(s.median<6&&s.mean<20,`your photo continues across the seam (median ${s.median.toFixed(1)}, mean ${s.mean.toFixed(1)}, max ${s.max.toFixed(1)})`);
 result.checks.push('your photo: the host reads it from the Start Page\'s storage and the band continues its bands across the seam');

 // Match site colors off: the band takes its theme color again.
 const setColors=on=>inSettings(w,'appearance',async value=>{await new Promise((resolve,reject)=>chrome.settingsPrivate.setPref('blanc.island.site_colors',value,'',ok=>ok?resolve():reject(Error('Preference rejected'))));return {value:true};},on);
 await setColors(false);
 [p,h]=await w.waitFor(()=>geometry(page),([p,h])=>!p.flag&&!h.shown,'the band stops continuing the page',10000);
 assert.equal(h.stripClear,false,'the strip paints its own color again');
 await setColors(true);
 await w.waitFor(()=>geometry(page),([p,h])=>p.flag&&h.shown,'the band continues the page again',10000);
 result.checks.push('Match site colors off returns the band to its theme color and the page to its own crop; on brings the continuation back');
 await assertRendering(e=>f.host.eval(e));result.result='pass';
}catch(error){result.result=error.code==='BLANC_ENVIRONMENT_STOP'?'blocked-environment':'fail';result.error=String(error.stack);process.exitCode=1;}
finally{
 const exit=await f.close();if(exit?.code!==0){result.exit=exit;result.result='fail';process.exitCode=1;}
 if(f.directory&&fs.existsSync(path.join(f.directory,'browser.log')))fs.copyFileSync(path.join(f.directory,'browser.log'),path.join(out,'browser.log'));
 fs.rmSync(parent,{recursive:true,force:true});fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}
