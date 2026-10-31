import {test} from 'node:test';import {strict as assert} from 'node:assert';import fs from 'node:fs';import {fileURLToPath} from 'node:url';import {transformRenderer} from './renderer-transform.mjs';
const preview=fileURLToPath(new URL('../../../../../../',import.meta.url)).replace(/\/$/,'');
const base=fs.readFileSync(preview+'/evidence/search-host-routing-20261029/preserved-assets-v1/pages/newtab.js','utf8');
const expected=fs.readFileSync(new URL('../assets-visible-v2/pages/newtab.js',import.meta.url),'utf8');
const patch=fs.readFileSync(new URL('./renderer.patch',import.meta.url),'utf8');
test('in-memory transform reproduces the exact tested renderer',()=>assert.equal(transformRenderer(base,patch),expected));
test('rejects stale 1.38 source, edited source, changed patch and double application',()=>{
 const old=fs.readFileSync(new URL('../../../renderer-1.38/pages/newtab.js',import.meta.url),'utf8');
 for(const [s,p] of [[old,patch],[base+' ',patch],[base,patch+' '],[expected,patch]])assert.throws(()=>transformRenderer(s,p),/identity mismatch/);
});
