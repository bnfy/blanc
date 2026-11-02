// New scoped CSS grouping regression; no reference changes or passed-suite replay.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const require=createRequire(path.resolve('node_modules/fixture.cjs'));
const {chromium}=require('playwright');
const {parse}=require('@ghostery/adblocker-extended-selectors');
const [configFile,bundleFile,out]=process.argv.slice(2);
assert(out&&!fs.existsSync(out));fs.mkdirSync(out,{recursive:true});
const config=JSON.parse(fs.readFileSync(configFile));const bundle=fs.readFileSync(bundleFile,'utf8');
const report={scope:'same renderer bundle in isolated Chromium world; CSS property grouping only, not production broker or signed acceptance',bundleSha256:createHash('sha256').update(bundle).digest('hex'),checks:[]};
const browser=await chromium.launch({executablePath:config.chromium,headless:false,chromiumSandbox:true,args:['--use-mock-keychain','--no-first-run','--disable-background-networking','--blanc-blocker-assets='+config.engine,'--blanc-prototype-assets='+config.ui]});
try {
 const context=await browser.newContext();const page=await context.newPage();
 await page.setContent('<style>[test-hidden]{display:none!important}</style><style id="source"></style><div id="target">target</div><div id="neutral">ordinary</div>');
 const cdp=await context.newCDPSession(page),tree=await cdp.send('Page.getFrameTree');
 const world=await cdp.send('Page.createIsolatedWorld',{frameId:tree.frameTree.frame.id,worldName:'blanc-property-group-regression'});
 const evaluate=async expression=>{const r=await cdp.send('Runtime.evaluate',{contextId:world.executionContextId,expression,returnByValue:true});assert(!r.exceptionDetails,JSON.stringify(r.exceptionDetails));return r.result.value;};
 await evaluate(bundle);
 const attribute='data-blanc-property-0';
 await evaluate('globalThis.__blancProcedural.replace('+JSON.stringify([{ast:parse('#target:matches-attr('+attribute+')'),attribute:'test-hidden',properties:[{attribute,pattern:'Partner'}]}])+')');
 for(const [name,css,expectedHidden=true] of [['media','@media all { #target::before {content:"Partner"} }'],['supports','@supports (display: block) { #target::before {content:"Partner"} }'],['layer','@layer example { #target::before {content:"Partner"} }'],['nested','@media all { @supports (display:block) { @layer nested { #target::before {content:"Partner"} } } }'],['inactive-media','@media not all { #target::before {content:"Partner"} }',false],['inactive-supports','@supports (blanc-unknown: impossible) { #target::before {content:"Partner"} }',false]]) {
  await page.locator('#source').evaluate((e,css)=>e.textContent=css,css);
  await evaluate('globalThis.__blancProcedural.tick(true)');
  const hidden=await page.locator('#target').evaluate(e=>getComputedStyle(e).display==='none');
  report.checks.push({name,hidden,expectedHidden,neutralVisible:await page.locator('#neutral').isVisible(),temporaryMarkersCleared:await page.locator('['+attribute+']').count()===0});
  await page.locator('#source').evaluate(e=>e.textContent='');await evaluate('globalThis.__blancProcedural.tick(true)');
  report.checks.at(-1).revealedAfterRuleRemoval=await page.locator('#target').isVisible();
 }
 report.passed=report.checks.every(x=>x.hidden===x.expectedHidden&&x.neutralVisible&&x.temporaryMarkersCleared&&x.revealedAfterRuleRemoval);
} finally {await browser.close();report.cleanup=true;fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify(report));assert(report.passed);
