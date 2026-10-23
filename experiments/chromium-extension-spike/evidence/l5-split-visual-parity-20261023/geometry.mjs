import fs from 'node:fs';import assert from 'node:assert/strict';import {connect,pause} from '/private/tmp/blanc-l5-owner/cdp.mjs';
const root=import.meta.dirname,port=9875,checks=[];const list=()=>fetch(`http://127.0.0.1:${port}/json/list`).then(r=>r.json());
const ts=await list(),host=await connect(ts.find(t=>t.url.endsWith('/host.html'))),browser=await connect(await fetch(`http://127.0.0.1:${port}/json/version`).then(r=>r.json()));
function check(name,value,data){checks.push({name,pass:!!value,data});assert(value,name)}
async function rpc(method,args=[]){return host.eval(`new Promise((resolve,reject)=>{const id='visual-'+Math.random(),old=window.blancPrototypeReply;window.blancPrototypeReply=(got,ok,v)=>{if(got!==id)return old?.(got,ok,v);window.blancPrototypeReply=old;ok?resolve(v):reject(Error(v))};chrome.send('blancPrototype',[id,${JSON.stringify(method)},${JSON.stringify(args)}])})`)}
const wid=(await browser.send('Browser.getWindowForTarget',{targetId:ts.find(t=>t.url.endsWith('/left')).id})).windowId;
try {for(const [width,height,mode]of [[1280,800,'columns'],[620,800,'rows'],[620,380,'focus'],[1280,800,'columns']]){
 await browser.send('Browser.setWindowBounds',{windowId:wid,bounds:{windowState:'normal',width,height}}); await pause(800);
 const s=await rpc('snapshot'),g=s.splitGeometry;check(`layout ${width}x${height}`,g.mode===mode,g);
 const visible=g.frames.filter(f=>f.width>0);check(`8px inset ${mode}`,visible.every(f=>f.x===g.originX)&&mode!=='columns'||mode==='columns'&&visible[0].x===g.originX,g.frames);
 check(`corner tabs ${mode}`,g.headers.filter(h=>h.width>0).every(h=>h.height===36&&h.width<=240),g.headers);
 check(`no header bars ${mode}`,await host.eval('[...document.querySelectorAll(".split-pane-header")].every(p=>p.getBoundingClientRect().height===36)'));
 check(`one outline ${mode}`,await host.eval('[...document.querySelectorAll(".split-pane-frame")].every(p=>getComputedStyle(p).borderTopWidth==="1px"&&getComputedStyle(p).borderTopLeftRadius==="8px")'));
 check(`focus controls ${mode}`,await host.eval('[...document.querySelectorAll(".split-corner-close")].every(b=>b.getAttribute("aria-label")?.includes("Split View"))'));
 if(mode==='focus'){for(const t of s.tabs){await rpc('switchTab',[Number(t.id)]);await pause(250);const f=await rpc('snapshot');check('focus-only switch '+t.title,String(f.activeTabId)===String(t.id)&&f.splitGeometry.frames.filter(r=>r.width>0).length===1,f.splitGeometry)}}
 }
 const pages=await list();for(const t of pages.filter(t=>t.url.startsWith('http://127.0.0.1:9874/'))){const c=await connect(t);check('independent native typing '+t.url,await c.eval('document.querySelector("input").value')===(t.url.endsWith('/left')?'parity left':'parity right'));c.close()}
 fs.writeFileSync(root+'/'+(process.env.PARITY_REPORT || 'geometry-report.json'),JSON.stringify({checks,complete:true},null,2));
}catch(e){fs.writeFileSync(root+'/'+(process.env.PARITY_REPORT || 'geometry-report.json'),JSON.stringify({checks,error:String(e)},null,2));throw e}finally{browser.close();host.close()}
