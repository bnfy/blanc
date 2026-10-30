import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {installSnapshotReplyProbe} from './snapshot-reply-probe.mjs';
function setup(){
 let observer,now=0,replyEffect=()=>{};const sent=[],forwarded=[],status={hidden:true,textContent:''};
 const chrome={send(...args){sent.push(args);return 'sent'}};
 const window={blancPrototypeReply(...args){forwarded.push(args);replyEffect(...args);return 'forwarded'},BlancPrototypeHost:{notice(value){status.hidden=false;status.textContent=value}}};
 class MutationObserver{constructor(fn){observer=fn}observe(){}}
 const ctx=vm.createContext({window,chrome,document:{getElementById:()=>status},MutationObserver,performance:{now:()=>now},queueMicrotask,Set,BigInt,Array,Error});
 vm.runInContext(`(${installSnapshotReplyProbe.toString()})()`,ctx);
 return {window,chrome,status,sent,forwarded,mutate(){observer()},setTime(v){now=v},onReply(fn){replyEffect=fn}};
}
test('drops only selected real reply; records newer success and clears phase',async()=>{
 const h=setup();h.window.__snapshotNoticeProbe.arm('recovery');h.chrome.send('blancPrototype',['1','snapshot',[]]);h.window.blancPrototypeReply('1',true,{tabs:[]});assert.equal(h.forwarded.length,0);h.setTime(10010);h.status.hidden=false;h.status.textContent='Native bridge timed out: snapshot';h.mutate();assert.equal(h.window.__snapshotNoticeProbe.phase.timeoutSeen,true);
 h.chrome.send('blancPrototype',['2','snapshot',[]]);h.onReply(()=>{h.status.hidden=true;h.status.textContent=''});h.window.blancPrototypeReply('2',true,{tabs:[]});await new Promise(r=>setImmediate(r));assert.equal(h.forwarded.length,1);assert.equal(h.window.__snapshotNoticeProbe.phase.successes[0].hidden,true);
});
test('second phase injects synthetic unrelated notice after real timeout and forwards newer response',async()=>{
 const h=setup();h.window.__snapshotNoticeProbe.arm('unrelated');h.chrome.send('blancPrototype',['3','snapshot',[]]);h.window.blancPrototypeReply('3',true,{tabs:[]});h.setTime(10000);h.status.hidden=false;h.status.textContent='Native bridge timed out: snapshot';h.mutate();assert.equal(h.status.textContent,'fixture unrelated warning');assert.equal(h.window.__snapshotNoticeProbe.phase.warningInjected,true);
 h.chrome.send('blancPrototype',['4','snapshot',[]]);h.window.blancPrototypeReply('4',true,{tabs:[]});await new Promise(r=>setImmediate(r));assert.equal(h.window.__snapshotNoticeProbe.phase.successes[0].unrelatedVisible,true);assert.equal(h.sent.length,2);
});
test('early, unsuccessful or unrelated notifications cannot satisfy a timeout phase',()=>{
 const h=setup();h.window.__snapshotNoticeProbe.arm('recovery');h.chrome.send('blancPrototype',['1','snapshot',[]]);h.window.blancPrototypeReply('1',false,'error');h.setTime(11000);h.status.hidden=false;h.status.textContent='Native bridge timed out: snapshot';h.mutate();assert.equal(h.window.__snapshotNoticeProbe.phase.timeoutSeen,false);assert.throws(()=>h.window.__snapshotNoticeProbe.arm('unrelated'));
});
test('a concurrent snapshot success before timeout is recorded before timeout, not as recovery',async()=>{
 const h=setup();h.window.__snapshotNoticeProbe.arm('recovery');h.chrome.send('blancPrototype',['1','snapshot',[]]);h.window.blancPrototypeReply('1',true,{tabs:[]});h.setTime(5000);h.chrome.send('blancPrototype',['2','snapshot',[]]);h.window.blancPrototypeReply('2',true,{tabs:[]});await new Promise(r=>setImmediate(r));h.setTime(10001);h.status.hidden=false;h.status.textContent='Native bridge timed out: snapshot';h.mutate();const p=h.window.__snapshotNoticeProbe.phase;assert(p.timeoutSeen);assert(p.successes[0].timeMs<p.timeoutAt);
});
