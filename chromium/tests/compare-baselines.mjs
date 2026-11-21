// Compare executable-case results, never declaration totals or subset credit.
import fs from 'node:fs';
const [beforePath,afterPath]=process.argv.slice(2);
if(!beforePath||!afterPath)throw Error('Usage: compare-baselines.mjs BEFORE AFTER');
const before=JSON.parse(fs.readFileSync(beforePath)),after=JSON.parse(fs.readFileSync(afterPath));
if(before.incomplete||after.incomplete||before.developmentSubset||after.developmentSubset)throw Error('Complete inventories required');
const cases=b=>new Map(b.scenarios.flatMap(s=>s.cases.map(c=>[c.id,c.result])));
const a=cases(before),b=cases(after);
const report={before:before.candidate,after:after.candidate,beforeTotals:before.executableSummary,afterTotals:after.executableSummary,
 lost:[...a].filter(([id,result])=>result==='pass'&&b.get(id)!=='pass').map(([id])=>({id,result:b.get(id)??'missing'})),
 gained:[...b].filter(([id,result])=>result==='pass'&&a.get(id)!=='pass').map(([id])=>({id,previous:a.get(id)??'missing'})),
 removed:[...a.keys()].filter(id=>!b.has(id)),added:[...b.keys()].filter(id=>!a.has(id))};
console.log(JSON.stringify(report,null,2));
if(report.lost.length||report.removed.length)process.exitCode=1;
