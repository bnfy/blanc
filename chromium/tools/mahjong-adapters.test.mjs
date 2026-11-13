import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {mahjong} from '../tests/adapters/mahjong.mjs';

const shipping=fs.readFileSync(new URL('../../src/main/test-hook.js',import.meta.url),'utf8');
const url='chrome://blanc-prototype/pages/mahjong.html?deal=peaks-91005';
function fixture(result={}){
 const expressions=[],calls=[];
 const page={targetId:'mahjong-active',evalExpression:async expression=>{
  expressions.push(expression);
  if(expression==='location.origin')return 'chrome://blanc-prototype';
  if(expression==='navigator.clipboard.readText()')return 'actual clipboard text';
  return structuredClone(result);
 }};
 return {expressions,calls,world:{
  snapshot:async()=>({activeTabId:2,tabs:[{id:1,url},{id:2,url}]}),
  app:{refresh:async()=>{},windows:()=>[page]},
  native:async(method,args)=>{calls.push([method,args]);return method==='tabTargets'?{'2':'mahjong-active'}:true;},
  fixture:{browser:{send:async(method,args)=>{calls.push([method,args]);}}},
 }};
}
for(const name of ['readMahjongDom','readMahjongDealState','copyMahjongDealFromBoards','readMahjongCompletionGeometry','readMahjongRecordsGeometry','rapidUndoMahjongMatch','auditMahjongCorrectness']){
 test(`${name} evaluates shipping's exact renderer body in the active duplicate-URL target`,async()=>{
  const f=fixture({url});
  const start=shipping.indexOf(`async ${name}()`);
  const raw=shipping.slice(start).match(/executeJavaScript\(`([\s\S]*?)`(?:, true)?\)/)[1];
  // The page runs the template's cooked text (shipping's \\s reaches the page
  // as \s), so compare that. These bodies escape only \\, \` and \$.
  assert.ok(!raw.replace(/\\[\\`$]/g,'').includes('\\'),`${name}: an escape this test does not cook`);
  const body=raw.replace(/\\([\\`$])/g,'$1');
  const result=await mahjong[name](f.world);
  assert.ok(f.expressions.includes(body));
  if(name==='readMahjongDom')assert.equal(result.url,'blanc://mahjong/?deal=peaks-91005');
 });
}
test('copy bridges actual clipboard contents and restores permission even on read failure',async()=>{
 const f=fixture({live:'Deal link copied.',boardsOpen:true});
 assert.deepEqual(await mahjong.copyMahjongDealFromBoards(f.world),{live:'Deal link copied.',boardsOpen:true});
 assert.ok(f.calls.some(([m,a])=>m==='setTestClipboard'&&a[0]==='actual clipboard text'));
 assert.equal(f.calls.at(-1)[1].setting,'prompt');
 const page=f.world.app.windows()[0],evaluate=page.evalExpression;
 page.evalExpression=async e=>{if(e==='navigator.clipboard.readText()')throw Error('read denied');return evaluate(e);};
 await assert.rejects(()=>mahjong.copyMahjongDealFromBoards(f.world),/read denied/);
 assert.equal(f.calls.at(-1)[1].setting,'prompt');
});
test('zoom setter retains shipping coercion and bounds',async()=>{
 for(const [input,expected] of [[undefined,1],[0,1],['1.25',1.25],[-2,0.5],[Infinity,3]]){
  const f=fixture();await mahjong.setActiveTabZoomFactor(f.world,input);
  assert.deepEqual(f.calls,[['setActiveTabZoomFactor',[expected]]]);
 }
});
