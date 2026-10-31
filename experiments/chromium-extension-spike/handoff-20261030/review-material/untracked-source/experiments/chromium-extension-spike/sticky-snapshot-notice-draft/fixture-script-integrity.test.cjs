'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'browser-check-snapshot-notice.mjs'),'utf8');
const start=source.indexOf('function readPinnedScript('),end=source.indexOf('function syncEvidenceDir()',start);assert(start>=0&&end>start);
const read=vm.runInNewContext(`(${source.slice(start,end).trim()})`,{fs,crypto,Error});
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
test('exact approved bytes load; drift, missing file and symlink fail closed',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'snapshot-script-pins-'));
 try{const file=path.join(dir,'probe.mjs'),link=path.join(dir,'link.mjs');fs.writeFileSync(file,'export const x=1;');const expected=sha(fs.readFileSync(file));assert.equal(read(file,expected).toString(),'export const x=1;');fs.writeFileSync(file,'export const x=2;');assert.throws(()=>read(file,expected),/identity changed/);fs.symlinkSync(file,link);assert.throws(()=>read(link,expected),/unsafe/);fs.unlinkSync(file);assert.throws(()=>read(file,expected));}finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('fixture loads pinned helpers and rechecks all pins before result',()=>{
 assert.match(source,/await import\('data:text\/javascript;base64,'\+verified\.probe\.toString\('base64'\)\)/);
 assert.match(source,/await import\('data:text\/javascript;base64,'\+verified\.predicate\.toString\('base64'\)\)/);
 assert.match(source,/for\(const \[key,file\] of Object\.entries\(scriptPaths\)\)readPinnedScript\(file,scriptPins\[key\]\)/);
 assert.match(source,/proof\.scriptsUnchanged=false/);
});
