// Static adapter coverage for one slice: which cases can run, and what the
// rest still lack. Never launches a browser or credits a result.
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {matchStep} from './steps.mjs';
import {missingAdapters} from './world.mjs';
import {inSlice,slices} from './slices.mjs';
export function coverage(inventory,slice){
 const cases=[];
 for(const s of inventory.scenarios.filter(s=>inSlice(s,slice))){
  if(s.desktopApplicability==='excluded')continue;
  for(const c of s.cases){
   const missing=c.steps.flatMap(st=>{const m=matchStep(st.text);
    return !m?[{step:st.text}]:missingAdapters(m.definition).map(hook=>({hook}));});
   cases.push({id:c.id,rows:s.featureRows,missing});
  }
 }
 return cases;
}
if(fileURLToPath(import.meta.url)===process.argv[1]){
 const slice=process.argv[2]||'S1';if(!slices[slice])throw Error('Unknown slice '+slice);
 const cases=coverage(JSON.parse(fs.readFileSync(new URL('./../scenarios/inventory.json',import.meta.url))),slice);
 const ready=cases.filter(c=>!c.missing.length);
 const hooks={},steps={};for(const c of cases)for(const m of c.missing)m.hook?hooks[m.hook]=(hooks[m.hook]||0)+1:steps[m.step]=(steps[m.step]||0)+1;
 console.log(JSON.stringify({slice,cases:cases.length,ready:ready.length,readyIds:process.argv.includes('--ids')?ready.map(c=>c.id):undefined,
  missingHooks:Object.entries(hooks).sort((a,b)=>b[1]-a[1]),undefinedSteps:Object.keys(steps).length},null,process.argv.includes('--ids')?1:0));
}
