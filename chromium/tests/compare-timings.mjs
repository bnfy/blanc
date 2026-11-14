import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
export function compareTimings(before,after){
 if(!before.candidate||before.candidate!==after.candidate)throw Error('Timing comparison requires the same native candidate');
 const last=run=>new Map(run.attempts.map(a=>[a.id,a.result]));
 const a=last(before),b=last(after),ids=[...a.keys()].sort();
 if(JSON.stringify(ids)!==JSON.stringify([...b.keys()].sort()))throw Error('Timing sample changed');
 if(ids.length!==60||new Set(ids.map(id=>id.split(':')[0])).size<6)throw Error('Expected 60 cases across at least six feature files');
 const phases={};
 for(const name of new Set([...Object.keys(before.totals.phases),...Object.keys(after.totals.phases)])){
  const old=before.totals.phases[name]?.exclusiveMs??0,next=after.totals.phases[name]?.exclusiveMs??0;
  phases[name]={beforeMs:old,afterMs:next,changeMs:next-old};
 }
 return {candidate:before.candidate,caseCount:ids.length,featureFiles:new Set(ids.map(id=>id.split(':')[0])).size,
  beforeHarness:before.timingHarnessSha256,afterHarness:after.timingHarnessSha256,
  beforeMs:before.totals.totalMs,afterMs:after.totals.totalMs,phases,
  retries:{before:before.totals.retries,after:after.totals.retries},timeouts:{before:before.totals.timeouts,after:after.totals.timeouts},
  lostPasses:ids.filter(id=>a.get(id)==='pass'&&b.get(id)!=='pass'),
  results:ids.map(id=>({id,before:a.get(id),after:b.get(id)}))};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [before,after,out]=process.argv.slice(2);
 if(!before||!after||!out)throw Error('Usage: compare-timings.mjs before/timing.json after/timing.json comparison.json');
 const result=compareTimings(JSON.parse(fs.readFileSync(before)),JSON.parse(fs.readFileSync(after)));
 fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({candidate:result.candidate,beforeSeconds:result.beforeMs/1000,afterSeconds:result.afterMs/1000,lostPasses:result.lostPasses}));
}
