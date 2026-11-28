import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {islandFiles} from './assets.mjs';
const spec=JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)),'../blanc/island-assets.json')));
test('canonical island assets reproduce the recorded manifest exactly',()=>{
 const {files,problems}=islandFiles(spec);
 assert.deepEqual(problems,[]);assert.equal(files.size,Object.keys(spec.manifest).length);
});
test('a changed fork or shipping file is reported, never served silently',()=>{
 const p=Object.keys(spec.manifest)[0];
 assert.match(islandFiles({...spec,manifest:{...spec.manifest,[p]:'0'.repeat(64)}}).problems.join(),new RegExp('changed '+p));
 assert.match(islandFiles({...spec,manifest:{...spec.manifest,'extra.js':'0'.repeat(64)}}).problems.join(),/missing extra\.js/);
});

test('--out assembles the served folder from the checked files',()=>{
 const parent=fs.mkdtempSync(path.join(os.tmpdir(),'blanc-assets-out-')),out=path.join(parent,'assets');
 try{
  execFileSync(process.execPath,[fileURLToPath(new URL('./assets.mjs',import.meta.url)),'--out='+out],{encoding:'utf8'});
  const {files}=islandFiles();
  assert.equal(fs.readFileSync(path.join(out,'host.js')).equals(files.get('host.js')),true);
  assert.equal(fs.readdirSync(out,{recursive:true}).filter(p=>fs.statSync(path.join(out,p)).isFile()).length,files.size);
 }finally{fs.rmSync(parent,{recursive:true,force:true});}
});
