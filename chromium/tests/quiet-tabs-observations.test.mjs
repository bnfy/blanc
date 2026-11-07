import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {dimStyle} from './adapters/quiet-chrome.mjs';
import {quietProcess} from './adapters/quiet-process.mjs';
import {shippingState} from './adapters/state.mjs';

test('quiet dim observations catch hidden ancestors and keep ancestor opacity separate',()=>{
 const parent={style:{display:'block',visibility:'visible',opacity:'.8'},parentElement:null};
 const row={style:{display:'block',visibility:'visible',opacity:'.5'},parentElement:parent,
  classList:{contains:k=>k==='quiet'},matches:()=>false,getBoundingClientRect:()=>({width:240,height:40})};
 const read=()=>vm.runInNewContext(`(${dimStyle.toString()})(row)`,{row,getComputedStyle:el=>el.style});
 assert.equal(read().rowOpacity,'.5');assert.equal(read().ancestorOpacity,.8);
 parent.style.display='none';assert.match(read().error,/hidden/);
 parent.style.display='block';parent.style.opacity='0';assert.equal(read().ancestorOpacity,0);
 row.classList.contains=()=>false;assert.match(read().error,/quiet class/);
});

test('viewless native tabs project null contents identity, then regain it on wake',()=>{
 const state=live=>shippingState({tabs:[{id:17,url:'http://127.0.0.1/site/quietable',rendererLive:live,asleep:!live}],activeTabId:17});
 assert.equal(state(false).tabs[0].webContentsId,null);
 assert.equal(state(true).tabs[0].webContentsId,17);
});

test('process count still counts an OS process after native discard until it exits',async()=>{
 const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});
 await once(child,'spawn');let live=true;
 const w={app:{releasePages(){}},snapshot:async()=>({tabs:[{id:17,url:'http://127.0.0.1/site/quietable'}]}),
  native:async()=>({rendererPid:live?child.pid:0})};
 try{
  assert.equal(await quietProcess.tabProcessCount(w),1);
  live=false;assert.equal(await quietProcess.tabProcessCount(w),1);
  const exited=once(child,'exit');child.kill();await exited;
  assert.equal(await quietProcess.tabProcessCount(w),0);
 }finally{if(child.exitCode===null)child.kill();}
});

test('a shared fixture renderer cannot claim an isolated process decrement',async()=>{
 const w={app:{releasePages(){}},snapshot:async()=>({tabs:[{id:1,url:'http://127.0.0.1/site/quietable'},
  {id:2,url:'http://127.0.0.1/site/other'}]}),native:async()=>({rendererPid:process.pid})};
 await assert.rejects(()=>quietProcess.tabProcessCount(w),/shares its renderer/);
});
