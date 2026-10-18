import fs from 'node:fs'; import vm from 'node:vm'; import test from 'node:test'; import assert from 'node:assert/strict';
const text = fs.readFileSync(new URL('./ubo-document-start.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replaceAll('export ','');
async function run({wrongSender=false,privateTab=false,ready=true,store=true,enabled=true,deny=0,change=false,changedContext=false}={}) {
 const requests=[], calls=[]; let state={ready,generation:4};
 const sender={id:wrongSender?'other':'owned',tab:{id:17,incognito:privateTab},frameId:9,documentId:'doc',url:'about:srcdoc',origin:'null'};
 const job={documentId:'doc',tabId:17,frameId:9,url:'https://parent.test/',ancestors:['https://parent.test/page']};
 const context={chrome:{runtime:{id:'owned'}},current:()=>state,µb:{pageStoreFromTabId:()=>store?{getNetFilteringSwitch:()=>enabled}:null},hostnameFromURI:u=>new URL(u).hostname,domainFromHostname:h=>h,scriptletFilteringEngine:{retrieve:r=>{requests.push(r);if(change)state={ready:false,generation:5};return {mainWorld:'actual-engine'};}},fetch:async(url,options)=>{calls.push({url,options});return {status:calls.length===deny?403:200,json:async()=>changedContext&&calls.length===2?{...job,ancestors:[]}:job};},sender};
 const result=await vm.runInNewContext(`(async()=>{${text};return lateScript({type:'blanc-static-script'},sender);})()`,context);
 return {result,requests,calls};
}
test('late path uses browser selected URL and ancestors then confirms same document',async()=>{const r=await run();assert.equal(r.result.code,'actual-engine');assert.equal(r.calls.length,2);assert.equal(r.calls[0].options.body,r.calls[1].options.body);assert.equal(r.requests[0].url,'https://parent.test/');assert.equal(r.requests[0].ancestors[0].hostname,'parent.test');assert(r.requests[0].nocache);});
test('wrong sender private profile unready and absent store cannot get a payload',async()=>{for(const config of [{wrongSender:true},{privateTab:true},{ready:false},{store:false}])assert.equal((await run(config)).result,undefined);});
test('dead document or mismatched context rejects both before and after engine work',async()=>{for(const config of [{deny:1},{deny:2},{changedContext:true}])assert.equal((await run(config)).result,undefined);});
test('reload during selection discards stale generation',async()=>assert.equal((await run({change:true})).result,undefined));
test('disabled site returns empty and never queries scriptlet engine',async()=>{const r=await run({enabled:false});assert.equal(r.result.code,'');assert.equal(r.requests.length,0);});
