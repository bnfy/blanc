import test from 'node:test';
import assert from 'node:assert/strict';
import {forkInternalUrl,NEWTAB,UTILITY} from './adapters/pages.mjs';
import {shippingPageUrl} from './lib/page-shim.mjs';
test('shipping internal URLs name the fork pages they reach',()=>{
 assert.equal(forkInternalUrl('blanc://settings/'),'chrome://settings/');
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
test('utility pages shown as tabs are fork pages, never web pages',()=>{
 for(const url of ['chrome://bookmarks/','chrome://history/','chrome://downloads/','chrome://settings/'])assert.match(url,UTILITY);
 assert.doesNotMatch('chrome://newtab/',UTILITY);
 assert.doesNotMatch('http://127.0.0.1/site/bookmarks',UTILITY);
});

test('standalone Mahjong URLs preserve private and deal parameters in the shipping projection',()=>{
 const native='chrome://blanc-prototype/pages/mahjong.html';
 assert.equal(shippingPageUrl(native),'blanc://mahjong/');
 assert.equal(shippingPageUrl(native+'?private=1'),'blanc://mahjong/?private=1');
 assert.equal(shippingPageUrl(native+'?private=1#deal=example'),'blanc://mahjong/?private=1#deal=example');
 assert.equal(shippingPageUrl('https://example.com/mahjong.html'),'https://example.com/mahjong.html');
 assert.doesNotMatch(native,UTILITY);
});
