// Isolated readiness predicate checks. No fixture import, sockets or browser.
import fs from 'node:fs';import assert from 'node:assert/strict';import vm from 'node:vm';
const s=fs.readFileSync(new URL('./private-search-diagnostic-v3.mjs',import.meta.url),'utf8');
const start=s.indexOf('function isPrivateReady('),end=s.indexOf('\nfunction inventory(',start);assert.ok(start>=0&&end>start);
const ready=vm.runInNewContext(`${s.slice(start,end)}\nisPrivateReady`),url='http://127.0.0.1:1/private-probe-fixture',ctx='ctx';
const base={serverArrival:true,active:true,private:true,visibleUrl:url,committedUrl:url,documentId:'42',frameUrl:url,document:{url,state:'complete'},contextId:ctx};
assert.equal(ready(base,url,ctx),true);
for(const change of [{serverArrival:false},{active:false},{private:false},{visibleUrl:''},{committedUrl:''},{documentId:'0'},{documentId:'no'},{frameUrl:''},{document:{url,state:'loading'}},{contextId:'other'}])assert.equal(ready({...base,...change},url,ctx),false,JSON.stringify(change));
assert.ok(s.indexOf('proof.privateReadiness.ready=true') < s.indexOf('const probeQuery='));
assert.ok(s.includes('proof.privateReadiness.failure=e.message'));assert.ok(s.includes('if(proof.privateReadiness.samples.length>10)'));
console.log('PASS independent arrival, document, tab and context readiness edge cases; no fixture/browser run');
