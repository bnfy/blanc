// Checks pure outcome classification and source ordering only. No browser or fixture.
import fs from 'node:fs';import assert from 'node:assert/strict';import vm from 'node:vm';
const s=fs.readFileSync(new URL('./private-search-diagnostic-v4.mjs',import.meta.url),'utf8');
const start=s.indexOf('function classifyIslandOutcome('),end=s.indexOf('\nfunction inventory(',start);assert.ok(start>=0&&end>start);
const classify=vm.runInNewContext(`${s.slice(start,end)}\nclassifyIslandOutcome`),url='http://127.0.0.1:1/search?q=synthetic',ctx='context';
const sample={arrived:true,state:{hidden:true,invalid:null,noticeHidden:true},active:true,private:true,committedUrl:url,documentId:'7',frameUrl:url,document:{url,state:'complete'},contextId:ctx};
assert.equal(classify(sample,url,ctx),'complete');
assert.equal(classify({...sample,state:{hidden:false,invalid:null,noticeHidden:true}},url,ctx),'pending');
assert.equal(classify({...sample,committedUrl:'old'},url,ctx),'pending');
assert.equal(classify({...sample,contextId:'other'},url,ctx),'pending');
assert.equal(classify({...sample,arrived:false},url,ctx),'pending');
assert.equal(classify({...sample,state:{hidden:false,invalid:'true',noticeHidden:false,notice:'failed'}},url,ctx),'error');
assert.ok(s.includes('proof.firstAttemptFailed=!result.ok'));assert.ok(s.includes('proof.exploratoryPass=proof.firstAttemptFailed===false'));
assert.ok(s.indexOf("proof.checks.push('private marker absent from closed regular History')")<s.indexOf("assert.ok(islandPassed,"));
assert.ok(s.includes('const observeDeadline=Date.now()+12000'));assert.ok(s.includes('islandObservation.samples.length>10'));
console.log('PASS arrival-vs-commit, visible error, context, first-attempt, bounded observation and closed History ordering; no fixture/browser run');
