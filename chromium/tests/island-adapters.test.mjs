import test from 'node:test';
import assert from 'node:assert/strict';
import {cdpMouse,cdpKey} from './adapters/island.mjs';
test('Electron mouse input maps to CDP mouse events at a frame offset',()=>{
 // `buttons` carries the held button through moves (3bf958b35), so a drag's
 // pointermove reports it; none on a plain move or after the release.
 assert.deepEqual(cdpMouse({type:'mouseMove',x:10,y:20},{x:5,y:7}),{type:'mouseMoved',x:15,y:27,button:'none',buttons:0,clickCount:0});
 assert.deepEqual(cdpMouse({type:'mouseMove',x:3,y:4,button:'left'}),{type:'mouseMoved',x:3,y:4,button:'left',buttons:1,clickCount:0});
 assert.deepEqual(cdpMouse({type:'mouseDown',x:1,y:2}),{type:'mousePressed',x:1,y:2,button:'left',buttons:1,clickCount:1});
 assert.deepEqual(cdpMouse({type:'mouseUp',x:1,y:2}),{type:'mouseReleased',x:1,y:2,button:'left',buttons:0,clickCount:1});
 assert.throws(()=>cdpMouse({type:'mouseWheel'}),e=>e.code==='BLANC_ADAPTER_UNDEFINED');
});
test('Electron key input maps to CDP key events',()=>{
 assert.deepEqual(cdpKey({type:'keyDown',keyCode:'a'}),{type:'rawKeyDown',key:'a',code:'KeyA',windowsVirtualKeyCode:65});
 assert.equal(cdpKey({type:'char',keyCode:'g'}).text,'g');
 assert.throws(()=>cdpKey({type:'keyDown',keyCode:'Enter'}),e=>e.code==='BLANC_ADAPTER_UNDEFINED');
});
test('Linux window geometry covers native buttons on both sides and the actual Island menu', async () => {
 const {linuxButtonRects} = await import('./adapters/island.mjs');
 const menu = {x:48,y:8,width:24,height:24};
 const buttons = [{kind:'close',x:4,y:1,width:32,height:28},{kind:'maximize',x:974,y:2,width:26,height:30}];
 assert.deepEqual(linuxButtonRects(buttons,menu),{menuButtonRect:menu,windowControlsRect:{x:4,y:1,width:996,height:31}});
 assert.deepEqual(linuxButtonRects([],menu),{windowControlsRect:null,menuButtonRect:menu});
});

test('a Glance resize waits for the Island snapshot to catch up with the native window', async () => {
 const {waitForLinuxGlanceResize} = await import('./fork-steps/window-layout.mjs');
 const snapshots = [945,1440].map(width=>({glanceTabId:'2',splitGeometry:{pageArea:{x:0,y:68,width,height:792},islandY:0}}));
 let reads = 0;
 const w = {
   hostEval:async expression => {assert.ok(expression.includes('refresh()')); return snapshots[reads++];},
   waitFor:async (read,accepts) => {assert.equal(accepts(await read()),false);assert.equal(accepts(await read()),true);},
 };
 await waitForLinuxGlanceResize(w,1440,860);
 assert.equal(reads,2);
});

test('the picker clicks Custom once the list-to-editor transition finishes', async () => {
 const {openLinuxSpacePicker} = await import('./fork-steps/window-layout.mjs');
 const actions=[];
 const page={click:async s=>actions.push(['click',s]),waitForSelector:async s=>actions.push(['wait',s])};
 await openLinuxSpacePicker.call({frame:()=>page,call:async()=>({items:[{id:'work-id',name:'Work'}]})},'Work');
 assert.deepEqual(actions,[
   ['click','[data-focus-key="edit:work-id"]'],
   ['wait','#workspaceSwitcher[data-view="edit"]:not(.morphing)'],
   ['click','[data-focus-key="color:custom"]'],
   ['wait','.space-picker-hex'],
 ]);
});

test('a failure on a Spaces menu control carries the menu evidence, and others do not', async () => {
 const {spacesFailure} = await import('./lib/spaces-evidence.mjs');
 for(const message of ['Timeout waiting for [data-focus-key="color:sky"] to be visible','Timeout waiting for #workspaceName'])assert.equal(spacesFailure(message),true,message);
 for(const message of ['Timeout waiting for shipping state assertion','Island did not draw'])assert.equal(spacesFailure(message),false,message);
});

test('the Windows and Linux Space editor steps replace the shipping ones, and macOS keeps them', async () => {
 const {windowLayoutSteps} = await import('./fork-steps/window-layout.mjs');
 const edit='I edit {string} to the color {string} and the symbol {string}';
 for(const platform of ['win32','linux'])for(const step of [edit,'I delete {string} from its editor','I give {string} the custom color {string}'])
  assert.ok(windowLayoutSteps(platform).has(step),platform+': '+step);
 assert.equal(windowLayoutSteps('darwin').has(edit),false);
});

test('a state wait outlasted by the blocker starting waits for the blocker, then retries', async () => {
 const {waitForStateThroughBlocker} = await import('./world.mjs');
 const loading={tabs:[{url:'http://127.0.0.1:1/probe',loading:true}]};
 const timeout=async()=>{throw Error('Timeout waiting for shipping state assertion');};
 // Not ready when the wait began, a web page still loading: wait, then retry.
 let calls=[];
 const result=await waitForStateThroughBlocker({read:async()=>loading,health:async()=>'idle',blockerReady:async()=>calls.push('blocker'),
  predicate:()=>true,timeout:5000,waitFor:async(read,predicate,label,ms)=>{calls.push('wait '+ms);if(calls.length===1)return timeout();return 'loaded';}});
 assert.equal(result,'loaded');assert.deepEqual(calls,['wait 5000','blocker','wait 5000']);
 // A ready (or failed) blocker, or no web page loading, fails as before.
 for(const [health,state] of [['ready',loading],['unavailable',loading],['idle',{tabs:[{url:'chrome://newtab/',loading:true}]}],['idle',{tabs:[{url:'http://a/',loading:false}]}]]){
  let blocker=false;
  await assert.rejects(waitForStateThroughBlocker({read:async()=>state,health:async()=>health,blockerReady:async()=>{blocker=true;},predicate:()=>true,timeout:5000,waitFor:timeout}),/shipping state assertion/);
  assert.equal(blocker,false,health+' '+JSON.stringify(state));
 }
});
