// One acceptance report per slice and platform, generated from a baseline:
// per-row case results with each failure's first line, plus JUnit.
import fs from 'node:fs';
import {slices} from './slices.mjs';
const xml=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const reason=c=>String(c.error||c.missingSteps?.map(m=>m.hooks?`${m.reason}: ${m.hooks.join(', ')}`:`${m.reason}: ${m.text}`)[0]||'').split('\n')[0].slice(0,240);
export function sliceReport(baseline,slice){
 const rows=slices[slice];
 const report={slice,platform:baseline.platform,candidate:baseline.candidate,shippingCommit:baseline.shippingCommit,forkCommit:baseline.forkCommit,
  merges:baseline.merges||[],summary:{pass:0,fail:0,undefined:0,excluded:0},rows:{}};
 const cases=[];
 for(const s of baseline.scenarios){
  const mapped=s.featureRows.filter(r=>rows.includes(r));if(!mapped.length)continue;
  for(const c of s.cases){
   const result=c.result==='not-run'?'undefined':c.result;report.summary[result]++;
   const entry={id:c.id,result,...(result==='pass'?{}:{reason:reason(c)}),...(c.retried?{retried:true}:{})};cases.push(entry);
   for(const r of mapped)(report.rows[r]??={pass:0,fail:0,undefined:0,excluded:0,cases:[]}),report.rows[r][result]++,report.rows[r].cases.push(entry);
  }
 }
 const junit=`<?xml version="1.0" encoding="UTF-8"?>\n<testsuite name="Blanc Chromium ${slice} ${baseline.platform}" tests="${cases.length}" failures="${report.summary.fail}" skipped="${report.summary.undefined+report.summary.excluded}">\n`+
  cases.map(c=>`  <testcase name="${xml(c.id)}">${c.result==='pass'?'':c.result==='fail'?`<failure message="${xml(c.reason)}"/>`:`<skipped message="${xml(c.reason)}"/>`}</testcase>`).join('\n')+'\n</testsuite>\n';
 return {report,junit};
}
if(process.argv[1]?.endsWith('slice-report.mjs')){
 const [baselineFile,slice,out]=process.argv.slice(2);if(!out)throw Error('Usage: slice-report.mjs baseline.json S1 reports/s1-macos');
 const {report,junit}=sliceReport(JSON.parse(fs.readFileSync(baselineFile)),slice);
 fs.writeFileSync(out+'.json',JSON.stringify(report,null,1)+'\n');fs.writeFileSync(out+'-junit.xml',junit);
 console.log(JSON.stringify(report.summary));
}
