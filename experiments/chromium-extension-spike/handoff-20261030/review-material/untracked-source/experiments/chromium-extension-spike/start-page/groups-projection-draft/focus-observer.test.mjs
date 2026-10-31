import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {installFocusObserver} from './focus-observer.mjs';

function setup(original) {
  let listener, focus=true;
  const document={visibilityState:'visible',hasFocus:()=>focus,addEventListener:(name,fn,options)=>{assert.equal(name,'click');assert.equal(options.capture,true);listener=fn;}};
  const api={focusGroup:original},window={bowserPages:{start:api}};
  const context=vm.createContext({window,document,Promise,String});
  vm.runInContext(`(${installFocusObserver.toString()})()`,context);
  return {api,window,document,listener,setFocus:value=>focus=value};
}
test('observation installs without calls; preserves receiver, argument, result and real click',async()=>{
  let calls=0,receiver;
  const t=setup(function(id){calls++;receiver=this;return Promise.resolve(id==='group-a');});
  assert.equal(calls,0);
  const target={dataset:{groupId:'group-a'}};
  t.listener({target:{closest:()=>target},isTrusted:true,clientX:22,clientY:33});
  const result=await t.api.focusGroup('group-a');
  assert.equal(result,true);assert.equal(calls,1);assert.equal(receiver,t.api);
  const event=t.window.__focusFixtureClicks[0],call=t.window.__focusFixtureCalls[0];
  assert.equal(event.trusted,true);assert.equal(event.id,'group-a');assert.equal(event.x,22);
  assert.equal(call.args[0],'group-a');assert.equal(call.result,true);assert.equal(call.finished,true);assert.equal(call.atCall.focus,true);
});
test('false response and changed focus remain observable',async()=>{
  let resolve;const t=setup(()=>new Promise(r=>{resolve=r}));
  const response=t.api.focusGroup('group-b');t.setFocus(false);t.document.visibilityState='hidden';resolve(false);
  assert.equal(await response,false);const call=t.window.__focusFixtureCalls[0];
  assert.equal(call.result,false);assert.equal(call.atCall.focus,true);assert.equal(call.atReply.focus,false);assert.equal(call.atReply.visibility,'hidden');
});
test('synchronous throw and asynchronous rejection propagate',async()=>{
  const a=setup(()=>{throw Error('sync')});assert.throws(()=>a.api.focusGroup('a'),/sync/);assert.match(a.window.__focusFixtureCalls[0].error,/sync/);
  const b=setup(()=>Promise.reject(Error('async')));await assert.rejects(b.api.focusGroup('b'),/async/);assert.match(b.window.__focusFixtureCalls[0].error,/async/);
});
test('unrelated or targetless click does not manufacture a call',()=>{
  let calls=0;const t=setup(()=>{calls++});t.listener({target:null});t.listener({target:{closest:()=>null}});
  assert.equal(calls,0);assert.equal(t.window.__focusFixtureCalls.length,0);assert.equal(t.window.__focusFixtureClicks.length,0);
});
