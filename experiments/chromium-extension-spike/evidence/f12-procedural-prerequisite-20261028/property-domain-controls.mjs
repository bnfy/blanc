import fs from 'node:fs';
import assert from 'node:assert/strict';
import {FiltersEngine,CosmeticFilter} from '@ghostery/adblocker';
import {proceduralRules} from '../../native/blocker/procedural_rules.mjs';
const raw='allowed.example,~excluded.allowed.example#?#.pMain:has(div:-abp-properties(Partner))\nexcept.allowed.example#@?#.pMain:has(div:-abp-properties(Partner))';
const p=proceduralRules(raw,CosmeticFilter),engine=FiltersEngine.parse('',{loadExtendedSelectors:true});engine.update({newCosmeticFilters:p.filters});
const checks=[['allowed.example',1],['excluded.allowed.example',0],['except.allowed.example',0],['other.example',0]].map(([hostname,expected])=>{const result=engine.getCosmeticsFilters({hostname,domain:'allowed.example',getExtendedRules:true,getRulesFromHostname:true,getBaseRules:true});return {hostname,expected,actual:result.extended.length,pass:result.extended.length===expected}});
fs.writeFileSync(process.argv[2],JSON.stringify({scope:'offline transformed property rule selection',checks},null,2));assert(checks.every(c=>c.pass));
