import fs from 'node:fs';import path from 'node:path';import {createRequire} from 'node:module';import assert from 'node:assert/strict';
const base=path.resolve('node_modules'),require=createRequire(path.join(base,'fixture.cjs'));
const {chromium}=require('playwright'),{parse}=require('@ghostery/adblocker-extended-selectors');
const out=process.argv[2];assert(out&&!fs.existsSync(out));fs.mkdirSync(out,{recursive:true});
const bundle=fs.readFileSync('../artifacts/procedural-properties-renderer-20261028/procedural.js','utf8');
const browser=await chromium.launch({executablePath:'/Users/anthonyjloria/Projects/BlancChromium157Recovery/src/out/BlancPrototype/Blanc Prototype.app/Contents/MacOS/Blanc Prototype',headless:false,chromiumSandbox:true,args:['--use-mock-keychain','--no-first-run','--disable-background-networking','--blanc-blocker-assets='+path.resolve('../artifacts/procedural-engine-stylefix-20261028'),'--blanc-prototype-assets='+path.resolve('experiments/chromium-extension-spike/generated')]});
const results=[];
try{const context=await browser.newContext(),page=await context.newPage();
await page.setContent('<style>[test-hidden]{display:none!important}</style><section id="parent"><span id="target" style="display:block">Sponsored</span></section><div id="neutral">ordinary</div>');
const cdp=await context.newCDPSession(page),tree=await cdp.send('Page.getFrameTree'),world=await cdp.send('Page.createIsolatedWorld',{frameId:tree.frameTree.frame.id,worldName:'blanc-procedural-evaluator-fixture'});
const evaluate=async expression=>{const r=await cdp.send('Runtime.evaluate',{contextId:world.executionContextId,expression,returnByValue:true});if(r.exceptionDetails)throw Error('isolated evaluator exception');return r.result.value;};
await evaluate(bundle);
const cases=[['Partner','content: "Partner";'],['*data:image*','background-image: url("data:image/png;base64,AAAA");'],['base64','background-image: url("data:image/png;base64,AAAA");'],['data:','background-image: url("data:image/png;base64,AAAA");'],['float: right; margin-top: 30px; width: 50%;','width:50%;margin-top:30px;float:right;'],['height: 300px; width: 315px;','width:315px;height:300px;'],['image/','background-image: url("data:image/png;base64,AAAA");']];
for(const [index,[pattern,css]] of cases.entries()) {
 await evaluate('globalThis.__blancProcedural.replace([]);globalThis.__blancProcedural.tick(true)');
 await page.setContent('<style>[test-hidden]{display:none!important}</style><style id="source">.propertyTarget::before {'+css+'}</style><section id="parent"><div class="propertyTarget" id="target"></div></section><div id="neutral">Partner</div><div id="inline" style="'+css.replaceAll('"','&quot;')+'">inline</div>');
 const attribute='data-blanc-property-'+index;
 const rules=[{ast:parse('.propertyTarget:matches-attr('+attribute+')'),attribute:'test-hidden',properties:[{attribute,pattern}]}];
 await evaluate('globalThis.__blancProcedural.replace('+JSON.stringify(rules)+');globalThis.__blancProcedural.tick(true)');
 const hidden=await page.locator('#target').evaluate(e=>getComputedStyle(e).display==='none');
 const neutralVisible=await page.locator('#neutral').isVisible(),inlineVisible=await page.locator('#inline').isVisible();
 const noMarkers=await page.locator('['+attribute+']').count()===0;
 await page.locator('#source').evaluate(e=>e.textContent='.propertyTarget::before {content:"ordinary";}');
 await evaluate('globalThis.__blancProcedural.tick(true)');
 const revealed=await page.locator('#target').evaluate(e=>getComputedStyle(e).display!=='none');
 await page.locator('#source').evaluate((e,css)=>e.textContent='.propertyTarget::before {'+css+'}',css);
 await evaluate('globalThis.__blancProcedural.tick(true)');
 const restored=await page.locator('#target').evaluate(e=>getComputedStyle(e).display==='none');
 results.push({pattern,hidden,neutralVisible,inlineVisible,noMarkers,revealed,restored});
}

}finally{await browser.close();fs.writeFileSync(out+'/report.json',JSON.stringify({scope:'standalone same-bundle evaluator in isolated browser world; not production rule selection',results},null,2));}
console.log(JSON.stringify(results));assert(results.every(r=>r.hidden&&r.neutralVisible&&r.inlineVisible&&r.noMarkers&&r.revealed&&r.restored));
