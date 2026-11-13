// The Start Page's On your other devices card (fork redesign): the right
// column starts on the header's line, a column fits between the header and the footer however many tabs it lists (the list
// scrolls inside the card), a tall card is carried as a short preview, a
// finger swipe scrolls the list, the scrollbar shows on hover and while
// scrolling only, a row taking focus never freezes the page, and a long
// card resizes by its bottom edge onto the page's fixed sizes.
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
 // This profile has no synced devices: the page draws these three itself,
 // and its own refreshes (which would read none) draw them too.
 const draw=()=>page.eval(`(()=>{const r=document.querySelector('.tally-right');if(r)r.hidden=false;remoteExpanded.add('a');
  const devices=${JSON.stringify(DEVICES)};
  if(!window.__devicesStub){window.__devicesStub=true;const send=chrome.send.bind(chrome);
   chrome.send=(name,args)=>name==='blancNewTab'&&args?.[1]==='remoteDevices'?void setTimeout(()=>window.blancNewTabReply(args[0],true,devices)):send(name,args);}
  renderRemote(devices);return 1;})()`);
 await draw();await new Promise(r=>setTimeout(r,500));
 const fit=await page.eval(`(()=>{const railEl=document.getElementById('bbRailRight'),rail=railEl.getBoundingClientRect(),left=document.getElementById('bbRailLeft').getBoundingClientRect(),
  brand=document.querySelector('.start-brand').getBoundingClientRect(),foot=document.getElementById('layoutFooter').getBoundingClientRect(),list=document.getElementById('remoteList');
  const hit=document.elementFromPoint(rail.left+rail.width/2,rail.top+8);
  return {railTop:rail.top,brandTop:brand.top,leftTop:left.top,railBottom:rail.bottom,leftBottom:left.bottom,footerTop:foot.top,topClickable:!!hit&&railEl.contains(hit),
   listHeight:list.clientHeight,listContent:list.scrollHeight,fadeEnd:list.dataset.fadeEnd};})()`);
 result.fit=fit;
 assert.ok(Math.abs(fit.railTop-fit.brandTop)<=2&&fit.railTop<fit.leftTop,'the right column rises to the header line, beside the Sunrise');
 assert.ok(fit.topClickable,'the right column\'s top is not under the header');
 assert.ok(fit.railBottom<=fit.footerTop,'the column ends above the footer');
 result.checks.push('the right column starts level with the Sunrise and date, its top clickable above the header');
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
 // Resizing by the bottom edge, onto the fixed sizes.
 const SIZES=[240,360,480,600,720];
 const edgeAt=()=>page.eval(`(()=>{const e=document.querySelector('#remoteSection > .bb-widget-resize');const b=e.getBoundingClientRect();
  return {x:b.left+b.width/2,y:b.top+b.height/2,role:e.getAttribute('role'),label:e.getAttribute('aria-label'),text:e.getAttribute('aria-valuetext')};})()`);
 const sized=()=>page.eval(`(()=>{const c=document.getElementById('remoteSection');return {size:c.dataset.size??null,height:Math.round(c.getBoundingClientRect().height),saved:state.widgets?.sizes?.devices??null,resizing:c.dataset.resizing??null};})()`);
 let edge=await edgeAt();
 assert.equal(edge.role,'separator');assert.match(edge.label,/On your other devices/);
 // A slow drag up by about 230px, resting before release: the nearest size.
 const before=await sized();
 await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:edge.x,y:edge.y});
 await page.send('Input.dispatchMouseEvent',{type:'mousePressed',x:edge.x,y:edge.y,button:'left',buttons:1,clickCount:1});
 for(let i=1;i<=10;i++){await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:edge.x,y:edge.y-i*23,button:'left',buttons:1});await new Promise(r=>setTimeout(r,25));}
 const guide=await page.eval(`(()=>{const g=document.getElementById('cardSnapGuide');return g?Math.round(g.getBoundingClientRect().height):null;})()`);
 {const {data}=await page.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,'resizing.png'),Buffer.from(data,'base64'));}
 await new Promise(r=>setTimeout(r,250));
 await page.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:edge.x,y:edge.y-230,button:'left',buttons:0,clickCount:1});
 const slow=await w.waitFor(sized,v=>v.saved&&!v.resizing,'the card settled and saved',5000);
 result.resize={before,guide,slow};
 assert.ok(SIZES.includes(slow.saved)&&Math.abs(slow.height-slow.saved)<=1,'it settles exactly on a fixed size');
 assert.equal(slow.saved,SIZES.reduce((a,b)=>Math.abs(b-(before.height-230))<Math.abs(a-(before.height-230))?b:a),'the nearest size to where it was let go');
 assert.equal(guide,slow.saved,'the outline showed the size it settled on');
 result.checks.push('dragging the bottom edge resizes the card onto the nearest fixed size, shown by an outline first, and saves it');
 // A quick flick down from there carries past the nearest size.
 edge=await edgeAt();
 await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:edge.x,y:edge.y});
 await page.send('Input.dispatchMouseEvent',{type:'mousePressed',x:edge.x,y:edge.y,button:'left',buttons:1,clickCount:1});
 for(let i=1;i<=4;i++)await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:edge.x,y:edge.y+i*10,button:'left',buttons:1});
 await page.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:edge.x,y:edge.y+40,button:'left',buttons:0,clickCount:1});
 const flick=await w.waitFor(sized,v=>v.saved&&v.saved!==slow.saved&&!v.resizing,'the flick settled',5000).catch(()=>sized());
 result.resize.flick=flick;
 assert.ok(flick.saved>=slow.saved+120,'a 40px flick (nearest size: the same) carries to a larger size');
 result.checks.push('a quick flick carries the card past the nearest size, as the gesture was heading');
 // Keys step through the sizes; Delete fits the column again.
 await page.eval(`document.querySelector('#remoteSection > .bb-widget-resize').focus(),1`);
 await page.send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowUp',code:'ArrowUp',windowsVirtualKeyCode:38});
 await page.send('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowUp',code:'ArrowUp',windowsVirtualKeyCode:38});
 const up=await w.waitFor(sized,v=>v.saved===flick.saved-120&&!v.resizing,'one size smaller',5000).catch(()=>sized());
 result.resize.key=up;
 assert.equal(up.saved,flick.saved-120,'ArrowUp takes the next smaller size');
 assert.match((await edgeAt()).text,/^Size \d of 5$/);
 // The size is kept when the page loads again.
 await page.eval('location.reload(),1');
 await w.waitFor(()=>page.eval("document.body.classList.contains('layout-ready')&&!!document.querySelector('#remoteSection > .bb-widget-resize')").catch(()=>false),Boolean,'the page again',10000);
 await draw();await new Promise(r=>setTimeout(r,500));
 const reloaded=await sized();
 result.resize.reloaded=reloaded;
 assert.equal(Number(reloaded.size),up.saved,'the size is kept');
 await page.eval(`document.querySelector('#remoteSection > .bb-widget-resize').dispatchEvent(new MouseEvent('dblclick',{bubbles:true})),1`);
 const fitted=await w.waitFor(sized,v=>v.size===null&&v.saved===null,'fits the column again',5000).catch(()=>sized());
 result.resize.fit=fitted;
 assert.equal(fitted.size,null,'double-click fits the column again');
 result.checks.push('arrow keys step through the sizes, the size is kept across a reload, and double-click fits the column again');
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,1));console.log(JSON.stringify(result));
}catch(e){result.error=String(e.stack||e);fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,1));console.log(JSON.stringify(result));process.exitCode=1;}
finally{await f.close();fs.rmSync(parent,{recursive:true,force:true});}
