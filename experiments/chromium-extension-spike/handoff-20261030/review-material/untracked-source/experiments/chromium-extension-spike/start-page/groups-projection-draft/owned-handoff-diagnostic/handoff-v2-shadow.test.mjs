import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../browser-check-groups-owned-handoff-v2-diagnostic.mjs',import.meta.url),'utf8');
test('actual preflight keeps callable guard helper in lexical scope',async()=>{
 assert.match(source,/import\s*\{guard,publicSample,HandoffError\}/);
 assert.doesNotMatch(source,/\b(?:const|let|var|function|class)\s+guard\b/);
 assert.match(source,/await guard\(proc,activationBounds,\{mode:'initial'\}\)/);
 const start=source.indexOf('  const guardPath=receiptPath.replace('),end=source.indexOf('  const guardTime=',start);
 assert(start>=0&&end>start);
 const fragment=source.slice(start,end);
 const exec=new Function('guard','receiptPath','fs','sha','receipt',`"use strict";\n${fragment}\nreturn guard({synthetic:true});`);
 let called=false;
 const result=await exec(async arg=>{called=true;assert.deepEqual(arg,{synthetic:true});return 'called'},'/fixture/receipt.json',
  {readFileSync:(p)=>{assert.equal(p,'/fixture/guard.log');return 'ninja: no work to do.\nBuild Succeeded: 0 steps';}},
  p=>{assert.equal(p,'/fixture/guard.log');return 'expected';},{guardPlanSha256:'expected'});
 assert(called);assert.equal(result,'called');
});
