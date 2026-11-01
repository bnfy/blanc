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
const sends = require('../src/main/sends-model');
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
  const vectors = { deriveKeys: [], pairing: [], envelopes: [], recovery: [], settingsMerge: [], deviceNamesMerge: [], sessionMerge: [], favoritesMerge: [], favoritesEdit: [], canonical: [], lowercase: [], deviceNamesRename: [], sendsMerge: [], sendsInbox: [], sendsTargets: [], sendsOwn: [] };
  for (const [handle, passphrase] of [['Anthony','correct horse battery staple'],['  Zoë ','Pässwörd-1234'],['İstanbul','🦊🦊🦊🦊🦊 long enough'],['ΟΔΟΣ','correct horse battery staple'],['ab','x']]) {
    const k = crypt.deriveKeys(handle,passphrase); vectors.deriveKeys.push(entry(handle,{handle,passphrase},{accountId:k.accountId,contentKey:k.key.toString('hex')}));
  }
  // JavaScript's toLowerCase applies Unicode's Final_Sigma rule; the handle salt depends on it.
  for (const text of ['ΟΔΟΣ','Σ','ΣΟΦΟΣ','ΑΣ.Β','ΑΣ.','ΑΣ\u0301','ΟΔΟΣ ΜΟΥ','.Σ','ΑΣ\u0301Β','İstanbul','ΑΣ1','ΑΣ\u00adΒ']) {
    vectors.lowercase.push(entry(text,{text},text.toLowerCase()));
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
  // A rename made on the phone: desktop must merge it and export a payload the
  // phone sees as equal, or the two rewrite settings on every pass.
  {
    const phone={values:{deviceNames:{'abc-phone':{name:'My phone',at:fixedNow,tie:'t1'}}},meta:{deviceNames:fixedNow},tieBreakers:{}};
    const mod=moduleInProfile('settings',{onboardingVersion:1,presentationDefaultsResetVersion:999});
    mod.mergeFromSync(phone); const exported=mod.exportForSync();
    assert.ok(mod.syncPayloadEquals(exported,phone),'desktop must treat the phone rename as already in sync');
    vectors.deviceNamesRename.push(entry('rename on phone',{deviceId:'abc-phone',name:'My phone',now:fixedNow,tie:'t1'},exported));
  }
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
  const fav=(id,folder=null,addedAt=100)=>({id,url:`https://${id}.test/`,title:id.toUpperCase(),favicon:null,addedAt,updatedAt:addedAt,folder});
  for (const [name,store,operation,args,id] of [
    ['toggle on',{items:[],tombstones:[]},'toggle',{url:'https://new.test/',title:'',favicon:'https://new.test/icon.png'},'new-1'],
    ['toggle off',{items:[fav('a'),fav('b')],tombstones:[]},'toggle',{url:'https://a.test/',title:'A',favicon:null},'unused'],
    ['toggle on after delete',{items:[],tombstones:[{url:'https://a.test/',deletedAt:100},{url:'https://b.test/',deletedAt:100}]},'toggle',{url:'https://a.test/',title:'A',favicon:null},'new-2'],
    ['remove by id',{items:[fav('a'),fav('b')],tombstones:[]},'remove',{id:'b'},''],
    ['remove unknown id',{items:[fav('a')],tombstones:[]},'remove',{id:'zzz'},''],
    ['set folder trims',{items:[fav('a')],tombstones:[]},'setFolder',{id:'a',folder:'  Work  '},''],
    ['set folder too long is a no-op',{items:[fav('a','Home')],tombstones:[]},'setFolder',{id:'a',folder:'x'.repeat(101)},''],
    ['set folder joins existing spelling',{items:[fav('a','Work',50),fav('b')],tombstones:[]},'setFolder',{id:'b',folder:'work'},''],
    ['set folder null ungroups',{items:[fav('a','Work')],tombstones:[]},'setFolder',{id:'a',folder:null},''],
    ['set folder same is unchanged',{items:[fav('a','Work')],tombstones:[]},'setFolder',{id:'a',folder:'Work'},''],
    ['set folder unknown id',{items:[fav('a')],tombstones:[]},'setFolder',{id:'zzz',folder:'Work'},''],
    ['rename folder',{items:[fav('a','Work'),fav('b','work'),fav('c','Home')],tombstones:[]},'renameFolder',{from:'WORK',to:' Projects '},''],
    ['rename folder merges into existing',{items:[fav('a','Work'),fav('b','Home',50)],tombstones:[]},'renameFolder',{from:'Work',to:'home'},''],
    ['rename folder case only',{items:[fav('a','work')],tombstones:[]},'renameFolder',{from:'work',to:'Work'},''],
    ['rename folder to empty is a no-op',{items:[fav('a','Work')],tombstones:[]},'renameFolder',{from:'Work',to:'   '},''],
    ['remove folder',{items:[fav('a','Work'),fav('b','WORK'),fav('c','Home')],tombstones:[]},'removeFolder',{name:'work'},''],
  ]) {
    const mod=moduleInProfile('bookmarks',store), uuid=crypto.randomUUID; crypto.randomUUID=()=>id;
    try {
      if(operation==='toggle') mod.toggleBookmark(args.url,args.title,args.favicon);
      else if(operation==='remove') mod.removeBookmark(args.id);
      else if(operation==='setFolder') mod.setBookmarkFolder(args.id,args.folder);
      else if(operation==='renameFolder') mod.renameFolder(args.from,args.to);
      else mod.removeFolder(args.name);
    } finally { crypto.randomUUID=uuid; }
    vectors.favoritesEdit.push(entry(name,{store,operation,args,now:fixedNow,id},JSON.parse(JSON.stringify(mod.exportForSync()))));
  }
  for(const value of [{b:1,a:2},{text:'\ud83d'},{'￿':1,'😀':2},[1,1.5,1e21,-0,1e-7,1e-6],{text:'\b\f\n\t\r\u2028\u007f"\\'}, {'10':'ten','2':'two',a:1}]) vectors.canonical.push(entry('canonical',value,tabs.canonical(value)));
  const DAY=24*60*60*1000, sItem=(id,over={})=>({id,to:'phone',url:`https://example.com/${id}`,title:id,sentAt:fixedNow-1000,...over});
  const sEntry=(name,updatedAt,items=[],platform='darwin')=>({name,platform,updatedAt,items});
  const many=Array.from({length:21},(_,i)=>sItem(`i${String(i).padStart(2,'0')}`,{sentAt:fixedNow-(21-i)*1000}));
  for(const [name,local,remote] of [
    ['own wins tie',{own:sEntry('local',fixedNow)},{own:sEntry('remote',fixedNow)}],
    ['smaller canonical wins tie',{mac:sEntry('😀',fixedNow)},{mac:sEntry('￿',fixedNow)}],
    ['remote newer',{mac:sEntry('old',fixedNow-2000)},{mac:sEntry('new',fixedNow-1000)}],
    ['retraction wins',{mac:sEntry('Mac',fixedNow-2000,[sItem('a')])},{mac:sends.retractedEntry(fixedNow-1000)}],
    ['same-clock retraction wins',{mac:sEntry('Mac',fixedNow)},{mac:sends.retractedEntry(fixedNow)}],
    ['thirty day prune, own kept',{own:sEntry('own',fixedNow-sends.ENTRY_TTL_MS)},{old:sEntry('old',fixedNow-sends.ENTRY_TTL_MS),edge:sEntry('edge',fixedNow-sends.ENTRY_TTL_MS+1)}],
    ['21 items keep newest 20',{},{mac:sEntry('Mac',fixedNow,many)}],
    ['seven day expiry',{},{mac:sEntry('Mac',fixedNow,[sItem('gone',{sentAt:fixedNow-sends.ITEM_TTL_MS}),sItem('kept',{sentAt:fixedNow-sends.ITEM_TTL_MS+1})])}],
    ['invalid items dropped',{},{mac:sEntry('Mac',fixedNow,[sItem('ftp',{url:'ftp://x.test/'}),sItem('long',{title:'a'.repeat(199)+'😀'}),sItem('long',{sentAt:fixedNow-5000}),{id:'',to:'phone',url:'https://x.test/',sentAt:fixedNow}])}],
  ]) {
    const merged=sends.mergeDevices(local,remote,'own',fixedNow);
    vectors.sendsMerge.push(entry(name,{local,remote,ownId:'own',now:fixedNow},{merged,budgeted:sends.applyBudget(merged,'own')}));
  }
  const budgetDevices={own:sEntry('own',fixedNow-5000,many.slice(0,20).map(i=>({...i,title:'x'.repeat(200)})))};
  for(const id of ['a','b','c']) budgetDevices[id]=sEntry(id,fixedNow-({a:4000,b:3000,c:2000})[id],many.slice(0,20).map(i=>({...i,id:`${id}${i.id}`,title:'x'.repeat(200)})));
  vectors.sendsMerge.push(entry('budget drops stalest others',{local:budgetDevices,remote:{},ownId:'own',now:fixedNow,maxBytes:20000},{merged:sends.mergeDevices(budgetDevices,{},'own',fixedNow),budgeted:sends.applyBudget(sends.mergeDevices(budgetDevices,{},'own',fixedNow),'own',{maxBytes:20000})}));
  const inboxDevices={mac:sEntry('Mac',fixedNow,[sItem('a',{sentAt:fixedNow-3000}),sItem('b',{to:'pc'}),sItem('c',{sentAt:fixedNow-2000}),sItem('d',{sentAt:fixedNow-2000})]),phone:sEntry('iPhone',fixedNow,[sItem('self')],'ios'),pc:sEntry('PC',fixedNow,[sItem('old',{sentAt:fixedNow-sends.ITEM_TTL_MS})],'win32')};
  vectors.sendsInbox.push(entry('inbox',{devices:inboxDevices,ownId:'phone',dismissed:{c:fixedNow},now:fixedNow},sends.inbox(inboxDevices,'phone',{c:fixedNow},fixedNow)));
  vectors.sendsInbox.push(entry('prune dismissed',{operation:'pruneDismissed',dismissed:{a:fixedNow-sends.DISMISS_TTL_MS,b:fixedNow-sends.DISMISS_TTL_MS+1},now:fixedNow},sends.pruneDismissed({a:fixedNow-sends.DISMISS_TTL_MS,b:fixedNow-sends.DISMISS_TTL_MS+1},fixedNow)));
  const tSends={phone:sEntry('iPhone',fixedNow,[],'ios'),pc:sEntry('PC (sends)',fixedNow-500,[],'win32')};
  const tSession={pc:{name:'PC',platform:'win32',updatedAt:fixedNow-1000,tabs:[],groups:[]},gone:{retracted:true,updatedAt:fixedNow},me:{name:'Me',platform:'darwin',updatedAt:fixedNow,tabs:[],groups:[]}};
  const tNames={phone:{name:'Pocket',at:1}};
  vectors.sendsTargets.push(entry('targets',{sends:tSends,session:tSession,ownId:'me',deviceNames:tNames},sends.targets(tSends,tSession,'me',tNames)));
  for(const [name,previous,args,options] of [
    ['first entry',null,{name:'iPhone',platform:'ios'},{}],
    ['heartbeat not due',sEntry('iPhone',fixedNow-DAY+1,[],'ios'),{name:'iPhone',platform:'ios'},{}],
    ['heartbeat due',sEntry('iPhone',fixedNow-DAY,[],'ios'),{name:'iPhone',platform:'ios'},{}],
    ['renamed',sEntry('iPhone',fixedNow-1000,[],'ios'),{name:'Phone',platform:'ios'},{}],
    ['forced',sEntry('iPhone',fixedNow-1000,[],'ios'),{name:'iPhone',platform:'ios'},{force:true}],
    ['back after a retraction',sends.retractedEntry(fixedNow-1000),{name:'iPhone',platform:'ios'},{}],
    ['expired item dropped',sEntry('iPhone',fixedNow-1000,[sItem('old',{sentAt:fixedNow-8*DAY})],'ios'),{name:'iPhone',platform:'ios'},{}],
  ]) vectors.sendsOwn.push(entry(name,{previous,...args,now:fixedNow,force:!!options.force},sends.ownEntry(previous,args,fixedNow,options)));
  vectors.sendsOwn.push(entry('add item',{operation:'addItem',previous:sEntry('iPhone',fixedNow-1000,[sItem('a')],'ios'),url:'https://x.test/',title:'X',to:'mac',ownId:'phone',now:fixedNow,id:'new'},sends.addItem(sEntry('iPhone',fixedNow-1000,[sItem('a')],'ios'),{url:'https://x.test/',title:'X',to:'mac'},'phone',fixedNow,()=>'new')));
  vectors.sendsOwn.push(entry('add to self',{operation:'addItem',previous:null,url:'https://x.test/',title:'X',to:'phone',ownId:'phone',now:fixedNow,id:'new'},sends.addItem(null,{url:'https://x.test/',title:'X',to:'phone'},'phone',fixedNow,()=>'new')));
  const spaces = require('../src/main/shared-spaces-model');
  const sid = n => n.toString(16).padStart(32, '0');
  vectors.spacesPositions = [];
  for (const [a,b] of [['a1','a11'],['a1','a2'],['a1z','a2'],['','1'],['','a1'],['ab',''],['a','a0i'],['i','i1'],['zz','']]) {
    vectors.spacesPositions.push(entry('mid',{a,b},spaces.mid(a,b)));
  }
  let positionSeed=91234;
  const prng=()=>((positionSeed=(Math.imul(positionSeed,1664525)+1013904223)>>>0)/4294967296);
  const position=()=>Array.from({length:1+Math.floor(prng()*8)},()=> '0123456789abcdefghijklmnopqrstuvwxyz'[Math.floor(prng()*36)]).join('')+'1';
  for(let i=0;i<1000;i++) {let a=position(),b=position(); if(a>b)[a,b]=[b,a]; if(a===b){i--;continue;} vectors.spacesPositions.push(entry('interval',{a,b},spaces.mid(a,b)));}
  const ka=spaces.keyFor('','',sid(1)),kb=spaces.keyFor('','',sid(2));
  vectors.spacesPositions.push(entry('concurrent inserts',{a:'',b:'',ids:[sid(1),sid(2),sid(3)]},{keys:[ka,kb],between:spaces.keyFor(ka,kb,sid(3))}));
  vectors.spacesPositions.push(entry('wrong tag',{key:ka,id:sid(2)},spaces.validKey(ka,sid(2))));
  vectors.spacesFields=[];
  for(const [name,a,b] of [['name',spaces.field('older',1,'a'),spaces.field('newer',2,'b')],['name',spaces.field('z',1,'a'),spaces.field('a',1,'a')],['deleted',spaces.field(false,999,'a'),spaces.field(true,1,'b')]]) {
    vectors.spacesFields.push(entry(name,{name,a,b},{merged:spaces.mergeField(a,b,name),acknowledged:spaces.acknowledged(a,b,name)}));
  }
  vectors.spacesRevision=[entry('canonical keys',{b:2,a:1},spaces.revisionOf({b:2,a:1}))];
  vectors.spacesBudget=[320,400].map(kib=>entry('encrypted size',{kib},{bytes:Buffer.byteLength(JSON.stringify(crypt.encrypt(Buffer.alloc(32),'x'.repeat(kib*1024)))),fits:spaces.blobFits('x'.repeat(kib*1024),t=>crypt.encrypt(Buffer.alloc(32),t))}));
  const pipeId=sid(17), pipeSpace=sid(99), pipeField=(v)=>spaces.field(v,100,'a');
  const pipeTab={nav:pipeField({url:'https://example.test/',title:'Example'}),name:pipeField(null),pinned:pipeField(false),groupId:pipeField(null),pos:pipeField(spaces.keyFor('','',pipeId)),deleted:pipeField(false)};
  const pipeInput={fetchedBlob:{v:1,spaceId:pipeSpace,groups:{},tabs:{}},fetchedVersion:'version-1',localBlob:{v:1,spaceId:pipeSpace,groups:{},tabs:{[pipeId]:pipeTab}},pending:{tabs:{[pipeId]:pipeTab}},lastMergeAt:1000,now:2000,deviceId:'a'};
  vectors.spacesPipeline=[false,true].map(stale=>{
    const input={...pipeInput,lastMergeAt:stale?1:1000,now:stale?spaces.LIMITS.tombstoneMs+2:2000};
    const result=spaces.pushPlan({...input,encryptFn:t=>crypt.encrypt(Buffer.alloc(32),t)});
    return entry(stale?'recovery excluded':'new record upload',input,{...result,recover:[...result.recover],unsynced:[...result.unsynced]});
  });
  const expiredTab={...pipeTab,deleted:pipeField(true)};
  const expiredInput={...pipeInput,fetchedBlob:pipeInput.localBlob,localBlob:{...pipeInput.localBlob,tabs:{[pipeId]:expiredTab}},pending:{tabs:{[pipeId]:{deleted:expiredTab.deleted}}},lastMergeAt:spaces.LIMITS.tombstoneMs+199,now:spaces.LIMITS.tombstoneMs+200};
  const expiredResult=spaces.pushPlan({...expiredInput,encryptFn:t=>crypt.encrypt(Buffer.alloc(32),t)});
  vectors.spacesPipeline.push(entry('expired deletion clears retained state and pending',expiredInput,{...expiredResult,recover:[...expiredResult.recover],unsynced:[...expiredResult.unsynced]}));
  const selectedDeleted={...expiredInput.localBlob,active:pipeField(pipeId)};
  vectors.spacesSelections=[entry('deleted selection retains a cleared causal record',selectedDeleted,spaces.sanitizeBlob(selectedDeleted))];
  const normalizedExpired={...expiredResult,recover:[...expiredResult.recover],unsynced:[...expiredResult.unsynced]};
  vectors.spacesSettlements=[entry('failed upload cannot restore expired pending records',
    {plan:normalizedExpired,originalPending:expiredInput.pending,outcome:{blobStored:false}},
    spaces.settleUpload(expiredResult,expiredInput.pending,{blobStored:false}))];
  const selectionInput={...pipeInput,fetchedBlob:pipeInput.localBlob,localBlob:{...pipeInput.localBlob,active:{v:pipeId,c:2000,by:'a'}},pending:{active:{v:pipeId,c:2000,by:'a'}}};
  const selectionResult=spaces.pushPlan({...selectionInput,encryptFn:t=>crypt.encrypt(Buffer.alloc(32),t)});
  vectors.spacesPipeline.push(entry('selection-only pending write is replayed',selectionInput,{...selectionResult,recover:[...selectionResult.recover],unsynced:[...selectionResult.unsynced]}));
  const selectionTab=n=>({...pipeTab,pos:pipeField(spaces.keyFor('','',sid(n)))});
  const selectionState=(target,clock,deleted)=>({v:1,spaceId:pipeSpace,groups:{},
    tabs:Object.fromEntries([1,2,3].map(n=>[sid(n),{...selectionTab(n),...(n===deleted?{deleted:spaces.field(true,400,'b')}:{})}])),
    active:spaces.field(sid(target),clock,'a')});
  vectors.spacesSelectionMerge=[
    ['deleted winning selection',selectionState(1,300),selectionState(2,200,1),selectionState(3,100)],
    ['equal-clock target rank survives clearing',selectionState(2,300),selectionState(2,300,2),selectionState(1,300)],
  ].map(([name,a,b,c])=>{
    const expected=spaces.mergeBlob(spaces.mergeBlob(a,b),c);
    for(const [x,y,z] of [[a,b,c],[a,c,b],[b,a,c],[b,c,a],[c,a,b],[c,b,a]]) {
      assert.deepEqual(spaces.mergeBlob(spaces.mergeBlob(x,y),z),expected);
      assert.deepEqual(spaces.mergeBlob(x,spaces.mergeBlob(y,z)),expected);
    }
    return entry(name,{a,b,c},expected);
  });
  // The index revision hint merges by its own clock and writer (revAt, revBy).
  const revEntry=(rev,revAt,revBy)=>({name:pipeField('Work'),color:pipeField('#426c4c'),symbol:pipeField('briefcase'),
    pos:pipeField(spaces.keyFor('','',pipeSpace)),deleted:pipeField(false),rev,...(revAt===undefined?{}:{revAt}),...(revBy===undefined?{}:{revBy})});
  const revIndex=e=>({v:1,spaces:{[pipeSpace]:e}});
  vectors.spacesIndexRevision=[
    ['newer hint wins though its hash sorts later',revEntry('0000ffffffffffff',10,'a'),revEntry('ffffffffffff0000',20,'b')],
    ['newer hint wins though its hash sorts earlier',revEntry('ffff000000000000',10,'a'),revEntry('0000ffffffffffff',20,'b')],
    ['equal clock: smaller writer wins',revEntry('1111111111111111',5,'b'),revEntry('2222222222222222',5,'a')],
    ['unclocked hint ranks below a clocked one',revEntry('0000000000000000'),revEntry('ffffffffffffffff',0,'a')],
  ].map(([name,a,b])=>{
    const expected=spaces.mergeIndex(revIndex(a),revIndex(b));
    assert.deepEqual(spaces.mergeIndex(revIndex(b),revIndex(a)),expected);
    return entry(name,{a:revIndex(a),b:revIndex(b)},expected);
  });
  // Uploads relay what this version can't interpret, unchanged.
  const relayTab=(n,over={})=>({...selectionTab(n),...over});
  const partialTab=relayTab(1);delete partialTab.name;
  const relayRemote={v:1,spaceId:pipeSpace,groups:{},tabs:{[sid(1)]:partialTab,[sid(2)]:relayTab(2,{muted:spaces.field(true,100,'b')}),
    [sid(3)]:relayTab(3,{nav:spaces.field({url:'https://example.test/'+'x'.repeat(2100),title:'Long'},300,'b')})}};
  const ownTab=relayTab(4,{nav:spaces.field({url:'https://example.test/4',title:'Four'},150,'a')});
  const relayInput={fetchedBlob:relayRemote,fetchedVersion:'version-1',localBlob:{v:1,spaceId:pipeSpace,groups:{},tabs:{[sid(3)]:relayTab(3),[sid(4)]:ownTab}},
    pending:{tabs:{[sid(4)]:{nav:ownTab.nav}}},lastMergeAt:1000,now:2000,deviceId:'a'};
  const relayResult=spaces.pushPlan({...relayInput,encryptFn:t=>crypt.encrypt(Buffer.alloc(32),t)});
  vectors.spacesRelay=[entry('unknown field, incomplete record and uninterpretable newer value are relayed',relayInput,
    {...relayResult,recover:[...relayResult.recover],unsynced:[...relayResult.unsynced]})];
  // M17: groups on the phone follow desktop's section and naming rules.
  const sections = require('../src/renderer/tab-sections.js');
  const groupNames = require('../src/main/group-name-case.js');
  const t=(id,groupId=null,pinned=false)=>({id,groupId,pinned});
  vectors.tabSections=[
    ['ungrouped only',[t('a'),t('b')]],
    ['run, group, run',[t('a'),t('b','g'),t('c','g'),t('d')]],
    ['group split by a loose tab',[t('a','g'),t('b'),t('c','g')]],
    ['two groups interleaved',[t('a','g'),t('b','h'),t('c','g'),t('d','h')]],
    ['grouped pin leads its group',[t('a','g'),t('b','g',true),t('c')]],
    ['shelf pins first',[t('a'),t('b',null,true),t('c','g'),t('d',null,true)]],
    ['runs between groups',[t('a'),t('b','g'),t('c'),t('d'),t('e','h'),t('f')]],
    ['only pins',[t('a',null,true),t('b',null,true)]],
    ['empty',[]],
    ['group first',[t('a','g'),t('b','g'),t('c')]],
    ['loose tab after its group member',[t('a','g'),t('b'),t('c','h'),t('d','g')]],
    ['pinned and unpinned in two groups',[t('a','h',true),t('b','g'),t('c','h'),t('d','g',true)]],
  ].map(([name,list])=>entry(name,{list},{sections:sections.sectionsOf(list),order:sections.normalizeOrder(list)}));
  vectors.tabPlaceInGroup=[
    ['join after last member',[t('a','g'),t('b'),t('c','g'),t('d')],'d','g'],
    ['no other member',[t('a'),t('b')],'a','g'],
    ['move within',[t('a','g'),t('b','g'),t('c')],'a','g'],
  ].map(([name,list,id,groupId])=>{const order=list.map(x=>x.id);const moved=list.map(x=>x.id===id?{...x,groupId}:x);
    return entry(name,{order,list:moved,id,groupId},sections.placeInGroup(order,moved,id,groupId));});
  vectors.groupNames=['Research','  research  ','RESEARCH','ΟΔΟΣ','x'.repeat(50),'😀'.repeat(25),'İstanbul','','   ','eBay']
    .map(raw=>entry(raw,{raw},{normalized:groupNames.normalizeGroupName(raw),key:groupNames.groupNameKey(raw)}));
  const identity = require('../src/renderer/space-identity.js');
  vectors.spaceInk=[...identity.PRESETS.map(p=>p.hex),'#ffffff','#000000','#f6f6f6','#1e1e1e','#7f7f7f','#ABCDEF','abc','  #426C4C ']
    .flatMap(hex=>['light','dark','private'].map(theme=>entry(hex+' '+theme,{hex,theme},identity.paint(hex,theme))));
  vectors.spaceDefaults=[[],[{color:'#426c4c',symbol:'briefcase'}],identity.PRESETS.map((p,i)=>({color:p.hex,symbol:identity.SYMBOL_IDS[i]})),
    Array.from({length:17},(_, i)=>({color:identity.PRESETS[i%8].hex,symbol:identity.SYMBOL_IDS[i%16]}))]
    .map(existing=>entry(existing.length+' existing',{existing},identity.defaultsFor(existing)));
  // M17b: the rest of the Shared Spaces protocol iOS ports.
  const zeroKey=Buffer.alloc(32), F=(v,c=100,by='a')=>spaces.field(v,c,by), S=pipeSpace;
  const tabRec=(n,over={})=>({nav:F({url:`https://example.test/${n}`,title:`Tab ${n}`}),name:F(null),pinned:F(false),
    groupId:F(null),pos:F(spaces.keyFor('','',sid(n))),deleted:F(false),...over});
  const groupRec=(n,over={})=>({name:F(`Group ${n}`),color:F(null),collapsed:F(false),pos:F(spaces.keyFor('','',sid(n))),deleted:F(false),...over});
  const spaceRec=(n,over={})=>({name:F('Work'),color:F('#426c4c'),symbol:F('briefcase'),pos:F(spaces.keyFor('','',sid(n))),deleted:F(false),...over});
  const blob=(tabsMap={},groupsMap={},extra={})=>({v:1,spaceId:S,groups:groupsMap,tabs:tabsMap,...extra});
  const allOrders=(merge,a,b,c)=>{
    const expected=merge(merge(a,b),c);
    for(const [x,y,z] of [[a,b,c],[a,c,b],[b,a,c],[b,c,a],[c,a,b],[c,b,a]]) {
      assert.deepEqual(merge(merge(x,y),z),expected); assert.deepEqual(merge(x,merge(y,z)),expected);
    }
    return expected;
  };
  vectors.spacesMergeBlob=[
    ['field conflicts across three devices',
      blob({[sid(1)]:tabRec(1)},{[sid(50)]:groupRec(50,{name:F('Alpha',300,'a')})}),
      blob({[sid(1)]:tabRec(1,{nav:F({url:'https://example.test/one',title:'One'},200,'b')})},{[sid(50)]:groupRec(50,{name:F('Beta',300,'b')})}),
      blob({[sid(1)]:tabRec(1,{pinned:F(true,300,'c')}),[sid(2)]:tabRec(2,{groupId:F(sid(50),150,'c')})})],
    ['a tombstone wins over a newer live write',
      blob({[sid(1)]:{deleted:F(true,100,'a')}}),
      blob({[sid(1)]:tabRec(1,{deleted:F(false,500,'b'),nav:F({url:'https://example.test/later',title:'Later'},500,'b')})}),
      blob({[sid(1)]:tabRec(1,{name:F('Custom',300,'c')})})],
    ['equal clock and writer: the smaller canonical value',
      blob({[sid(1)]:tabRec(1,{nav:F({url:'https://example.test/b',title:'B'})})}),
      blob({[sid(1)]:tabRec(1,{nav:F({url:'https://example.test/a',title:'A'})})}),
      blob({[sid(1)]:tabRec(1,{nav:F({url:'https://example.test/a',title:'Z'})})})],
    ['writer ids compare by UTF-16 code units',
      blob({[sid(1)]:tabRec(1,{name:F('first',100,'￿')})}),
      blob({[sid(1)]:tabRec(1,{name:F('second',100,'😀')})}),
      blob({[sid(1)]:tabRec(1,{name:F('third',100,'\ue000')})})],
    ['unknown fields are dropped and a missing side is ignored',
      blob({[sid(1)]:tabRec(1,{muted:F(true,900,'z')})}),
      null,
      blob({[sid(3)]:tabRec(3)},{},{active:F(sid(3),50,'c')})],
    ['groups, selection and a deleted target',
      blob({[sid(1)]:tabRec(1),[sid(2)]:tabRec(2)},{[sid(50)]:groupRec(50)},{active:F(sid(1),400,'a')}),
      blob({[sid(1)]:tabRec(1,{deleted:F(true,450,'b')})},{[sid(50)]:groupRec(50,{collapsed:F(true,200,'b'),color:F('#9b4761',200,'b')})},{active:F(sid(2),300,'b')}),
      blob({[sid(2)]:tabRec(2,{groupId:F(sid(50),250,'c')})},{[sid(51)]:{deleted:F(true,10,'c')}},{active:F(sid(2),400,'b')})],
  ].map(([name,a,b,c])=>entry(name,{a,b,c},allOrders(spaces.mergeBlob,a,b,c)));
  const index=(map)=>({v:1,spaces:map});
  vectors.spacesMergeIndex=[
    ['identity fields and revision hints',
      index({[sid(60)]:{...spaceRec(60,{name:F('Home',200,'a')}),rev:'1111111111111111',revAt:10,revBy:'a',createdAt:1000,createdBy:'a'}}),
      index({[sid(60)]:{...spaceRec(60,{color:F('#376694',300,'b')}),rev:'2222222222222222',revAt:20,revBy:'b',createdAt:999,createdBy:'b'}}),
      index({[sid(60)]:{...spaceRec(60,{symbol:F('code',300,'c')}),rev:'3333333333333333',revAt:20,revBy:'a'},[sid(61)]:spaceRec(61)})],
    ['a deleted Space and an unclocked hint',
      index({[sid(60)]:{...spaceRec(60),rev:'aaaaaaaaaaaaaaaa'}}),
      index({[sid(60)]:{...spaceRec(60),deleted:F(true,50,'b'),createdBy:'x'.repeat(200)}}),
      index({[sid(62)]:{...spaceRec(62,{pos:F(spaces.keyFor('','',sid(62)),500,'c')}),createdAt:'soon',revAt:7}})],
  ].map(([name,a,b,c])=>entry(name,{a,b,c},allOrders(spaces.mergeIndex,a,b,c)));
  const long=n=>'n'.repeat(n);
  vectors.spacesSanitize=[
    ['junk ids are skipped',{kind:'blob',raw:blob({[sid(1)]:tabRec(1),ABCDEF:tabRec(2),[sid(3).toUpperCase()]:tabRec(3),[sid(4).slice(1)]:tabRec(4)},{'not-an-id':groupRec(5)})}],
    ['bad colours',{kind:'blob',raw:blob({},{[sid(1)]:groupRec(1,{color:F('red')}),[sid(2)]:groupRec(2,{color:F('  #ABCDEF ')}),[sid(3)]:groupRec(3,{color:F(null)}),[sid(4)]:groupRec(4,{color:F(42)})})}],
    ['long names',{kind:'blob',raw:blob({[sid(1)]:tabRec(1,{name:F('  a\u0085b\t\tc\u0007 '+'😀'.repeat(120))}),[sid(2)]:tabRec(2,{name:F('   ')}),[sid(3)]:tabRec(3,{nav:F({url:'https://example.test/3',title:long(250)})})},
      {[sid(4)]:groupRec(4,{name:F(long(61)+'😀')}),[sid(5)]:groupRec(5,{name:F(null)})})}],
    ['foreign scheme and oversized URLs',{kind:'blob',raw:blob({[sid(1)]:tabRec(1,{nav:F({url:'javascript:alert(1)',title:'x'})}),[sid(2)]:tabRec(2,{nav:F({url:'ftp://example.test/',title:'x'})}),
      [sid(3)]:tabRec(3,{nav:F({url:'data:text/html,hi',title:'x'})}),[sid(4)]:tabRec(4,{nav:F({url:'https://example.test/'+'x'.repeat(2030),title:'x'})}),[sid(5)]:tabRec(5,{nav:F({url:'HTTPS://Example.TEST/Up',title:7})}),
      [sid(6)]:tabRec(6,{nav:F({url:'not a url',title:'x'})}),[sid(7)]:{deleted:F(true),nav:F({url:'mailto:x@example.test',title:'x'})}})}],
    ['malformed fields',{kind:'blob',raw:blob({[sid(1)]:tabRec(1,{pinned:F(true,-1)}),[sid(2)]:tabRec(2,{pinned:F(true,1.5)}),[sid(3)]:tabRec(3,{pinned:F(true,100,'')}),
      [sid(4)]:tabRec(4,{pinned:F(true,100,'w'.repeat(129))}),[sid(5)]:tabRec(5,{pinned:{c:100,by:'a'}}),[sid(6)]:tabRec(6,{groupId:F('nope')}),[sid(7)]:tabRec(7,{pos:F(12)}),
      [sid(8)]:tabRec(8,{deleted:F('yes')}),[sid(9)]:{deleted:F(false)},[sid(10)]:{deleted:F(true,100,'w'.repeat(128))},[sid(11)]:tabRec(11,{pinned:F(true,9007199254740992)})})}],
    ['selection cleared or dropped',{kind:'blob',raw:blob({[sid(1)]:tabRec(1,{deleted:F(true)})},{},{active:F(sid(1),5,'a')})}],
    ['selection that is not an id',{kind:'blob',raw:blob({[sid(1)]:tabRec(1)},{},{active:F('first',5,'a')})}],
    ['selection already cleared',{kind:'blob',raw:blob({[sid(1)]:tabRec(1)},{},{active:{...F(sid(1),5,'a'),cleared:true}})}],
    ['unsupported version',{kind:'blob',raw:{...blob(),v:2}}],
    ['bad Space id',{kind:'blob',raw:{...blob(),spaceId:'space'}}],
    ['tabs not a map',{kind:'blob',raw:{...blob(),tabs:[]}}],
    ['not an object',{kind:'blob',raw:'blob'}],
    ['index repairs',{kind:'index',raw:index({[sid(1)]:spaceRec(1,{name:F('   '),color:F('teal'),symbol:F('rocket')}),[sid(2)]:{...spaceRec(2,{name:F(long(70))}),rev:'ABCDEFABCDEFABCD',revAt:4},
      [sid(3)]:{...spaceRec(3),rev:'0123456789abcdef',revAt:-1,revBy:'',createdAt:1.5,createdBy:'z'.repeat(130)},[sid(4)]:spaceRec(4,{symbol:F('constructor')}),[sid(5)]:spaceRec(5,{color:F(null)})})}],
    ['index unsupported',{kind:'index',raw:{v:1,spaces:[]}}],
  ].map(([name,input])=>entry(name,input,input.kind==='blob'?spaces.sanitizeBlob(input.raw):spaces.sanitizeIndex(input.raw)));
  const expNow=spaces.LIMITS.tombstoneMs+10000;
  vectors.spacesExpire=[
    ['tab and group tombstones at the edge',{blob:blob({[sid(1)]:{deleted:F(true,10000,'a')},[sid(2)]:{deleted:F(true,10001,'a')},[sid(3)]:tabRec(3,{deleted:F(false,1,'a')})},
      {[sid(4)]:{deleted:F(true,9999,'a')},[sid(5)]:groupRec(5,{deleted:F(true,10001,'a')})},{active:F(sid(1),20000,'a')}),now:expNow}],
    ['index tombstones',{blob:index({[sid(1)]:{...spaceRec(1),deleted:F(true,10000,'a')},[sid(2)]:{...spaceRec(2),deleted:F(true,20000,'a')},[sid(3)]:spaceRec(3)}),now:expNow}],
  ].map(([name,input])=>entry(name,input,spaces.expireTombstones(input.blob,input.now)));
  const setOut=({keep,recover})=>({keep:[...keep].sort(),recover:[...recover].sort()});
  vectors.spacesRecovery=[
    ['a recent merge keeps everything',{localBlob:blob({[sid(1)]:tabRec(1)},{[sid(2)]:groupRec(2)}),fetchedBlob:blob(),lastMergeAt:1000,now:2000}],
    ['stale: records missing remotely are recovered',{localBlob:blob({[sid(1)]:tabRec(1),[sid(3)]:tabRec(3)},{[sid(2)]:groupRec(2)}),fetchedBlob:blob({[sid(3)]:tabRec(3)}),lastMergeAt:1,now:spaces.LIMITS.tombstoneMs+2}],
    ['exactly thirty days is not stale',{localBlob:blob({[sid(1)]:tabRec(1)}),fetchedBlob:blob({[sid(3)]:tabRec(3)}),lastMergeAt:1,now:spaces.LIMITS.tombstoneMs+1}],
    ['never merged, remote empty',{localBlob:blob({[sid(1)]:tabRec(1)}),fetchedBlob:blob(),lastMergeAt:null,now:2000}],
    ['never merged, remote has content',{localBlob:blob({[sid(1)]:tabRec(1)}),fetchedBlob:blob({},{[sid(9)]:groupRec(9)}),lastMergeAt:null,now:2000}],
    ['never merged, no remote blob',{localBlob:blob({[sid(1)]:tabRec(1)}),fetchedBlob:null,lastMergeAt:null,now:2000}],
    ['expired local tombstones are neither',{localBlob:blob({[sid(1)]:{deleted:F(true,100,'a')},[sid(2)]:tabRec(2)}),fetchedBlob:blob({[sid(3)]:tabRec(3)}),lastMergeAt:1,now:spaces.LIMITS.tombstoneMs+200}],
  ].map(([name,input])=>entry(name,input,setOut(spaces.recoveryDecision(input))));
  const padEncrypt=pad=>t=>crypt.encrypt(zeroKey,t+' '.repeat(pad));
  // The largest padding at which `fits` still fits, so one more change does not.
  const padFor=fits=>{let lo=0,hi=spaces.LIMITS.blobBytes;while(lo<hi){const m=Math.ceil((lo+hi)/2);if(spaces.blobFits(fits,padEncrypt(m)))lo=m;else hi=m-1;}return lo;};
  const unit=(kind,id,after,over={})=>({kind,id,key:kind+':'+id,before:null,after,required:false,clock:100,dependencies:[],...over});
  const admitBase=blob({[sid(1)]:tabRec(1),[sid(2)]:tabRec(2)});
  const admitCases=[
    ['fits',admitBase,[unit('tabs',sid(2),tabRec(2))],admitBase],
    ['the newest change is held back',blob({[sid(1)]:tabRec(1),[sid(2)]:tabRec(2,{nav:F({url:'https://example.test/'+'q'.repeat(400),title:'Q'},300,'a')}),[sid(3)]:tabRec(3)}),
      [unit('tabs',sid(2),tabRec(2,{nav:F({url:'https://example.test/'+'q'.repeat(400),title:'Q'},300,'a')}),{before:tabRec(2),clock:300}),unit('tabs',sid(3),tabRec(3),{clock:200})],blob({[sid(1)]:tabRec(1),[sid(2)]:tabRec(2),[sid(3)]:tabRec(3)})],
    ['closed tabs would free the room',blob({[sid(1)]:tabRec(1),[sid(2)]:tabRec(2),[sid(4)]:tabRec(4),[sid(5)]:{deleted:F(true,50,'b')}}),
      [unit('tabs',sid(4),tabRec(4))],blob({[sid(1)]:tabRec(1),[sid(2)]:tabRec(2),[sid(4)]:tabRec(4)})],
    ['a tab in a new group is held with its group',blob({[sid(1)]:tabRec(1),[sid(2)]:tabRec(2),[sid(7)]:tabRec(7,{groupId:F(sid(50),300,'a')})},{[sid(50)]:groupRec(50)}),
      [unit('groups',sid(50),groupRec(50),{clock:400}),unit('tabs',sid(7),tabRec(7,{groupId:F(sid(50),300,'a')}),{clock:300,dependencies:['groups:'+sid(50)]})],admitBase],
    ['required state over budget',blob({[sid(1)]:tabRec(1),[sid(2)]:tabRec(2),[sid(3)]:tabRec(3)}),[unit('tabs',sid(3),tabRec(3),{required:true})],admitBase],
    ['retry order outranks clocks',blob({[sid(1)]:tabRec(1),[sid(2)]:tabRec(2),[sid(3)]:tabRec(3),[sid(4)]:tabRec(4)}),
      [unit('tabs',sid(3),tabRec(3),{clock:900,admissionRank:0}),unit('tabs',sid(4),tabRec(4),{clock:100,admissionRank:1})],blob({[sid(1)]:tabRec(1),[sid(2)]:tabRec(2),[sid(3)]:tabRec(3)})],
  ];
  vectors.spacesAdmit=admitCases.map(([name,candidate,changes,fitting])=>{
    const pad=padFor(fitting),r=spaces.admit({candidate,changes,encryptFn:padEncrypt(pad)});
    return entry(name,{candidate,changes,pad},{blob:r.blob,unsynced:[...r.unsynced].sort(),reason:r.reason});
  });
  {
    const relay=blob({[sid(1)]:tabRec(1,{muted:F(true,100,'b')}),[sid(9)]:{deleted:F(true,1,'b')}});
    const candidate=blob({[sid(1)]:tabRec(1),[sid(2)]:tabRec(2)});
    const finish=b=>spaces.relayInto(b,relay,spaces.LIMITS.tombstoneMs+2,{tabs:[],groups:[]});
    const pad=padFor(finish(blob({[sid(1)]:tabRec(1)})));
    const r=spaces.admit({candidate,changes:[unit('tabs',sid(2),tabRec(2))],encryptFn:padEncrypt(pad),finish});
    vectors.spacesAdmit.push(entry('limits apply to the relayed upload',{candidate,changes:[unit('tabs',sid(2),tabRec(2))],pad,relay,now:spaces.LIMITS.tombstoneMs+2,retired:{tabs:[],groups:[]}},
      {blob:r.blob,unsynced:[...r.unsynced].sort(),reason:r.reason}));
  }
  const badKey='0'+spaces.tagOf(sid(3));
  vectors.spacesOrder=[
    ['positions, then invalid keys by id',{records:{[sid(3)]:tabRec(3,{pos:F(badKey)}),[sid(1)]:tabRec(1,{pos:F(spaces.keyFor('a','',sid(1)))}),[sid(2)]:tabRec(2,{pos:F(spaces.keyFor('','a',sid(2)))}),
      [sid(4)]:tabRec(4,{pos:F(spaces.keyFor('','',sid(5)))}),[sid(5)]:tabRec(5,{pos:F('')}),[sid(6)]:tabRec(6,{deleted:F(true)}),junk:tabRec(7),[sid(8)]:tabRec(8,{pos:F(spaces.keyFor('','',sid(8)).toUpperCase())})}}],
    ['equal keys fall back to ids',{records:{[sid(2)]:tabRec(2,{pos:F('i'+spaces.tagOf(sid(2)))}),[sid(1)]:tabRec(1,{pos:F('i'+spaces.tagOf(sid(1)))}),[sid(9)]:{pos:F(12)}}}],
  ].map(([name,input])=>entry(name,input,spaces.orderOf(input.records)));
  const pend=(tabsMap,extra={})=>({tabs:tabsMap,...extra});
  vectors.spacesLocalEdits=[
    ['apply merges per field',{op:'apply',pending:pend({[sid(1)]:{nav:F({url:'https://example.test/1',title:'Old'},100,'a')}}),edits:pend({[sid(1)]:{nav:F({url:'https://example.test/1',title:'New'},200,'a'),pinned:F(true,200,'a')},[sid(2)]:{deleted:F(true,200,'a')}})}],
    ['apply drops invalid writes',{op:'apply',pending:{},edits:{tabs:{[sid(1)]:{pos:F('a1'),groupId:F('g'),name:F(null),pinned:F('x'),nav:F({url:'ftp://x.test/',title:''})},bogus:{deleted:F(true)}},
      groups:{[sid(2)]:{color:F(null),name:F(null),collapsed:F(null),pos:F(spaces.keyFor('','',sid(2)))}},spaces:{[sid(3)]:{name:F('x')}}}}],
    ['apply merges the selection and keeps a receipt',{op:'apply',pending:{active:F(sid(1),100,'a'),index:{id:sid(99),rev:'0123456789abcdef',at:5,by:'a'}},edits:{active:F(sid(2),200,'a')}}],
    ['apply sanitizes the receipt',{op:'apply',pending:{index:{id:sid(99),rev:'0123456789ABCDEF'},active:{...F(sid(1)),cleared:true}},edits:{}}],
    ['apply keeps a valid receipt without its clock',{op:'apply',pending:{index:{id:sid(99),rev:'0123456789abcdef',at:-3,by:''}},edits:{}}],
    ['settle clears acknowledged fields only',{op:'settle',pending:pend({[sid(1)]:{nav:F({url:'https://example.test/1',title:'Mine'},200,'a'),pinned:F(true,200,'a')},[sid(2)]:{deleted:F(true,200,'a')}},{active:F(sid(1),300,'a')}),
      fetched:blob({[sid(1)]:tabRec(1,{nav:F({url:'https://example.test/1',title:'Mine'},200,'a'),pinned:F(false,100,'a')}),[sid(2)]:tabRec(2,{deleted:F(true,250,'b')})},{},{active:F(sid(1),300,'a')})}],
    ['settle against a missing blob keeps everything',{op:'settle',pending:pend({[sid(1)]:{pinned:F(true,200,'a')}}),fetched:{}}],
    ['settle: a newer remote write acknowledges ours',{op:'settle',pending:pend({[sid(1)]:{pinned:F(true,200,'a')}}),fetched:blob({[sid(1)]:tabRec(1,{pinned:F(false,300,'b')})})}],
  ].map(([name,input])=>entry(name,input,input.op==='apply'?spaces.applyLocalEdits(input.pending,input.edits):spaces.settlePending(input.pending,input.fetched)));
  // A scripted hour of the request scheduler: clocks set before each step.
  {
    const { createScheduler } = require('../src/main/sync-scheduler');
    let wall=fixedNow, mono=5000;
    const steps=[];let scheduler=createScheduler({now:()=>wall,monotonic:()=>mono});
    steps.push({op:'start',wall,mono,options:{},expected:scheduler.snapshot()});
    const events=[];let rate=0;
    const work=n=>({I:n%7===0,S:n%3===0?[sid(1),sid(2)]:n%5===0?[sid(2)]:[],F:n%2===0?['shared','session','bookmarks','zeta','settings']:['icons'],R:n%11===0?[sid(3)]:[]});
    for(let n=0;n<720;n++) {
      const minute=Math.floor(n/12);
      if(n===360) {
        const snap=scheduler.snapshot(); mono=1000;
        const options={log:snap.log,nextClass:snap.nextClass,cursors:snap.cursors,windowLimit:snap.windowLimit,backoffUntil:snap.backoffUntil};
        scheduler=createScheduler({...options,now:()=>wall,monotonic:()=>mono});events.length=0;
        steps.push({op:'start',wall,mono,options,expected:scheduler.snapshot()});
      }
      if(n===540) wall-=600000;
      if(n%40===0){steps.push({op:'markIndexDue',wall,mono});scheduler.markIndexDue();}
      const w=work(n);
      steps.push({op:'canRequest',wall,mono,expected:scheduler.canRequest()});
      steps.push({op:'windowFreesAt',wall,mono,expected:scheduler.windowFreesAt()});
      const pick=scheduler.next(w);
      steps.push({op:'next',wall,mono,work:w,expected:pick?{class:pick.class,item:pick.item}:null});
      if(pick) {
        const e=scheduler.record();events.push(e);
        steps.push({op:'record',wall,mono,event:events.length-1,expected:{wall:e.wall,at:e.at}});
        wall+=150;mono+=150;
        scheduler.settle(e);steps.push({op:'settle',wall,mono,event:events.length-1,expected:{wall:e.wall,at:e.at}});
        if((minute===12||minute===13||minute===40)&&rate++%2===0){wall+=10;mono+=10;scheduler.onRateLimited();steps.push({op:'rateLimited',wall,mono});}
      }
      if(n%12===11) steps.push({op:'snapshot',wall,mono,expected:scheduler.snapshot()});
      wall+=5000-(pick?150:0);mono+=5000-(pick?150:0);
    }
    vectors.schedulerScript=[entry('a scripted hour',{limit:10,windowMs:60000,steps},null)];
  }
  // Recently closed, synced (M16 §7).
  {
    const closed=require('../src/main/synced-closed-model');
    const ci=(id,over={})=>({id,url:`https://example.test/${id}`,title:id,closedAt:fixedNow-1000,spaceId:null,...over});
    const ce=(name,updatedAt,items=[],platform='darwin')=>({name,platform,updatedAt,items});
    const H=closed.ITEM_TTL_MS, E=closed.ENTRY_TTL_MS;
    vectors.closedModel=[];
    for(const [name,previous,args,force] of [
      ['first entry',null,{name:'iPhone',platform:'ios'},false],
      ['heartbeat not due',ce('iPhone',fixedNow-closed.HEARTBEAT_MS+1,[ci('a')],'ios'),{name:'iPhone',platform:'ios'},false],
      ['heartbeat due',ce('iPhone',fixedNow-closed.HEARTBEAT_MS,[],'ios'),{name:'iPhone',platform:'ios'},false],
      ['forced',ce('iPhone',fixedNow-1000,[],'ios'),{name:'iPhone',platform:'ios'},true],
      ['renamed and long',ce('iPhone',fixedNow-1000,[],'ios'),{name:'P'.repeat(90),platform:'ios'},false],
      ['unknown platform, empty name',null,{name:'',platform:'beos'},false],
      ['after a retraction',{retracted:true,updatedAt:fixedNow-1000},{name:'iPhone',platform:'ios'},false],
      ['expired and invalid items dropped',ce('iPhone',fixedNow-1000,[ci('old',{closedAt:fixedNow-H}),ci('ok',{closedAt:fixedNow-H+1}),ci('ftp',{url:'ftp://x.test/'}),ci('priv',{private:true}),ci('',{}),ci('z'.repeat(65)),ci('dup',{closedAt:fixedNow-10}),ci('dup',{closedAt:fixedNow-5}),ci('t',{title:'T'.repeat(250),spaceId:sid(4)}),ci('s',{spaceId:'nope'})],'ios'),{name:'iPhone',platform:'ios'},false],
    ]) vectors.closedModel.push(entry(name,{op:'own',previous,...args,now:fixedNow,force},closed.ownEntry(previous,args,fixedNow,{force})));
    const many=Array.from({length:30},(_,i)=>ci(`i${String(i).padStart(2,'0')}`,{closedAt:fixedNow-(30-i)*1000}));
    for(const [name,local,remote] of [
      ['own wins tie',{own:ce('local',fixedNow)},{own:ce('remote',fixedNow)}],
      ['smaller canonical wins tie',{mac:ce('😀',fixedNow)},{mac:ce('￿',fixedNow)}],
      ['remote newer',{mac:ce('old',fixedNow-2000)},{mac:ce('new',fixedNow-1000)}],
      ['retraction wins tie',{mac:ce('Mac',fixedNow)},{mac:{retracted:true,updatedAt:fixedNow}}],
      ['thirty day prune, own kept',{own:ce('own',fixedNow-E)},{old:ce('old',fixedNow-E),edge:ce('edge',fixedNow-E+1)}],
      ['thirty items keep newest 25',{},{mac:ce('Mac',fixedNow,many)}],
      ['invalid entries dropped',{bad:{updatedAt:0},worse:{name:'x'},odd:ce(5,fixedNow,[],'plan9')},{}],
    ]) vectors.closedModel.push(entry(name,{op:'merge',local,remote,ownId:'own',now:fixedNow},closed.mergeDevices(local,remote,'own',fixedNow)));
    const fat=id=>ce(id,fixedNow-({own:5000,a:4000,b:3000,c:2000})[id],many.slice(0,25).map(i=>({...i,id:`${id}${i.id}`,title:'x'.repeat(40)})));
    const budgetDevices={own:fat('own'),a:fat('a'),b:fat('b'),c:fat('c')};
    for(const maxBytes of [8000,2500,100]) vectors.closedModel.push(entry(`budget ${maxBytes}`,{op:'budget',devices:budgetDevices,ownId:'own',maxBytes},closed.applyBudget(budgetDevices,'own',{maxBytes})));
    const inboxDevices={mac:ce('Mac',fixedNow,[ci('a',{closedAt:fixedNow-3000}),ci('c',{closedAt:fixedNow-2000}),ci('b',{closedAt:fixedNow-2000}),ci('old',{closedAt:fixedNow-H})]),
      phone:ce('iPhone',fixedNow,[ci('self')],'ios'),pc:ce('PC',fixedNow,[ci('d',{spaceId:sid(4)})],'win32'),gone:{retracted:true,updatedAt:fixedNow}};
    vectors.closedModel.push(entry('inbox',{op:'inbox',devices:inboxDevices,ownId:'phone',dismissed:{c:fixedNow},now:fixedNow},closed.inbox(inboxDevices,'phone',{c:fixedNow},fixedNow)));
    const dismissed={a:fixedNow-2*closed.ITEM_TTL_MS,b:fixedNow-2*closed.ITEM_TTL_MS+1,['z'.repeat(65)]:fixedNow,c:'soon'};
    vectors.closedModel.push(entry('prune dismissed',{op:'prune',dismissed,now:fixedNow},closed.pruneDismissed(dismissed,fixedNow)));
    for(const [name,previous,raw] of [
      ['add to an empty entry',null,ci('n1',{closedAt:fixedNow,spaceId:sid(4)})],
      ['add prepends and dedupes',ce('iPhone',fixedNow-1000,[ci('n1',{closedAt:fixedNow-500}),...many.slice(0,24)],'ios'),ci('n1',{closedAt:fixedNow})],
      ['an invalid item is refused',ce('iPhone',fixedNow-1000,[],'ios'),ci('n2',{url:'about:blank'})],
    ]) {
      const mod=moduleInProfile('synced-closed',{accountId:'acct',devices:previous?{phone:previous}:{},dismissed:{}});
      const ctx={accountId:'acct',deviceId:'phone',deviceName:'iPhone',platform:'ios'};
      const added=mod.addOwnItem(ctx,raw);
      vectors.closedModel.push(entry(name,{op:'add',previous,item:raw,name:'iPhone',platform:'ios',now:fixedNow},{added,entry:mod.rebind('acct').data.devices.phone??null}));
    }
  }
  // The shared sidecar: this device's binding, the merge and the hide rule.
  {
    const surfaces=require('../src/main/shared-spaces-surfaces');
    const ctx={accountId:'acct',deviceId:'phone'};
    const T=tabs.PRUNE_MS;
    vectors.sidecar=[];
    for(const [name,binding] of [
      ['valid binding',{forUpdatedAt:fixedNow-5,tabs:[{i:0,spaceId:sid(4)},{i:3,spaceId:sid(5),extra:true}]}],
      ['junk rows dropped',{forUpdatedAt:fixedNow-5,tabs:[{i:-1,spaceId:sid(4)},{i:1.5,spaceId:sid(4)},{i:2,spaceId:'x'},{i:'3',spaceId:sid(4)},{i:4,spaceId:sid(4)}]}],
      ['stale binding refused',{forUpdatedAt:fixedNow-T,tabs:[]}],
      ['unclocked binding refused',{forUpdatedAt:0,tabs:[]}],
      ['tabs missing',{forUpdatedAt:fixedNow-5}],
    ]) {
      const mod=moduleInProfile('shared-spaces',{accountId:'acct'});mod.setOwnSidecar(binding,ctx);
      vectors.sidecar.push(entry(name,{op:'own',binding,now:fixedNow},mod.snapshot(ctx).sidecar.devices.phone??null));
    }
    const sess=(updatedAt,n,name='Mac')=>({name,platform:'darwin',updatedAt,tabs:Array.from({length:n},(_,i)=>({url:`https://example.test/${name}/${i}`,title:`${i}`,groupId:null,pinned:false})),groups:[]});
    const session={mac:sess(fixedNow-100,4),pc:sess(fixedNow-200,3,'PC'),old:sess(fixedNow-300,2,'Old'),tie:sess(fixedNow-400,2,'Tie')};
    const local={devices:{tie:{forUpdatedAt:fixedNow-400,tabs:[{i:0,spaceId:sid(4)}]},mac:{forUpdatedAt:fixedNow-100,tabs:[{i:3,spaceId:sid(4)}]}}};
    const remote={devices:{mac:{forUpdatedAt:fixedNow-100,tabs:[{i:1,spaceId:sid(4)},{i:2,spaceId:sid(5)},{i:9,spaceId:sid(4)}]},pc:{forUpdatedAt:fixedNow-200,tabs:[{i:0,spaceId:sid(4)}]},
      old:{forUpdatedAt:fixedNow-301,tabs:[{i:0,spaceId:sid(4)}]},tie:{forUpdatedAt:fixedNow-400,tabs:[{i:1,spaceId:sid(4)}]},stale:{forUpdatedAt:fixedNow-T,tabs:[]}}};
    for(const [name,visible] of [['only visible Spaces hide',[sid(4)]],['every Space visible',[sid(4),sid(5)]],['no Space visible',[]]]) {
      const mod=moduleInProfile('shared-spaces',{accountId:'acct',sidecar:local});mod.mergeSidecar(remote,ctx);
      const sidecar=mod.snapshot(ctx).sidecar,devices=tabs.displayDevices(session,'phone',{now:fixedNow});
      const shown=surfaces.hideOccurrences(devices,sidecar,new Set(visible)),hidden={};
      devices.forEach((device,n)=>{const kept=new Set(shown[n].tabs),h=device.tabs.map((t,i)=>kept.has(t)?null:i).filter(i=>i!==null);if(h.length)hidden[device.deviceId]=h;});
      vectors.sidecar.push(entry(name,{op:'merge',local,remote,session,visible,now:fixedNow},{sidecar,hidden}));
    }
  }
  // F27 membership: a fresh clock when the tabs sitting in shared Spaces change.
  {
    const tt=(n,over={})=>({url:`https://example.test/${n}`,title:`Tab ${n}`,groupId:null,pinned:false,sharedSpaceId:null,...over});
    const script=[
      [fixedNow,[tt(1),tt(2,{sharedSpaceId:sid(4)})],[]],
      [fixedNow+1000,[tt(1),tt(2,{sharedSpaceId:sid(4)})],[]],
      [fixedNow+2000,[tt(1,{sharedSpaceId:sid(4)}),tt(2,{sharedSpaceId:sid(4)})],[]],
      [fixedNow+2000,[tt(1),tt(2,{sharedSpaceId:sid(4)})],[]],
      [fixedNow+3000,[tt(0,{private:true,sharedSpaceId:sid(4)}),{...tt(9),url:'ftp://example.test/'},tt(1,{groupId:'g1',pinned:true}),tt(2,{sharedSpaceId:sid(4),customTitle:'Mine'}),tt(3,{sharedSpaceId:sid(5),title:'x'.repeat(250)})],[{id:'g1',name:'G'.repeat(90),collapsed:true},{id:'g2',name:'Empty'}]],
      [fixedNow+4000,[tt(1,{groupId:'g1',pinned:true}),tt(2,{sharedSpaceId:sid(4),customTitle:'Mine'}),tt(3,{sharedSpaceId:sid(5),title:'x'.repeat(250)})],[{id:'g1',name:'G'.repeat(90)}]],
    ];
    activeDir=fs.mkdtempSync(path.join(tmp,'tab-sync'));fs.writeFileSync(path.join(activeDir,'tab-sync.json'),JSON.stringify({accountId:'acct',devices:{}}));
    for(const mod of ['store','tabsync'])delete require.cache[require.resolve(`../src/main/${mod}`)];
    const tabsync=require('../src/main/tabsync');
    let current={tabList:[],groups:[]};tabsync.setSnapshotProvider(()=>current);
    const ctx={accountId:'acct',deviceId:'phone',syncTabs:true,deviceName:'iPhone',platform:'ios'};
    const steps=[];
    try {
      for(const [now,tabList,groups] of script) {
        current={tabList,groups};Date.now=()=>now;
        const payload=tabsync.exportForSync(ctx);
        steps.push({now,tabs:tabList,groups,expected:{entry:payload.devices.phone,bindings:tabsync.publishedSidecar(payload),
          stored:tabsync.getDeviceEntries(ctx).phone}});
      }
    } finally { Date.now=()=>fixedNow; }
    vectors.tabSnapshotMembership=[entry('membership script',{steps},null)];
  }
  // Pair links (design 2026-10-28 §7.3): one case table for both platforms.
  vectors.pairLinks=require('../test/unit/fixtures/pair-link-cases.json').cases.map(({name,input})=>entry(name,input,pair.pairLinkCode(input)));
  const output=JSON.stringify(vectors,null,2)+'\n';
  if (process.argv.includes('--write')) { fs.mkdirSync(path.dirname(dest),{recursive:true}); fs.writeFileSync(dest,output); }
  else if (fs.readFileSync(dest,'utf8') !== output) { throw new Error('iOS sync vectors are stale; run npm run ios:sync-vectors:build'); }
} finally {
  for (const mod of loaded) { mod.flushSettings?.(); }
  Date.now=dateNow; if(original) require.cache[electronId]=original; else delete require.cache[electronId];
  fs.rmSync(tmp,{recursive:true,force:true});
}
