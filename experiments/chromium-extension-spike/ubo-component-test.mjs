import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {componentId,componentKey,generateComponent,prepareComponent} from './ubo-component.mjs';
test('component ID is derived from the public key',()=>{
 const hex=crypto.createHash('sha256').update(Buffer.from(componentKey,'base64')).digest('hex').slice(0,32);
 assert.equal([...hex].map(c=>String.fromCharCode(97+parseInt(c,16))).join(''),componentId);
});
test('verified payload is private-disabled and refuses overwriting',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ubo-payload-test-')),out=path.join(dir,'payload');
 try{const result=generateComponent(out);assert.equal(result.version,'1.75.0');assert.equal(result.verifiedFiles,658);
 const manifest=JSON.parse(fs.readFileSync(path.join(out,'manifest.json')));assert.equal(manifest.key,componentKey);assert.equal(manifest.incognito,'not_allowed');assert.equal(manifest.manifest_version,2);assert.throws(()=>generateComponent(out));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('admission uses normal Add and only browser component integration',()=>{
 const edits=[];prepareComponent((file,patches)=>edits.push({file,patches}));assert.equal(edits.length,2);
 assert(edits.every(e=>e.file.startsWith('chrome/browser/extensions/')));
 const code=edits.flatMap(e=>e.patches.map(p=>p.replacement)).join('\n');assert(code.includes('Add(manifest, root)'));assert(!code.includes('AddOrReplace'));assert(code.includes('!profile_->IsOffTheRecord()'));assert(code.includes('blanc-ubo-offline-probe'));
});
