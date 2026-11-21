import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const app='/Users/anthonyjloria/Projects/BlancPreviewArtifacts/blocker-recovery-20261028/Blanc Chromium Preview.app';
const raw=fs.readFileSync(app+'/Contents/Resources/BlancBlocker/engine.js','utf8');
const marker='globalThis.blancDecide=';assert.equal(raw.split(marker).length,2);
// Expose the unchanged embedded engine for an offline oracle only. Never write
// this diagnostic adapter into a candidate or load it in a browser profile.
const diagnostic=raw.replace(marker,'globalThis.fixtureCosmetics=args=>engine.getCosmeticsFilters(args);'+marker);
const context=vm.createContext({blancEncode:s=>new TextEncoder().encode(s),blancDecode:b=>new TextDecoder('utf8',{ignoreBOM:true}).decode(b)});
vm.runInContext(diagnostic,context,{timeout:30000});
const result=context.fixtureCosmetics({url:'http://cosmetic.example/start',hostname:'cosmetic.example',domain:'cosmetic.example',ids:['AC_ad','neutral'],classes:[],hrefs:[],getBaseRules:true,getInjectionRules:false,getExtendedRules:false,getRulesFromDOM:true,getRulesFromHostname:true});
assert(result.styles.includes('#AC_ad'));assert(!result.styles.includes('#neutral'));
console.log(JSON.stringify({scope:'offline embedded-engine rule-selection oracle; not candidate injection',engineSha256:createHash('sha256').update(raw).digest('hex'),result},null,2));
