// Native mouse/trackpad input, Settings and navigation boundaries.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {NativeFixture} from './lib/fixture.mjs';
import {installDriver} from './lib/test-driver.mjs';
import {assertRendering,assertNodeRuntime} from './lib/render-guard.mjs';
import {createWorld} from './world.mjs';
import {tabPage} from './adapters/core.mjs';
import {inSettings} from './adapters/commands.mjs';
const [configFile,out]=process.argv.slice(2),config=JSON.parse(fs.readFileSync(configFile));
assertNodeRuntime();assert.equal(fs.existsSync(out),false);fs.mkdirSync(out,{recursive:true});
const f=new NativeFixture(),w=createWorld(f),result={candidate:config.candidate,checks:[]};
const parent=fs.mkdtempSync(path.join(os.tmpdir(),'blanc-mouse-gestures-'));
const visible=()=>assertRendering(e=>f.host.eval(e));
try {
 await f.launch(config,path.join(parent,'fixture'),{testHooks:true,diskAssets:false});await installDriver(f.host);await visible();await w.reset();
 f.server.removeAllListeners('request');f.server.on('request',(q,r)=>{r.writeHead(200,{'content-type':'text/html'});r.end(`<title>Gesture fixture</title><button style="position:absolute;left:30px;top:60px;width:400px;height:300px">Native input target</button><script>
 sessionStorage.loads=String(Number(sessionStorage.loads||0)+1);window.events={down:0,up:0,click:0,menu:0};
 addEventListener('mousedown',()=>events.down++);addEventListener('mouseup',()=>events.up++);addEventListener('click',()=>events.click++);addEventListener('contextmenu',e=>{e.preventDefault();events.menu++});
 </script>`);});
 const id=await w.call('openTab',f.base+'/gesture-input');
 let page=await tabPage(w,id);await page.evalExpression('1');
 const settings=await inSettings(w,'appearance',async(a,d)=>{
  const enabled=d.find('#blancMouseGestures');if(!enabled)return {missing:'#blancMouseGestures'};
  const initial=enabled.checked;enabled.click();await new Promise(r=>setTimeout(r,250));
  const host=enabled.getRootNode().host;const select=[...host.shadowRoot.querySelectorAll('select')].find(e=>e.getAttribute('aria-label')==='→');
  if(!select)return {missing:'right gesture action'};select.value='reload';select.dispatchEvent(new Event('change',{bubbles:true}));await new Promise(r=>setTimeout(r,250));
  return {value:{initial,enabled:enabled.checked,action:select.value}};
 });assert.deepEqual(settings,{initial:false,enabled:true,action:'reload'});
 result.checks.push('Settings defaults off, enables gestures and edits the real right-stroke action');
 page=await tabPage(w,id);await page.evalExpression('1');
 const send=(type,x,y,button='right',modifiers=0)=>page.cdp.send('Input.dispatchMouseEvent',{type,x,y,button,buttons:type==='mouseReleased'?0:button==='right'?2:1,clickCount:type==='mouseMoved'?0:1,modifiers});
 const gesture=async(button='right',modifiers=0)=>{await send('mousePressed',100,140,button,modifiers);await send('mouseMoved',170,140,button,modifiers);await send('mouseReleased',170,140,button,modifiers);};
 const loads=()=>page.evalExpression('Number(sessionStorage.loads)');
 let before=await loads();await gesture();await w.waitFor(loads,n=>n===before+1,'right gesture reload');
 result.checks.push('right drag reloads through native input interception');
 before=await loads();await gesture('left',1);await w.waitFor(loads,n=>n===before+1,'Option-left reload');
 assert.equal(await page.evalExpression('getSelection().toString()'),'');
 result.checks.push('Option-left drag reloads without selecting page text');
 await send('mousePressed',100,140);await send('mouseReleased',100,140);
 await w.waitFor(()=>page.evalExpression('events'),e=>e.down===1&&e.up===1&&e.menu===1,'ordinary context click replay');
 await send('mousePressed',100,140,'left',1);await send('mouseReleased',100,140,'left',1);
 await w.waitFor(()=>page.evalExpression('events'),e=>e.down===2&&e.up===2&&e.click===1,'ordinary Option-click replay');
 result.checks.push('a short right click and Option-click each replay their original press/release exactly once');
 await w.call('setMouseGestures',false);before=await loads();await gesture();await new Promise(r=>setTimeout(r,300));
 assert.equal(await loads(),before);assert.equal(await page.evalExpression('events.down'),3);
 result.checks.push('disabled gestures pass input through without running an action');
 await w.call('setMouseGestures',true,{R:'reload'});
 await send('mousePressed',100,140);await w.api('navigate',[String(id),f.base+'/gesture-next']);
 await w.waitFor(()=>w.snapshot(),s=>s.tabs.some(t=>String(t.id)===String(id)&&t.url.endsWith('/gesture-next')&&!t.loading),'new document');
 page=await tabPage(w,id);await page.evalExpression('1');before=await loads();await send('mouseMoved',170,140);await send('mouseReleased',170,140);await new Promise(r=>setTimeout(r,300));
 assert.equal(await loads(),before);result.checks.push('navigation cancels a held gesture before its release');
 const old=await w.call('setMouseGestures',true,{R:'reload'});assert.deepEqual(old.mapping,{R:'reload'});
 await assert.rejects(()=>w.call('setMouseGestures',true,{RR:'reload'}));
 const same=await w.call('setMouseGestures',true);assert.deepEqual(same.mapping,{R:'reload'});
 result.checks.push('invalid repeated-direction mappings are rejected atomically');
 await w.relaunch();await visible();
 const persisted=await w.call('setMouseGestures',false);assert.equal(persisted.enabled,true);assert.deepEqual(persisted.mapping,{R:'reload'});
 result.checks.push('gesture preference and mapping survive native restart');
 await visible();result.result='pass';
} catch(error){result.result=error.code==='BLANC_ENVIRONMENT_STOP'?'blocked-environment':'fail';result.error=String(error.stack);process.exitCode=1;}
finally {const exit=await f.close();if(exit?.code!==0){result.exit=exit;result.result='fail';process.exitCode=1;}
 if(f.directory&&fs.existsSync(path.join(f.directory,'browser.log')))fs.copyFileSync(path.join(f.directory,'browser.log'),path.join(out,'browser.log'));
 fs.rmSync(parent,{recursive:true,force:true});fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));}
