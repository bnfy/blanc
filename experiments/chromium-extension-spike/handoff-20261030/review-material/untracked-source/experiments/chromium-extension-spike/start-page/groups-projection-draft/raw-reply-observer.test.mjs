import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {installRawReplyObserver} from './raw-reply-observer.mjs';
function setup() {
  let now=5;const sent=[],replies=[];
  const chrome={send(...args){sent.push({receiver:this,args});return 'send-return'}};
  const window={blancNewTabReply(...args){replies.push({receiver:this,args});return 'reply-return'}};
  vm.runInNewContext(`(${installRawReplyObserver.toString()})()`,{chrome,window,performance:{now:()=>now},Set,Array,Error});
  return {chrome,window,sent,replies,tick(n){now=n}};
}
test('captures only the correlated native focus request and response unchanged',()=>{
  const t=setup();assert.equal(t.sent.length,0);
  t.chrome.send('blancNewTab',['1','groupsRead',[]]);
  assert.equal(t.chrome.send('blancNewTab',['2','focusGroup',['group-a']]),'send-return');
  t.window.blancNewTabReply('1',true,[]);t.tick(12);
  assert.equal(t.window.blancNewTabReply('2',true,false),'reply-return');
  assert.equal(t.sent.length,2);assert.equal(t.sent[1].receiver,t.chrome);assert.equal(t.replies[1].receiver,t.window);
  const request=t.window.__focusRawRequests[0],reply=t.window.__focusRawReplies[0];
  assert.equal(t.window.__focusRawRequests.length,1);assert.equal(t.window.__focusRawReplies.length,1);
  assert.equal(request.id,'2');assert.equal(request.groupId,'group-a');assert.equal(request.timeMs,5);
  assert.equal(reply.id,'2');assert.equal(reply.success,true);assert.equal(reply.value,false);assert.equal(reply.timeMs,12);
});
test('native error and absent reply remain distinct observations',()=>{
  const t=setup();t.chrome.send('blancNewTab',['3','focusGroup',['group-b']]);
  assert.equal(t.window.__focusRawReplies.length,0);
  t.window.blancNewTabReply('3',false,'denied');
  assert.equal(t.window.__focusRawReplies[0].success,false);assert.equal(t.window.__focusRawReplies[0].value,'denied');
});
test('bridge call failure is not swallowed',()=>{
  const chrome={send(){throw Error('send failed')}},window={blancNewTabReply(){}};
  vm.runInNewContext(`(${installRawReplyObserver.toString()})()`,{chrome,window,performance:{now:()=>0},Set,Array,Error});
  assert.throws(()=>chrome.send('blancNewTab',['4','focusGroup',['x']]),/send failed/);
});
