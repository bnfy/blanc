const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const source = fs.readFileSync(path.join(__dirname, 'host.candidate.js'), 'utf8');
const first = source.indexOf('  function destination(value) {');
const last = source.indexOf('\n  const implemented = {', first);
assert(first >= 0 && last > first);
let snapshot = {activeTabId:'7',searchSelectionEpoch:'41',tabs:[{id:7,searchDocumentId:'22',committedUrl:'https://example.test/'}]};
const calls = [];
const scope = new Function('snapshot','nativeId','request', `${source.slice(first,last)}\nreturn {destination,searchCurrent};`);
const {destination,searchCurrent}=scope(snapshot, n=>Number(n), (...args)=>{calls.push(args);return Promise.resolve('observed');});
const methodFirst=source.indexOf('    createTab: async (url, options) => {');
const methodLast=source.indexOf('    openPage: async (name, section) => {',methodFirst);
assert(methodFirst>=0 && methodLast>methodFirst);
const methods=new Function('snapshot','nativeId','request','refresh','show', `${source.slice(first,last)}\nreturn {${source.slice(methodFirst,methodLast)}};`);
const methodCalls=[];
const api=methods(snapshot,n=>Number(n),(method,args)=>{methodCalls.push({method,args});return Promise.resolve(method==='createSearchTab'?{status:'committed',tabId:8,selectionEpoch:'42'}:true)},async()=>{throw Error('synthetic refresh failure')},async()=>{});
const vectors = [
  ['hello world', {query:'hello world'}], [' tea & cake ',{query:'tea & cake'}],
  ['https://example.test/a',{url:'https://example.test/a'}], ['example.test/path',{url:'https://example.test/path'}],
  ['localhost:8080/a',{url:'http://localhost:8080/a'}], ['192.168.1.1/a',{url:'http://192.168.1.1/a'}],
  ['localhost?token=fixture',{url:'http://localhost?token=fixture'}], ['127.0.0.1?token=fixture',{url:'http://127.0.0.1?token=fixture'}],
  ['localhost#fragment',{url:'http://localhost#fragment'}], ['127.0.0.1#fragment',{url:'http://127.0.0.1#fragment'}],
  ['bücher.de',{url:'https://bücher.de'}], ['mailto:<redacted-email>',{external:'mailto:<redacted-email>'}],
  ['tel:+15551234567',{external:'tel:+15551234567'}], ['[::1]:8080/',{url:'http://[::1]:8080/'}],
  ['site:example.test privacy',{query:'site:example.test privacy'}], ['foo/bar',{query:'foo/bar'}],
];
for(const [input,expected] of vectors) assert.deepEqual(destination(input),expected);
assert.throws(()=>destination('  '));
for (const text of ['<local-home>/private.html', './private.txt', '../private.txt', 'C:\\Users\\test', '\\\\server\\share', 'file:///Users/test', '::1', 'custom://opaque']) assert.throws(()=>destination(text));
(async()=>{
  assert.equal(await searchCurrent(7,'ordinary query'),'observed');
  assert.deepEqual(calls.pop(),['searchTab',[7,'ordinary query','22','https://example.test/','41']]);
  assert.equal(await searchCurrent(7,'other query','createSearchTab'),'observed');
  assert.deepEqual(calls.pop(),['createSearchTab',[7,'other query','22','https://example.test/','41']]);
  await assert.rejects(()=>searchCurrent(8,'stale'));
  assert.equal(calls.length,0);
  await api.navigate(7,'https://example.test/path');assert.equal(methodCalls.pop().method,'navigateTab');
  await api.navigate(7,'mailto:<redacted-email>');assert.equal(methodCalls.pop().method,'externalTab');
  await api.navigate(7,'ordinary query');assert.equal(methodCalls.pop().method,'searchTab');
  await api.search(7,'example.test');assert.equal(methodCalls.pop().method,'searchTab');
  const outcome=await api.createTab('ordinary query',{});assert.equal(methodCalls.pop().method,'createSearchTab');assert.equal(outcome.status,'committed');assert.equal(outcome.tabId,8);
  console.log(`host routing checks=${vectors.length+21} failures=0; synthetic scope only`);
})().catch(e=>{console.error(e);process.exitCode=1});
