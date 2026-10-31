import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
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
