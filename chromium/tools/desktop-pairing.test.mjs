// The upstream-patched WebUI uses shipping's pure pairing/QR algorithms.
// Exercise the actual added module bodies, including expiry and stale replies.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const shipping=require('../../src/renderer/pages/settings-sync-pairing-model.js');
const shippingQr=require('../../src/renderer/pages/qr-code.js');
const patch=fs.readFileSync(new URL('../patches/0043-blanc-sync-pairing.patch',import.meta.url),'utf8');
function module(name){
 const section=patch.split('diff --git ').find(s=>s.startsWith(`a/chrome/browser/resources/settings/blanc_sync_page/${name}.ts `));
 assert.ok(section,`${name} resource exists`);
 const source=section.split('\n').filter(l=>l.startsWith('+')&&!l.startsWith('+++')).map(l=>l.slice(1)).join('\n');
 const context=vm.createContext({TextEncoder});
 vm.runInContext(source.replace(`export const ${name}`,`globalThis.api`),context);
 return context.api;
}
const plain=value=>JSON.parse(JSON.stringify(value));
test('desktop pairing preserves shipping expiry, cancellation and late-reply states',()=>{
 const fork=module('pairing_model');
 const routes=[
  [{type:'begin'},{type:'began',ok:true,code:'ABCDEFGH',expiresAt:600000},{type:'tick',now:600000}],
  [{type:'begin'},{type:'began',ok:true,code:'ABCDEFGH',expiresAt:600000},{type:'cancel'}],
  [{type:'open',syncOn:false},{type:'continue'},{type:'cancel'},{type:'started',ok:true,synced:true}],
  [{type:'open',syncOn:true},{type:'cancel'},{type:'began',ok:true,code:'ABCDEFGH',expiresAt:600000}],
  [{type:'open',syncOn:false},{type:'continue'},{type:'started',ok:true,synced:false},{type:'retry'},{type:'started',ok:true,synced:true}],
  [{type:'begin'},{type:'began',ok:false,message:'offline'}],
  [{type:'begin'},{type:'began',ok:true,code:'ABCDEFGH',expiresAt:600000},{type:'joined',name:'Fixture phone',platform:'ios'},{type:'done'}],
 ];
 for(const events of routes){
  let actual=fork.createPairingModel(),expected=shipping.createPairingModel();
  for(const event of events){
   const a=fork.pairingTransition(actual,event),e=shipping.pairingTransition(expected,event);
   assert.deepEqual(plain(a),plain(e));actual=a.state;expected=e.state;
   assert.deepEqual(plain(fork.pairingView(actual,450000)),plain(shipping.pairingView(expected,450000)));
  }
 }
});
test('desktop QR resource matches shipping pair-link encoding',()=>{
 const qr=module('qr_code');
 for(const code of ['ABCDEFGH','K7MR4PX2']){
  const link='https://blanc.day/pair#'+code,a=qr.encode(link),b=shippingQr.encode(link);
  assert.equal(qr.svgPath(a),shippingQr.svgPath(b));
  assert.equal(qr.viewBoxSize(a),shippingQr.viewBoxSize(b));
 }
});
