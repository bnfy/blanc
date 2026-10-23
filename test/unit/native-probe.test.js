'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {nativeProbe}=require('../desktop/support/native-probe.cjs');
test('native audio evidence distinguishes output, timeout and signal failures',()=>{
  assert.deepEqual(nativeProbe('/probe',()=>'{"trials":[]}'),{trials:[]});
  const result=nativeProbe('/probe',()=>{throw Object.assign(new Error('probe'),{
    code:'ETIMEDOUT',status:null,signal:'SIGTERM',stderr:'x'.repeat(3000),
  });});
  assert.equal(result.code,'ETIMEDOUT');assert.equal(result.signal,'SIGTERM');
  assert.equal(result.stderr.length,2000);assert.equal(result.status,null);
  assert.equal(nativeProbe('/probe',()=>'{invalid').failure,'SyntaxError');
});
test('native audio probe is bounded and does not pass arguments or environment overrides',()=>{
  nativeProbe('/probe',(file,args,options)=>{
    assert.equal(file,'/probe');assert.deepEqual(args,[]);
    assert.equal(options.timeout,20000);assert.equal(options.maxBuffer,65536);
    assert.equal(options.env,undefined);return '{}';
  });
});
