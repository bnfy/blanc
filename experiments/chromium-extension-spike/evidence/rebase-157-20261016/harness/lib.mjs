import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {targets,connect,pause} from './cdp.mjs';
export {targets,connect,pause,assert,execFileSync};
export const base='http://127.0.0.1:8786/';
export const evidence='/private/tmp/blanc-task0/runtime-evidence.json';
export function record(name,details={}) {
  let out={version:'157.0.8103.6',checks:[]};
  if(fs.existsSync(evidence))out=JSON.parse(fs.readFileSync(evidence,'utf8'));
  out.checks.push({name,at:new Date().toISOString(),...details});
  fs.writeFileSync(evidence,JSON.stringify(out,null,2));console.log(JSON.stringify({name,...details}));
}
export function native(...args){process.env.BLANC_TEST_PID=fs.readFileSync('/private/tmp/blanc-task0/test.pid','utf8').trim();execFileSync('/private/tmp/blanc-controls-ui',args.map(String),{timeout:10000});}
export const key=(code,flags=0)=>native('key',code,flags);
export const text=s=>native('text',s);
export async function until(fn,label,timeout=10000){const start=Date.now();while(Date.now()-start<timeout){const r=await fn();if(r)return r;await pause(150);}throw Error('Timed out: '+label);}
export async function host(priv=false){for(const t of (await targets()).filter(t=>t.url==='chrome://blanc-prototype/host.html')){const c=await connect(t);const s=await c.eval('BlancPrototypeHost.api.getAllTabs()');if(s.tabs.some(t=>t.private)===priv && (!process.env.BLANC_TEST_HOST_MATCH || s.tabs.some(t=>t.url.includes(process.env.BLANC_TEST_HOST_MATCH))))return c;c.close();}throw Error('Host unavailable: '+priv);}
export async function evaluate(expression,priv=false){const c=await host(priv);try{return await c.eval(expression);}finally{c.close();}}
export const snapshot=(priv=false)=>evaluate('BlancPrototypeHost.api.getAllTabs()',priv);
export async function active(priv=false){const s=await snapshot(priv);return s.tabs.find(t=>t.id===s.activeTabId);}
export const favorites=()=>evaluate('BlancPrototypeHost.api.listFavorites()');
export async function goto(url,newTab=false){if(newTab){key(17,1048576);await pause(500);}native('click',500,700);await pause(350);key(37,1048576);await pause(700);key(0,1048576);await pause(250);text(url);await pause(350);key(36);await until(async()=>{const t=await active();return t.url===url.replace('chrome://newtab/','blanc://newtab/')&&!t.isLoading},'navigate '+url);}
export async function enter(value,priv=false){await click('#pillDomain','strip',priv);await pause(400);key(0,1048576);text(value);await pause(250);const val=await evaluate('document.getElementById("overlay").contentDocument.getElementById("addressInput").value',priv);assert.equal(val,value);key(36);await pause(450);}
export async function point(selector,frame='strip',priv=false){
  const c=await host(priv);try{
    const state=await c.eval('BlancPrototypeHost.api.getAllTabs()'); const tab=state.tabs.find(t=>t.id===state.activeTabId); const infos=(await c.send('Target.getTargets')).targetInfos; const self=(await c.send('Target.getTargetInfo')).targetInfo; const candidates=infos.filter(t=>t.browserContextId===self.browserContextId && t.type==='page' && t.url===tab.url.replace('blanc://newtab/','chrome://newtab/')); const target=candidates.at(-1); if(target)target.id=target.targetId; assert.ok(target,'Content target for window'); const bounds=(await c.send('Browser.getWindowForTarget',{targetId:target.id})).bounds;
    const rect=await c.eval(`(()=>{const f=${JSON.stringify(frame)}?document.getElementById(${JSON.stringify(frame)}):null;const d=f?f.contentDocument:document;const e=d.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing click target');const r=e.getBoundingClientRect();const o=f?f.getBoundingClientRect():{x:0,y:0};return {x:r.x+o.x,y:r.y+o.y,w:r.width,h:r.height,display:getComputedStyle(e).display}})()`);
    assert.ok(rect.w>0&&rect.h>0&&rect.display!=='none',JSON.stringify(rect));
    return {x:bounds.left+rect.x+rect.w/2,y:bounds.top+rect.y+rect.h/2};
  }finally{c.close();}
}
export async function click(selector,frame='strip',priv=false){const p=await point(selector,frame,priv);native('click',p.x,p.y);await pause(300);}
export async function capture(name){const c=await host();try{const shot=await c.send('Page.captureScreenshot',{format:'png'});const path='/private/tmp/blanc-task0/'+name+'.png';fs.writeFileSync(path,Buffer.from(shot.data,'base64'));record('host-renderer-screenshot',{path});}finally{c.close()}}
export async function manager(){const t=(await targets()).find(t=>t.url==='chrome://bookmarks/');assert.ok(t,'Bookmarks manager missing');return connect(t);}
