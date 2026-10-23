'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {binaryRelative,validateBinary}=require('../desktop/support/cdm-lifecycle.cjs');
test('Mac CDM fixtures distinguish native Mach-O architectures and pinned vendor bytes',()=>{
  const pins=require('../desktop/fixtures/cdm-lifecycle-mac.json');
  for(const [arch,cpu] of [['x64',0x01000007],['arm64',0x0100000c]]){
    const bytes=Buffer.alloc(32);bytes.writeUInt32LE(0xfeedfacf,0);bytes.writeUInt32LE(cpu,4);
    validateBinary(bytes,'darwin-'+arch);
    assert.throws(()=>validateBinary(bytes,'darwin-'+(arch==='x64'?'arm64':'x64')),/architecture/);
    assert.match(binaryRelative('darwin-'+arch),new RegExp('mac_'+arch+'/libwidevinecdm.dylib$'));
    for(const fixture of [pins[arch].previous,pins[arch].current]){
      assert.match(fixture.source,/\/blob\/[a-f0-9]{40}\//);assert.match(fixture.sha512,/^[a-f0-9]{128}$/);
      assert.match(fixture.url,/^https:\/\/www\.google\.com\/dl\//);assert(fixture.bytes>20000000);
    }
  }
});
test('Mac lifecycle keeps exact mapped CDM, VMP, unmuted and sandbox gates',()=>{
  const source=fs.readFileSync('test/desktop/ecs-cdm-lifecycle-mac.mjs','utf8');
  for(const guard of ['assertCdmVersionAbsent(profile,fixtures.current.version)','result.status,2','result.muted,false',
    'inspectCdmProcess(main,application)','stage.mappedSha256,fixture.sha256','rollback.automaticVendorRollback=false',
    'process.env.BLANC_EXPECTED_ASAR_SHA256','report.profilesRemoved,true'])assert(source.includes(guard));
  assert.doesNotMatch(source,/--no-sandbox|disable-component-update|adblockEnabled:false/);
  const workflow=fs.readFileSync('.github/workflows/ublock-origin.yml','utf8');
  assert.match(workflow,/inputs.ecs_fresh_mac_cdm_only && fromJSON\('\["lifecycle"\]'\)/);
  assert.match(workflow,/BLANC_EXPECTED_ASAR_SHA256: \$\{\{ matrix.app_sha \}\}/);
  assert.match(workflow,/node "\$\{WRAPPER\[@\]\}" test\/desktop\/ecs-cdm-lifecycle-mac.mjs/);
});
