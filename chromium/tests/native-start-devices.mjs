// The Start Page's On your other devices card (fork redesign): a column fits
// between the header and the footer however many tabs it lists (the list
// scrolls inside the card), a tall card is carried as a short preview, a
// finger swipe scrolls the list, the scrollbar shows on hover and while
// scrolling only, and a row taking focus never freezes the page.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {NativeFixture} from './lib/fixture.mjs';
import {installDriver} from './lib/test-driver.mjs';
import {assertRendering,assertNodeRuntime} from './lib/render-guard.mjs';
import {createWorld} from './world.mjs';
const [configFile,out]=process.argv.slice(2),config=JSON.parse(fs.readFileSync(configFile));
assertNodeRuntime();assert.equal(fs.existsSync(out),false);fs.mkdirSync(out,{recursive:true});
const f=new NativeFixture(),w=createWorld(f),result={candidate:config.candidate,checks:[]};
const parent=fs.mkdtempSync(path.join(os.tmpdir(),'blanc-devices-'));
const tabs=(n,host)=>Array.from({length:n},(_,i)=>({url:`https://${host}/p${i}`,title:`Page ${i+1} on ${host}`}));
const DEVICES=[{deviceId:'a',name:'MacBook Pro',platform:'darwin',tabs:tabs(30,'blanc.day')},
 {deviceId:'b',name:'iPhone Air',platform:'ios',tabs:tabs(23,'bnfy.me')},{deviceId:'c',name:'Android',platform:'android',tabs:tabs(5,'example.com')}];
try{
 await f.launch(config,path.join(parent,'fixture'),{testHooks:true,diskAssets:process.env.DISK_ASSETS==="1"});
 await installDriver(f.host);await assertRendering(e=>f.host.eval(e));await w.reset();
 await w.call('setWindowContentSize',1600,960);await w.call('newTab');
 const target=await w.waitFor(async()=>(await f.targets()).find(t=>t.type==='page'&&/newtab/.test(t.url)),Boolean,'the Start Page',10000);
 const page=await f.connectTarget(target);
 await w.waitFor(()=>page.eval("document.body.classList.contains('layout-ready')"),Boolean,'the Start Page ready',10000);
 for(const name of ['devices','chart'])await page.eval(`window.bowserPages.start.setWidget(${JSON.stringify(name)},true).then(()=>1)`);
 await page.eval(`window.bowserPages.start.setWidgetPlace(['favorites','sent'],['devices','chart']).then(()=>1)`);
 // This profile has no synced devices: the page draws these three itself.
 const draw=()=>page.eval(`(()=>{const r=document.querySelector('.tally-right');if(r)r.hidden=false;remoteExpanded.add('a');renderRemote(${JSON.stringify(DEVICES)});return 1;})()`);
 await draw();await new Promise(r=>setTimeout(r,500));
 const fit=await page.eval(`(()=>{const rail=document.getElementById('bbRailRight').getBoundingClientRect(),foot=document.getElementById('layoutFooter').getBoundingClientRect(),list=document.getElementById('remoteList');
  return {railBottom:rail.bottom,footerTop:foot.top,listHeight:list.clientHeight,listContent:list.scrollHeight,fadeEnd:list.dataset.fadeEnd};})()`);
 result.fit=fit;
 assert.ok(fit.railBottom<=fit.footerTop,'the column ends above the footer');
 assert.ok(fit.listContent>fit.listHeight+200&&fit.fadeEnd==='true','the list scrolls inside its card, faded at the end');
 result.checks.push('with 58 tabs and the chart in one column, the column ends above the footer and the list scrolls inside its card');
 // Carry the devices card by its grip.
 const grip=await page.eval(`(()=>{const b=document.querySelector('#remoteSection .bb-widget-grip').getBoundingClientRect();return {x:b.left+b.width/2,y:b.top+b.height/2};})()`);
 await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:grip.x,y:grip.y});
 await page.send('Input.dispatchMouseEvent',{type:'mousePressed',x:grip.x,y:grip.y,button:'left',buttons:1,clickCount:1});
 for(let i=1;i<=12;i++)await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:grip.x-i*100,y:grip.y+i*10,button:'left',buttons:1});
 const carried=await page.eval(`({card:document.getElementById('remoteSection').offsetHeight,clipped:document.getElementById('remoteSection').classList.contains('drag-clipped'),holder:document.querySelector('.bb-widget-holder').offsetHeight})`);
 result.carried=carried;
 assert.ok(carried.clipped&&carried.card<=220&&carried.holder<=220,'a tall card is carried as a short preview over a short slot');
 await page.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:grip.x-1200,y:grip.y+120,button:'left',buttons:0,clickCount:1});
 await w.waitFor(()=>page.eval(`[...document.getElementById('bbRailLeft').children].some(c=>c.dataset.card==='devices')`),Boolean,'the card in the left column',5000);
 result.checks.push('a tall card is carried as a short preview over a slot as short, and lands in the other column');
 await draw();await new Promise(r=>setTimeout(r,400));
 // A row taking focus leaves the page responsive (the :focus-within freeze).
 await page.eval(`document.querySelector('.remote-tab').focus({preventScroll:true}),1`);
 await new Promise(r=>setTimeout(r,1500));
 assert.equal(await page.eval('1+1'),2,'the page answers after a row takes focus');
 result.checks.push('a row taking focus leaves the page responsive');
 // A finger swipe scrolls the list and shows the scrollbar while it moves.
 const at=await page.eval(`(()=>{const b=document.getElementById('remoteList').getBoundingClientRect();return {x:b.left+b.width/2,y:b.top+b.height*0.7};})()`);
 await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:800,y:100});
 await page.send('Input.synthesizeScrollGesture',{x:at.x,y:at.y,yDistance:-260,gestureSourceType:'touch',speed:800});
 const swiped=await page.eval(`(()=>{const e=document.getElementById('remoteList');return {top:e.scrollTop,scrolling:e.dataset.scrolling,bar:getComputedStyle(e).scrollbarColor,fadeStart:e.dataset.fadeStart};})()`);
 result.swiped=swiped;
 assert.ok(swiped.top>100&&swiped.scrolling==='true'&&!/^rgba\(0, 0, 0, 0\) /.test(swiped.bar)&&swiped.fadeStart==='true','a swipe scrolls the list, showing its scrollbar and a top fade');
 result.checks.push('a finger swipe scrolls the list, its scrollbar showing while it moves');
 await new Promise(r=>setTimeout(r,1300));
 const bar=()=>page.eval(`getComputedStyle(document.getElementById('remoteList')).scrollbarColor`);
 await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:800,y:100});
 const away=await w.waitFor(bar,v=>/^rgba\(0, 0, 0, 0\) /.test(v),'no scrollbar at rest',4000).catch(()=>bar());
 await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:at.x,y:at.y});
 const over=await w.waitFor(bar,v=>!/^rgba\(0, 0, 0, 0\) /.test(v),'the scrollbar on hover',4000).catch(()=>bar());
 const {data}=await page.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,'hover.png'),Buffer.from(data,'base64'));
 result.scrollbar={away,over};
 assert.match(away,/^rgba\(0, 0, 0, 0\) /,'no scrollbar at rest');
 assert.doesNotMatch(over,/^rgba\(0, 0, 0, 0\) /,'the scrollbar on hover');
 result.checks.push('the scrollbar is hidden at rest and shows on hover');
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,1));console.log(JSON.stringify(result));
}catch(e){result.error=String(e.stack||e);fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,1));console.log(JSON.stringify(result));process.exitCode=1;}
finally{await f.close();fs.rmSync(parent,{recursive:true,force:true});}
