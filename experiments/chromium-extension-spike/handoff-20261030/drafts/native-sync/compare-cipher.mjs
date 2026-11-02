import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const dir=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(dir,'../../../..');
const revision='85883b1afa11375e1300130914d6f40c5388af21';
const source=execFileSync('git',['show',`${revision}:src/main/sync-crypto.js`],{cwd:repo,encoding:'utf8'});
const context={module:{exports:{}},Buffer,require:name=>{assert.equal(name,'crypto');return crypto}};
vm.runInNewContext(source,context);const shipping=context.module.exports;
const [binary,evidence]=process.argv.slice(2);assert(binary&&evidence);
const key=crypto.createHash('sha256').update('Blanc native compatibility TEST KEY ONLY').digest();
const plains=['','ASCII record','{"devices":[],"unicode":"日本語 🛡️"}','é e\u0301\n\t\u0000','\uffff\ufdd0', 'x'.repeat(256*1024)];
const good=plains.map(plain=>({plain:Buffer.from(plain).toString('base64'),blob:shipping.encrypt(key,plain)}));
const bad=[];const clone=()=>structuredClone(good[2].blob);
for(const field of ['iv','ct','tag']){const blob=clone(),bytes=Buffer.from(blob[field],'base64');bytes[0]^=1;blob[field]=bytes.toString('base64');bad.push(blob)}
for(const patch of [{v:2},{iv:''},{tag:''},{ct:'!'},{tag:clone().tag+'\n'},{iv:clone().iv.replace(/.$/,'_')},{ct:'x'.repeat(512*1024+1)}])bad.push({...clone(),...patch});
bad.push(shipping.encrypt(crypto.randomBytes(32),plains[2]));
const invalidIv=crypto.randomBytes(12),invalid=crypto.createCipheriv('aes-256-gcm',key,invalidIv);
bad.push({v:1,iv:invalidIv.toString('base64'),ct:Buffer.concat([invalid.update(Buffer.from([255])),invalid.final()]).toString('base64'),tag:invalid.getAuthTag().toString('base64')});
const size=n=>Buffer.byteLength(JSON.stringify({v:1,iv:'a'.repeat(16),ct:'a'.repeat(4*Math.ceil(n/3)),tag:'a'.repeat(24)}));
let boundary=0,upper=512*1024;
while(boundary<upper){const middle=Math.ceil((boundary+upper)/2);if(size(middle)<=512*1024)boundary=middle;else upper=middle-1;}
const input=path.join(evidence,'vectors.json'),output=path.join(evidence,'native-envelopes.json');
fs.writeFileSync(input,JSON.stringify({key:key.toString('base64'),good,bad,boundary}),{flag:'wx'});
execFileSync(binary,[input,output],{stdio:['ignore','pipe','pipe']});
const native=JSON.parse(fs.readFileSync(output,'utf8'));assert.equal(native.length,plains.length);
for(let i=0;i<native.length;i++){assert.equal(shipping.decrypt(key,native[i]),plains[i]);assert.notEqual(native[i].iv,good[i].blob.iv);}
const result={status:'passed',shippingSource:revision,shippingToNativeCases:good.length,nativeToShippingCases:native.length,rejectedMalformedOrTamperedCases:bad.length,maximumPlaintextAtBlobLimit:boundary,referenceSha256:crypto.createHash('sha256').update(source).digest('hex'),nativeSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(dir,'protocol_cipher.cc'))).digest('hex'),scope:'cipher/envelope and move-only key container only; no password KDF, vault, account, network or product Sync enabled',nativeStrictness:'rejects unsupported versions, noncanonical base64 and authenticated malformed UTF8; valid released UTF8 envelopes interoperate'};
fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result));
