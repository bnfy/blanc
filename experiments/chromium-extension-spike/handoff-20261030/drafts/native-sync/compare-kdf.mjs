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
const context={module:{exports:{}},Buffer,require:name=>{assert.equal(name,'crypto');return crypto}};vm.runInNewContext(source,context);
const [binary,evidence,icu]=process.argv.slice(2);assert(binary&&evidence&&icu);
assert.equal(process.versions.unicode,'17.0','Use the shipping-compatible Unicode17 reference runtime, not the shell default Node20');
const units=s=>Array.from({length:s.length},(_,i)=>s.charCodeAt(i));
const handles=['',' I ','\ufeff\u00a0İSTANBUL\u3000','ΟΣ ΟΣΑ Σ','é','e\u0301','\u0085NAME\u0085','\u180eNAME\u180e','\ud800I\udfff','Straße','𐐀USER','\u0000CASE'];
const normalizations=[...handles];
// Every BMP code unit, separated so contextual mappings do not mask a code
// point; supplementary, malformed-surrogate and contextual canaries above.
for(let start=0;start<65536;start+=128){let s='';for(let i=start;i<start+128;i++)s+=String.fromCharCode(i)+' ';normalizations.push(s)}
for(const c of [9,10,11,12,13,32,160,5760,...Array.from({length:11},(_,i)=>8192+i),8232,8233,8239,8287,12288,65279,133,6158])normalizations.push(String.fromCharCode(c)+'I'+String.fromCharCode(c));
const keys=handles.map((handle,i)=>{const password=i===8?'Test\ud800passphrase\udfff':`Synthetic-ONLY passphrase ${i} 🛡️`;const result=context.module.exports.deriveKeys(handle,password);return{handle:units(handle),password:units(password),account:result.accountId,key:result.key.toString('base64')}});
const input=path.join(evidence,'vectors.json'),output=path.join(evidence,'native.json');
const vectors={normalizations:normalizations.map(units),keys};
if(process.argv.includes('--verify-existing')){
 assert.deepEqual(JSON.parse(fs.readFileSync(input,'utf8')),vectors);
}else{
 fs.writeFileSync(input,JSON.stringify(vectors),{flag:'wx'});
 execFileSync(binary,[input,output,icu],{stdio:['ignore','pipe','pipe']});
}
const native=JSON.parse(fs.readFileSync(output,'utf8'));
assert.deepEqual(native.salts,normalizations.map(s=>Buffer.from('blanc-sync:v1:'+s.trim().toLowerCase()).toString('base64')));assert.equal(native.derived,keys.length);
const result={status:'passed',shippingSource:revision,syntheticKdfCases:keys.length,normalizationBatches:normalizations.length,BMPCodeUnitsCovered:65536,defaultNativeLocale:'tr_TR',referenceRuntime:{node:process.versions.node,icu:process.versions.icu,unicode:process.versions.unicode},referenceSha256:crypto.createHash('sha256').update(source).digest('hex'),nativeSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(dir,'password_kdf.cc'))).digest('hex'),scope:'standalone with recorded draft production-passkey overlay; source comparator on Unicode17 Node24, not packaged Electron execution; no checkout/app patch, real credential, vault, network or product Sync enabled; API review remains required'};
fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result));
