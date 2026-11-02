import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareCertificateRevocation} from './certificate-revocation.mjs';
test('certificate recipe adds all eight upstream keys once and refuses an incomplete upstream shape',()=>{
 let rule;prepareCertificateRevocation((path,edits)=>{assert.equal(path,'net/cert/cert_verify_proc_blocklist.inc');[rule]=edits;});
 const apply=source=>{if(source.includes(rule.present))return source;assert.equal(source.split(rule.anchor).length,2,'upstream anchor changed');return source.replace(rule.anchor,rule.replacement);};
 const output=apply(rule.anchor);assert.equal((output.match(/\.pem/g)||[]).length,8);
 assert.equal(apply(output),output);assert.equal(rule.present,rule.replacement);
 assert.throws(()=>apply('partial // 0164d7ce upstream change'),/anchor changed/);
});
