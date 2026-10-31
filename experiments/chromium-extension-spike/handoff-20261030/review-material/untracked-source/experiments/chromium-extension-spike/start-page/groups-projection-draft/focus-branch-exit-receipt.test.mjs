import test from 'node:test';
import assert from 'node:assert/strict';
import {snapshotOwnedExit} from './focus-branch-exit-receipt.mjs';
test('successful exit survives clearing process and state handles',()=>{
  let child={pid:101,exitCode:0,signalCode:null},state={exited:()=>true};
  const receipt=snapshotOwnedExit(child,state);child=null;state=null;
  assert.equal(receipt.proven,true);assert.equal(receipt.exitCode,0);assert.equal(receipt.pid,101);assert(Object.isFrozen(receipt));
});
test('live, failed-spawn and status-unknown cannot prove exit',()=>{
  assert.equal(snapshotOwnedExit({pid:101,exitCode:null,signalCode:null},{exited:()=>false}).proven,false);
  assert.equal(snapshotOwnedExit({pid:undefined,exitCode:null,signalCode:null},{exited:()=>true}).proven,false);
  assert.equal(snapshotOwnedExit({pid:101,exitCode:null,signalCode:null},{exited:()=>true}).proven,false);
});
test('signal exit is proven but is not clean',()=>{
  const r=snapshotOwnedExit({pid:101,exitCode:null,signalCode:'SIGTERM'},{exited:()=>true});
  assert.equal(r.proven,true);assert.equal(r.exitCode,null);assert.equal(r.signalCode,'SIGTERM');
});
