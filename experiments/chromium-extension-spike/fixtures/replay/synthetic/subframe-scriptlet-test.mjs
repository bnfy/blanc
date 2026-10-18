import test from 'node:test';import assert from 'node:assert/strict';import {verifySubframes} from './subframe-scriptlet-verify.mjs';
const names=['same-origin','cross-origin','nested-cross-origin-csp','cross-csp-navigation','cross-fresh-document','child-exception','same-host-other-ancestor','same-host-ancestor-restored'];
function run(){return {browserKind:'chromium',faults:[],arrivals:[{url:'https://child.blanc-control.test/normal'}],results:names.map((name,i)=>{const flag=![2,5].includes(i),ancestor=i!==6,fetch=i===2?'NETWORK LEAK':'';return {name,url:'https://child.blanc-control.test/normal',expected:{flag,ancestor,fetch},first:{flag,ancestor,getter:flag},fetch,late:{flag,ancestor}};})};}
test('all bounded first-script outcomes verified',()=>assert.equal(verifySubframes(run()).early,8));
test('late success cannot mask a first-script miss',()=>{const r=run();r.results[1].first.flag=false;assert.throws(()=>verifySubframes(r));});
test('network leak and missing page response rejected',()=>{const r=run();r.results[1].fetch='NETWORK LEAK';assert.throws(()=>verifySubframes(r));const s=run();s.arrivals=[];assert.throws(()=>verifySubframes(s));});
test('duplicate case cannot fill a coverage cell',()=>{const r=run();r.results[1]=r.results[0];assert.throws(()=>verifySubframes(r));});
test('Electron diagnostic is not promoted to acceptance',()=>{const r=run();r.browserKind='electron';r.results[1].first.flag=false;assert.equal(verifySubframes(r).crossRuntimeAcceptance,false);});
