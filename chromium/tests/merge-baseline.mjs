// Replace a full baseline's scenarios with those a later --only run executed,
// keeping each scenario's own fork commit. Candidate and shipping reference
// must match; summaries are recomputed. Used to re-run only affected cases.
import fs from 'node:fs';
import {aggregateCases} from './results.mjs';
export function mergeBaseline(base,update){
 if(base.developmentSubset)throw Error('Base must be a full baseline');
 for(const k of ['platform','candidate','shippingCommit','sourceMapSha256'])if(base[k]!==update[k])throw Error('Runs disagree on '+k);
 if(JSON.stringify(base.candidateIdentity)!==JSON.stringify(update.candidateIdentity))throw Error('Runs disagree on candidate identity');
 if(JSON.stringify(base.assets)!==JSON.stringify(update.assets))throw Error('Runs disagree on Island assets');
 const ran=new Map(update.scenarios.filter(s=>s.cases.every(c=>c.result!=='not-run')).map(s=>[s.id,s]));
 const partial=update.scenarios.filter(s=>s.cases.some(c=>c.result!=='not-run')&&s.cases.some(c=>c.result==='not-run'));
 if(partial.length)throw Error('Re-run every example of a scenario: '+partial.map(s=>s.id));
 const merged={...base,scenarios:base.scenarios.map(s=>ran.get(s.id)??s),
  merges:[...(base.merges||[]),{forkCommit:update.forkCommit,subset:update.developmentSubset,scenarios:[...ran.keys()]}]};
 for(const s of merged.scenarios)if(aggregateCases(s.cases)!==s.result)throw Error('Inconsistent scenario '+s.id);
 const cases=merged.scenarios.flatMap(s=>s.cases);
 merged.summary=Object.fromEntries(['pass','fail','undefined','excluded'].map(r=>[r,merged.scenarios.filter(s=>s.result===r).length]));
 merged.executableSummary=Object.fromEntries(['pass','fail','undefined','excluded'].map(r=>[r,cases.filter(c=>c.result===r).length]));
 merged.executedCaseCount=cases.filter(c=>c.executed).length;
 return merged;
}
if(process.argv[1]?.endsWith('merge-baseline.mjs')){
 const [base,update,out]=process.argv.slice(2);if(!out)throw Error('Usage: merge-baseline.mjs full.json subset.json output.json');
 fs.writeFileSync(out,JSON.stringify(mergeBaseline(JSON.parse(fs.readFileSync(base)),JSON.parse(fs.readFileSync(update))),null,2)+'\n');
}
