import fs from 'node:fs';import vm from 'node:vm';import test from 'node:test';import assert from 'node:assert/strict';
const text=fs.readFileSync(new URL('./ubo-document-start.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replaceAll('export ','');
async function run({ready=true,store=true,enabled=true,change=false,code='engine-produced-code',frameId=0,ancestors=[]}={}){
 const calls=[],requests=[];let state={ready,generation:4};
 const context={µb:{pageStoreFromTabId:id=>{assert.equal(id,17);return store?{getNetFilteringSwitch:()=>enabled}:null;}},scriptletFilteringEngine:{retrieve:r=>{requests.push(r);if(change)state={ready:false,generation:5};return {mainWorld:code};}},hostnameFromURI:u=>new URL(u).hostname,domainFromHostname:h=>h,current:()=>state,setTimeout:()=>{},fetch:async(url,options)=>{calls.push({url,options});return {status:200,json:async()=>[{token:'browser-token',tabId:17,frameId,ancestors,url:'https://sample.test/a'}]};}};
 await vm.runInNewContext(`(async()=>{${text};await poll();})()`,context);return {calls,requests};
}
test('only actual current engine payload is returned for browser-bound document',async()=>{const {calls,requests}=await run();assert.equal(requests.length,1);assert.equal(requests[0].url,'https://sample.test/a');assert.equal(requests[0].frameId,0);assert.deepEqual(JSON.parse(calls[1].options.body),{token:'browser-token',code:'engine-produced-code'});});
test('unready engine never pulls jobs',async()=>assert.equal((await run({ready:false})).calls.length,0));
test('absent page store stays closed instead of becoming an exemption',async()=>assert.equal((await run({store:false})).calls.length,1));
test('disabled site releases with no payload and does not query scriptlet engine',async()=>{const {calls,requests}=await run({enabled:false});assert.equal(requests.length,0);assert.equal(JSON.parse(calls[1].options.body).code,'');});
test('filter generation change drops stale payload',async()=>assert.equal((await run({change:true})).calls.length,1));
test('engine exception can produce empty main-world payload',async()=>assert.equal(JSON.parse((await run({code:''})).calls[1].options.body).code,''));

test('subframe selection uses the browser frame and ancestors without hostname cache reuse',async()=>{const {requests}=await run({frameId:42,ancestors:['https://parent.test/a','https://top.test/']});assert.equal(requests[0].frameId,42);assert.equal(requests[0].nocache,true);assert.deepEqual(JSON.parse(JSON.stringify(requests[0].ancestors)),[{hostname:'parent.test',domain:'parent.test'},{hostname:'top.test',domain:'top.test'}]);});
test('malformed ancestor context cannot release a payload',async()=>{await assert.rejects(run({ancestors:[null]}));});
