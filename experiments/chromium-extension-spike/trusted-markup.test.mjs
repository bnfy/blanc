import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import fs from 'node:fs';import {hardenMarkup} from './trusted-markup.mjs';
for(const name of ['renderer','overlay','vertical-tabs'])test(name+' permits only packaged static markup',()=>{
 const source=fs.readFileSync(new URL('../../src/renderer/'+name+'.js',import.meta.url),'utf8');
 const output=hardenMarkup(source,name);let callback;const stop=Error('captured');
 assert.throws(()=>vm.runInNewContext(output,{trustedTypes:{createPolicy(n,rules){assert.equal(n,'blanc-static-'+name);callback=rules.createHTML;throw stop;}}}),e=>e===stop);
 assert.ok(callback);const allowed=JSON.parse(output.match(/new Set\((.*)\);/)[1]);assert.ok(allowed.length);if(name==='renderer')assert.ok(allowed.some(s=>s.includes('M8 2.5v6.5')));for(const markup of allowed)assert.equal(callback(markup),markup);for(const s of ['<img src=x onerror=alert(1)>','<svg onload=alert(1)></svg>','page title','<span>untrusted</span>'])assert.throws(()=>callback(s));
 assert.ok(output.includes('__blancMarkup.createHTML('));
});
test('dynamic row markup is refused',()=>assert.throws(()=>hardenMarkup('const CARET="evil"; row.innerHTML = `${CARET}<span class="ghead-name"></span>`;','test')));
