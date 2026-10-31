import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeBaseline} from './merge-baseline.mjs';
const run=(commit,scenarios,extra={})=>({platform:'macos',candidate:'c',candidateIdentity:{id:'c'},shippingCommit:'s',sourceMapSha256:'m',forkCommit:commit,scenarios,...extra});
const sc=(id,result,commit)=>({id,forkCommit:commit,result,cases:[{id:id+':plain',result,executed:result!=='not-run'&&result!=='undefined'}]});
test('re-run scenarios replace the base and keep their own fork commit',()=>{
 const merged=mergeBaseline(run('a',[sc('x','fail','a'),sc('y','pass','a')]),run('b',[sc('x','undefined','b'),sc('y','not-run','b')],{developmentSubset:'x'}));
 assert.deepEqual(merged.scenarios.map(s=>[s.id,s.result,s.forkCommit]),[['x','undefined','b'],['y','pass','a']]);
 assert.deepEqual(merged.merges,[{forkCommit:'b',subset:'x',scenarios:['x']}]);
 assert.equal(merged.executableSummary.pass,1);
 assert.equal(merged.developmentSubset,undefined);
});
test('runs on different candidates never merge',()=>{
 assert.throws(()=>mergeBaseline(run('a',[]),{...run('b',[]),candidate:'d'}),/candidate/);
});
