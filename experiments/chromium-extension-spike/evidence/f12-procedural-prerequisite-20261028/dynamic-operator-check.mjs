import fs from 'node:fs';import path from 'node:path';import {createRequire} from 'node:module';import assert from 'node:assert/strict';
const base=path.resolve('node_modules'),require=createRequire(path.join(base,'fixture.cjs'));
const {chromium}=require('playwright'),{parse}=require('@ghostery/adblocker-extended-selectors');
const out=process.argv[2];assert(out&&!fs.existsSync(out));fs.mkdirSync(out,{recursive:true});
const bundle=fs.readFileSync('../artifacts/procedural-renderer-stylefix-20261028/procedural.js','utf8');
const browser=await chromium.launch({executablePath:'/Users/anthonyjloria/Projects/BlancChromium157Recovery/src/out/BlancPrototype/Blanc Prototype.app/Contents/MacOS/Blanc Prototype',headless:false,chromiumSandbox:true,args:['--use-mock-keychain','--no-first-run','--disable-background-networking','--blanc-blocker-assets='+path.resolve('../artifacts/procedural-engine-stylefix-20261028'),'--blanc-prototype-assets='+path.resolve('experiments/chromium-extension-spike/generated')]});
const results=[];
try{const context=await browser.newContext(),page=await context.newPage();
await page.setContent('<style>[test-hidden]{display:none!important}</style><section id="parent"><span id="target" style="display:block">Sponsored</span></section><div id="neutral">ordinary</div>');
const cdp=await context.newCDPSession(page),tree=await cdp.send('Page.getFrameTree'),world=await cdp.send('Page.createIsolatedWorld',{frameId:tree.frameTree.frame.id,worldName:'blanc-procedural-evaluator-fixture'});
const evaluate=async expression=>{const r=await cdp.send('Runtime.evaluate',{contextId:world.executionContextId,expression,returnByValue:true});if(r.exceptionDetails)throw Error('isolated evaluator exception');return r.result.value;};
await evaluate(bundle);
for(const [name,selector,id] of [['has-text','#target:has-text(Sponsored)','target'],['matches-css','#target:matches-css(display: block)','target'],['upward','#target:upward(1)','parent'],['xpath','#parent:xpath(.//span)','target']]){
await evaluate('globalThis.__blancProcedural.replace([]);globalThis.__blancProcedural.tick(true)');
const rules=[{ast:parse(selector),attribute:'test-hidden'}];
await evaluate('globalThis.__blancProcedural.replace('+JSON.stringify(rules)+');globalThis.__blancProcedural.tick(true)');
const first=await page.locator('#'+id).evaluate(e=>getComputedStyle(e).display==='none');
await evaluate('globalThis.__blancProcedural.tick(true)');
const repeated=await page.locator('#'+id).evaluate(e=>getComputedStyle(e).display==='none');
const dynamic=[];
const inspect=async label=>{await evaluate('globalThis.__blancProcedural.tick(false)');dynamic.push({label,hidden:await page.locator('#'+id).evaluate(e=>getComputedStyle(e).display==='none'),neutralVisible:await page.locator('#neutral').isVisible(),metrics:await evaluate('({...globalThis.__blancProcedural.metrics})')});};
// Every operator must resume matching a newly inserted subtree, not just retain
// markers on the original node. Native scheduling is covered separately.
await page.evaluate(()=>document.querySelector('#parent').remove());
await evaluate('globalThis.__blancProcedural.tick(false)');
await page.evaluate(()=>{const p=document.createElement('section');p.id='parent';p.innerHTML='<span id="target" style="display:block">Sponsored</span>';document.body.append(p)});
await inspect('inserted subtree');
await page.evaluate(()=>{const wrapper=document.createElement('article');wrapper.id='moved';document.body.append(wrapper);wrapper.append(document.querySelector('#parent'))});
await inspect('moved subtree');
await page.evaluate(()=>new Promise(resolve=>setTimeout(()=>{document.querySelector('#target').setAttribute('data-timer','changed');resolve()},30)));
await inspect('timer attribute mutation');
if(name==='has-text'||name==='matches-css') {
 await page.evaluate(name=>{const e=document.querySelector('#target');if(name==='has-text')e.textContent='ordinary';else e.style.display='inline'},name);
 await evaluate('globalThis.__blancProcedural.tick(false)');
 dynamic.push({label:'nonmatching mutation reveals',hidden:!(await page.locator('#target').isVisible()),expectedHidden:false});
 await page.evaluate(()=>{const e=document.querySelector('#target');e.textContent='Sponsored';e.style.display='block'});
 await inspect('matching mutation reapplies');
}
results.push({name,first,repeated,dynamic,neutralVisible:await page.locator('#neutral').isVisible(),metrics:await evaluate('globalThis.__blancProcedural.metrics')});
}
}finally{await browser.close();fs.writeFileSync(out+'/report.json',JSON.stringify({scope:'standalone same-bundle evaluator in isolated browser world; not production rule selection',results},null,2));}
console.log(JSON.stringify(results));assert(results.every(r=>r.first&&r.repeated&&r.neutralVisible&&r.dynamic.every(d=>d.hidden===(d.expectedHidden??true)&&d.neutralVisible!==false)));
