const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const original=fs.readFileSync('test/unit/adblock-scriptlets.test.js','utf8');const body=original.slice(original.indexOf('function proxyScriptlet('),original.indexOf('\nfunction makeContext('));const fixture=vm.createContext({});vm.runInContext(body,fixture);
const scripts=[fixture.proxyScriptlet('first'),fixture.proxyScriptlet('second')];
const page=()=>{const c=vm.createContext({hits:[]});vm.runInContext('globalThis.fetch=function originalFetch(v){return v}',c);return c};
const baseline=page();scripts.forEach(s=>vm.runInContext(s,baseline));assert.throws(()=>vm.runInContext('Function.prototype.toString.call(fetch)',baseline),/Maximum call stack/);
const adapter=vm.createContext({engine:{getCosmeticsFilters:()=>({styles:'',scripts})}});vm.runInContext(fs.readFileSync('experiments/chromium-extension-spike/native/blocker/cosmetic_adapter.js','utf8'),adapter);
const result=JSON.parse(adapter.blancCosmetics('{"initial":true}'));const c=page();result.scripts.forEach(s=>vm.runInContext(s,c));assert.equal(vm.runInContext('fetch("ok")',c),'ok');assert.deepEqual(Array.from(c.hits),['second','first']);assert.match(vm.runInContext('Function.prototype.toString.call(fetch)',c),/originalFetch/);
const reference=require(process.cwd()+'/src/main/adblock-scriptlets.js');assert.deepEqual(result.scripts,scripts.map(reference.isolateScriptlet));
const report={baselineRecursionReproduced:true,adapterMatchesProductionWrapper:true,stackedFetchUsable:true,functionToStringUsable:true,checks:4};fs.writeFileSync('../evidence/cosmetic-isolation-adapter.json',JSON.stringify(report,null,2)+'\n');console.log(report);
