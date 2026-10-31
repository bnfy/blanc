import test from 'node:test';
import assert from 'node:assert/strict';
import {forkInternalUrl,NEWTAB,UTILITY} from './adapters/pages.mjs';
import {shippingPageUrl} from './lib/page-shim.mjs';
test('shipping internal URLs name the fork pages they reach',()=>{
 assert.equal(forkInternalUrl('blanc://settings/'),'chrome://blanc-prototype/blocking-settings.html');
 assert.equal(forkInternalUrl('blanc://newtab/'),'chrome://newtab/');
 assert.equal(forkInternalUrl('blanc://downloads/'),'chrome://downloads/');
 assert.equal(forkInternalUrl('https://example.com/'),'https://example.com/');
 assert.equal(shippingPageUrl(forkInternalUrl('blanc://settings/')),'blanc://settings/');
});
test('the fork Start Page commits under its own document URL',()=>{
 for(const url of ['chrome://newtab/','chrome://blanc-prototype/pages/newtab.html'])assert.match(url,NEWTAB);
 assert.equal(shippingPageUrl('chrome://blanc-prototype/pages/newtab.html?private=1'),'blanc://newtab/?private=1');
 assert.doesNotMatch('https://newtab.example/',NEWTAB);
});
test('utility pages are the fork manager tabs, never web pages',()=>{
 for(const url of ['chrome://bookmarks/','chrome://history/','chrome://downloads/','chrome://blanc-prototype/blocking-settings.html'])assert.match(url,UTILITY);
 assert.doesNotMatch('chrome://newtab/',UTILITY);
 assert.doesNotMatch('http://127.0.0.1/site/bookmarks',UTILITY);
});
