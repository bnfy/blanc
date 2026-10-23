'use strict';
// Deterministic fixtures generated with the shipping desktop implementation.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const dest = path.join(root, 'ios/Blanc/BlancTests/Sync/Fixtures/sync-vectors.json');
const crypt = require('../src/main/sync-crypto');
const pair = require('../src/main/sync-pairing');
const tabs = require('../src/main/tabsync-model');
const names = require('../src/main/device-names');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-ios-vectors-'));
const electronId = require.resolve('electron');
const original = require.cache[electronId];
let activeDir;
require.cache[electronId] = { id: electronId, filename: electronId, loaded: true, exports: { app: { getPath: () => activeDir, on: () => {} } } };
const loaded = [];
const fixedNow = 1800000000000;
const dateNow = Date.now;
Date.now = () => fixedNow;
function moduleInProfile(name, stored) {
  activeDir = fs.mkdtempSync(path.join(tmp, name));
  fs.writeFileSync(path.join(activeDir, `${name}.json`), JSON.stringify(stored));
  for (const mod of ['store', name]) delete require.cache[require.resolve(`../src/main/${mod}`)];
  const mod = require(`../src/main/${name}`); loaded.push(mod); return mod;
}
const entry = (name, input, expected) => ({ name, input, expected });
function seal(key, plaintext, iv) {
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const blob = { v: 1, iv: iv.toString('base64'), ct: Buffer.concat([c.update(plaintext), c.final()]).toString('base64'), tag: c.getAuthTag().toString('base64') };
  assert.equal(crypt.decrypt(key, blob), plaintext); return blob;
}
try {
  const vectors = { deriveKeys: [], pairing: [], envelopes: [], recovery: [], settingsMerge: [], deviceNamesMerge: [], sessionMerge: [], favoritesMerge: [], canonical: [] };
  for (const [handle, passphrase] of [['Anthony','correct horse battery staple'],['  Zoë ','Pässwörd-1234'],['İstanbul','🦊🦊🦊🦊🦊 long enough'],['ab','x']]) {
    const k = crypt.deriveKeys(handle,passphrase); vectors.deriveKeys.push(entry(handle,{handle,passphrase},{accountId:k.accountId,contentKey:k.key.toString('hex')}));
  }
  const payload = { v:1, handle:'Anthony', accountId:vectors.deriveKeys[0].expected.accountId, key:Buffer.from(vectors.deriveKeys[0].expected.contentKey,'hex').toString('base64') };
  for (const code of ['k7mr-4px2','K7MR 4PX2','ABCDEFGH']) {
    const normalized = pair.normalizeCode(code), m = pair.pairingMaterial(normalized);
    const iv = Buffer.from('000102030405060708090a0b','hex'), blob = seal(m.wrapKey,JSON.stringify(payload),iv);
    assert.deepEqual(pair.unwrapSecret(m.wrapKey,blob),payload);
    vectors.pairing.push(entry(code,{code,payload,iv:iv.toString('hex')},{normalized,pairId:m.pairId,wrapKey:m.wrapKey.toString('hex'),blob}));
  }
  const key=Buffer.from(vectors.deriveKeys[0].expected.contentKey,'hex'), iv=Buffer.from('101112131415161718191a1b','hex'), plaintext='{"hello":"🦊", "version":1}';
  vectors.envelopes.push(entry('fixed nonce',{key:key.toString('hex'),iv:iv.toString('hex'),plaintext},seal(key,plaintext,iv)));
  vectors.recovery.push(entry('desktop recovery',payload,pair.encodeRecoveryCode(payload)));
  const settingCases = [
    ['remote newer','theme','light','dark',100,200,'a','b'],['local newer','theme','light','dark',200,100,'a','b'],
    ['smaller tie wins','theme','light','dark',100,100,'b','a'],['UTF16 value','searchEngineTemplate','https://example.com/?q=%s&v=￿','https://example.com/?q=%s&v=😀',100,100,'a','a'],['invalid remote clock','theme','light','dark',100,0,'a','b'],['unknown key','futureKey','old','new',100,0,'a','b']
  ];
  for (const [name,k,l,r,lt,rt,lTie,rTie] of settingCases) {
    const mod=moduleInProfile('settings',{onboardingVersion:1,presentationDefaultsResetVersion:999,[k]:l,_syncMeta:{[k]:lt},_syncTieBreakers:{[k]:lTie}});
    const local=mod.exportForSync(), remote={values:{[k]:r},meta:{[k]:rt},tieBreakers:{[k]:rTie}};
    mod.mergeFromSync(remote); vectors.settingsMerge.push(entry(name,{local,remote},{payload:mod.exportForSync(),serialized:JSON.stringify(mod.exportForSync())}));
  }
  const nmLocal={phone:{name:'Phone',at:100,tie:'b'}}, nmRemote={phone:{name:'😀',at:100,tie:'a'},desktop:{name:'Desk',at:200,tie:''}};
  vectors.deviceNamesMerge.push(entry('entry clocks',{local:nmLocal,remote:nmRemote},names.mergeDeviceNames(nmLocal,nmRemote)));
  const dev=(name,updatedAt,tabsList=[])=>({name,platform:'ios',updatedAt,tabs:tabsList,groups:[]});
  for(const [name,local,remote] of [['own wins tie',{own:dev('local',fixedNow)},{own:dev('remote',fixedNow)}],['retraction wins tie',{other:dev('local',fixedNow)},{other:{retracted:true,updatedAt:fixedNow}}],['thirty day prune',{old:dev('old',fixedNow-tabs.PRUNE_MS-1)},{new:dev('new',fixedNow)}]]) {
    vectors.sessionMerge.push(entry(name,{local,remote,ownId:'own',now:fixedNow},tabs.mergeDevices(local,remote,{ownId:'own',now:fixedNow})));
  }
  const rawTabs=Array.from({length:600},(_,i)=>({url:`https://example.com/${i}`,title:`Tab ${i}`})); rawTabs.push({url:'ftp://example.com',title:'Invalid'});
  rawTabs[0].title='a'.repeat(199)+'😀';
  const snapshot={tabs:rawTabs.filter(t=>/^https?:\/\//.test(t.url)).slice(0,500).map(t=>({...t,title:t.title.slice(0,200),groupId:null,pinned:false})),groups:[]};
  const own=tabs.buildOwnEntry({prev:null,snapshot,name:'iPhone',platform:'ios',now:fixedNow});
  vectors.sessionMerge.push(entry('build own',{operation:'ownEntry',tabs:rawTabs,previous:null,now:fixedNow},own));
  const item=(title,updatedAt)=>({id:'fav-1',url:'https://example.com',title,favicon:null,folder:null,addedAt:100,updatedAt});
  for (const [name,local,remote] of [['remote newer',{items:[item('old',100)],tombstones:[]},{items:[item('new',200)],tombstones:[]}],['delete older',{items:[item('old',100)],tombstones:[]},{items:[],tombstones:[{url:'https://example.com',deletedAt:fixedNow}]}],['keep newer',{items:[item('new',fixedNow)],tombstones:[]},{items:[],tombstones:[{url:'https://example.com',deletedAt:fixedNow-1}]}]]) {
    const mod=moduleInProfile('bookmarks',local); mod.mergeFromSync(remote); vectors.favoritesMerge.push(entry(name,{local,remote,now:fixedNow},mod.exportForSync()));
  }
  for(const value of [{b:1,a:2},{text:'\ud83d'},{'￿':1,'😀':2},[1,1.5,1e21,-0,1e-7,1e-6],{text:'\b\f\n\t\r\u2028\u007f"\\'}, {'10':'ten','2':'two',a:1}]) vectors.canonical.push(entry('canonical',value,tabs.canonical(value)));
  const output=JSON.stringify(vectors,null,2)+'\n';
  if (process.argv.includes('--write')) { fs.mkdirSync(path.dirname(dest),{recursive:true}); fs.writeFileSync(dest,output); }
  else if (fs.readFileSync(dest,'utf8') !== output) { throw new Error('iOS sync vectors are stale; run npm run ios:sync-vectors:build'); }
} finally {
  for (const mod of loaded) { mod.flushSettings?.(); }
  Date.now=dateNow; if(original) require.cache[electronId]=original; else delete require.cache[electronId];
  fs.rmSync(tmp,{recursive:true,force:true});
}
