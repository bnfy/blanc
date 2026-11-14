import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {writeIfChanged} from './write-file.mjs';
function metadata(file){
 const descriptor=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
 try{return fs.fstatSync(descriptor);}finally{fs.closeSync(descriptor);}
}
test('unchanged preparation preserves inode and mtime; changes publish complete bytes',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'blanc-write-test-'));
 try{
  const file=path.join(root,'nested','file');assert(writeIfChanged(file,'one'));
  // Inspect opened files, not path metadata checked before a later path access.
  const before=metadata(file);assert.equal(writeIfChanged(file,Buffer.from('one')),false);
  const after=metadata(file);assert.equal(after.ino,before.ino);assert.equal(after.mtimeMs,before.mtimeMs);
  assert(writeIfChanged(file,'two'));assert.equal(fs.readFileSync(file,'utf8'),'two');
  assert.deepEqual(fs.readdirSync(path.dirname(file)),['file']);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('preparation refuses symlinks and non-files without changing their target',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'blanc-write-test-'));
 try{
  const target=path.join(root,'target'),link=path.join(root,'link');fs.writeFileSync(target,'safe');fs.symlinkSync(target,link);
  assert.throws(()=>writeIfChanged(link,'unsafe'));assert.equal(fs.readFileSync(target,'utf8'),'safe');
  assert.throws(()=>writeIfChanged(root,'unsafe'));
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
