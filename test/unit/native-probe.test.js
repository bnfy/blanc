'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {nativeProbe}=require('../desktop/support/native-probe.cjs');
const {hostAudioEvidence}=require('../desktop/support/host-audio-evidence.cjs');
test('native audio evidence distinguishes output, timeout and signal failures',()=>{
  assert.deepEqual(nativeProbe('/probe',()=>'{"trials":[]}'),{trials:[]});
  const result=nativeProbe('/probe',()=>{throw Object.assign(new Error('probe'),{
    code:'ETIMEDOUT',status:null,signal:'SIGTERM',stderr:'x'.repeat(3000),
  });});
  assert.equal(result.code,'ETIMEDOUT');assert.equal(result.signal,'SIGTERM');
  assert.equal(result.stderr.length,2000);assert.equal(result.status,null);
  assert.equal(nativeProbe('/probe',()=>'{invalid').failure,'SyntaxError');
});
test('host audio evidence only samples the audio daemon and bounds read-only commands',()=>{
  const calls=[];
  const result=hostAudioEvidence((file,args,options)=>{
    calls.push([file,args]);assert(options.timeout<=15000);
    if(file==='/bin/ps')return ' 123 /usr/sbin/coreaudiod\n 456 /Applications/Blanc.app/Contents/MacOS/Blanc\n';
    return 'sample';
  });
  assert.deepEqual(result.stacks,[{pid:123,sample:'sample'}]);
  assert.deepEqual(calls.find(([file])=>file==='/usr/bin/sudo')[1],['-n','/usr/bin/sample','123','2','1','-file','/dev/stdout']);
  assert.equal(calls.length,4);
});
test('native audio probe is bounded and does not pass arguments or environment overrides',()=>{
  nativeProbe('/probe',(file,args,options)=>{
    assert.equal(file,'/probe');assert.deepEqual(args,[]);
    assert.equal(options.timeout,20000);assert.equal(options.maxBuffer,65536);
    assert.equal(options.env,undefined);return '{}';
  });
});
