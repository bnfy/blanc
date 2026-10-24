'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {finishFixture} = require('../desktop/support/fixture-cleanup.cjs');

test('fixture cleanup preserves the primary failure when profile removal is locked', async () => {
  const report = {passed:false, failure:'Timed out: automatic successor'};
  const writes = [], ran = [];
  await finishFixture(report, [
    ['processes', async () => ran.push('processes')],
    ['profile', async () => { throw Object.assign(new Error('private profile path'), {code:'EBUSY'}); }],
    ['installation', async () => ran.push('installation')],
  ], async () => writes.push(structuredClone(report)));
  assert.deepEqual(ran, ['processes', 'installation']);
  assert.equal(writes[0].failure, report.failure);
  assert.deepEqual(writes[1].cleanupErrors, [{stage:'profile',code:'EBUSY'}]);
  assert.equal(writes[1].failure, report.failure);
  assert.equal(writes[1].passed, false);
  assert(!JSON.stringify(writes).includes('private profile path'));
});

test('a passing test becomes failed if teardown fails, and evidence failure does not stop cleanup', async () => {
  const report = {passed:true};
  let writes=0, cleaned=false;
  await finishFixture(report,[['profile',async()=>{cleaned=true;}]],async()=>{
    if(++writes===1)throw Object.assign(new Error('disk'),{code:'EIO'});
  });
  assert.equal(cleaned,true);assert.equal(writes,2);assert.equal(report.passed,false);
  assert.deepEqual(report.cleanupErrors,[{stage:'initial-evidence',code:'EIO'}]);
});

test('a successful fixture is recorded as passing only after cleanup completes', async () => {
  const report={passed:true}, writes=[];
  await finishFixture(report,[['profile',async()=>{}]],async()=>writes.push(structuredClone(report)));
  assert.equal(writes[0].passed,false);
  assert.equal(writes[1].passed,true);
  assert.equal(writes[1].cleanupComplete,true);
});
