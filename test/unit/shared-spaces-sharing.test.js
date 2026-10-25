'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const model=require('../../src/main/shared-spaces-model');
let sharing={};try{sharing=require('../../src/main/shared-spaces-sharing');}catch(error){if(error.code!=='MODULE_NOT_FOUND')throw error;}
const id=n=>n.toString(16).padStart(32,'0'),f=(v,c=10)=>({v,c,by:'old'});
const workspace=(key='local')=>({id:key,name:'Work',color:'#426c4c',symbol:'briefcase',urls:['https://one.test/'],meta:[{title:'One'}],pinned:[false],groupIds:[null],groups:[],activeIndex:0});
const options=()=>{let n=100;return {now:1000,deviceId:'desktop',ids:()=>id(n++),encryptFn:()=>({ct:'fits'})};};
const indexEntry=()=>({name:f('Work'),color:f('#426c4c'),symbol:f('briefcase'),pos:f(model.keyFor('','',id(1))),deleted:f(false)});
test('first sharing creates fresh Space and tab ids with current field clocks',()=>{
  assert.equal(typeof sharing.planSharing,'function');const w=workspace();w.tabIds=[id(1)];
  const result=sharing.planSharing({v:1,spaces:{}},[w],[{id:w.id,mode:'copy'}],options());
  assert.equal(result.ok,true);assert.equal(result.items.length,1);
  const item=result.items[0];assert.notEqual(item.spaceId,id(1));assert.equal(item.blob.spaceId,item.spaceId);
  const tab=Object.values(item.blob.tabs)[0];assert.equal(tab.nav.c,1000);assert.equal(tab.nav.by,'desktop');
  assert.equal(Object.keys(item.blob.tabs).includes(id(1)),false);
});
test('same-name local and remote Spaces remain distinct records',()=>{
  const result=sharing.planSharing({v:1,spaces:{[id(1)]:indexEntry()}},[workspace()],[{id:'local',mode:'copy'}],options());
  assert.equal(result.ok,true);assert.notEqual(result.items[0].spaceId,id(1));assert.equal(result.items[0].index.name.v,'Work');
});
test('an oversized selection is refused atomically with a split reason',()=>{
  const opts={...options(),encryptFn:()=>({ct:'x'.repeat(600000)})};
  const result=sharing.planSharing({v:1,spaces:{}},[workspace()],[{id:'local',mode:'copy'}],opts);
  assert.equal(result.ok,false);assert.equal(result.error,'full');assert.equal(result.items.length,0);
});
test('a selected set above 25 is refused without dropping any Space',()=>{
  const spaces=Object.fromEntries(Array.from({length:25},(_,n)=>[id(n+1),{...indexEntry(),pos:f(model.keyFor('','',id(n+1)))}]));
  const result=sharing.planSharing({v:1,spaces},[workspace()],[{id:'local',mode:'copy'}],options());
  assert.equal(result.ok,false);assert.equal(result.error,'limit');assert.equal(result.items.length,0);
});
test('Rejoin preserves the dormant record identity and leaves all clocks untouched',()=>{
  const w={...workspace(),sharedId:id(1),sharedLink:'dormant',tabIds:[id(2)]};
  const result=sharing.planSharing({v:1,spaces:{[id(1)]:indexEntry()}},[w],[{id:w.id,mode:'rejoin'}],options());
  assert.equal(result.ok,true);assert.equal(result.items[0].spaceId,id(1));assert.equal(result.items[0].mode,'rejoin');assert.equal(result.items[0].blob,undefined);
});
test('Add as a copy after dormancy allocates new identities; deleted Spaces cannot Rejoin',()=>{
  const w={...workspace(),sharedId:id(1),sharedLink:'dormant',tabIds:[id(2)]},index={v:1,spaces:{[id(1)]:{...indexEntry(),deleted:f(true)}}};
  assert.equal(sharing.planSharing(index,[w],[{id:w.id,mode:'rejoin'}],options()).error,'deleted');
  const copy=sharing.planSharing(index,[w],[{id:w.id,mode:'copy'}],options()).items[0];assert.notEqual(copy.spaceId,id(1));assert.equal(Object.keys(copy.blob.tabs).includes(id(2)),false);
});
test('recovery appends only missing tab ids and preserves existing recovery entries',()=>{
  const first={v:1,spaceId:id(99),groups:{},tabs:{[id(2)]:{nav:f({url:'https://two.test/',title:'Two'}),name:f(null),pinned:f(false),groupId:f(null),pos:f(model.keyFor('','',id(2))),deleted:f(false)}}};
  const capture=sharing.recoveryCapture(null,first),again=sharing.recoveryCapture(capture,first);
  assert.deepEqual(again,capture);assert.deepEqual(capture.tabIds,[id(2)]);
  assert.deepEqual(capture.urls,['https://two.test/']);
});
test('a library preview reads the index while consent is off and never publishes',async t=>{
  const {syncDevice}=require('./support/sync-device'),{encrypt}=require('../../src/main/sync-crypto');const requests=[];
  const d=syncDevice({fetch:async(url,options={})=>{requests.push(options.method??'GET');return {status:200,ok:true,json:async()=>({version:'v',blob:encrypt(Buffer.alloc(32,9),JSON.stringify({v:1,spaces:{[id(1)]:indexEntry()}}))})};}});
  t.after(()=>d.dispose());
  assert.equal(typeof d.sync.sharedIndexPreview,'function');
  const result=await d.sync.sharedIndexPreview();assert.equal(result.ok,true);assert.deepEqual(requests,['GET']);
  assert.equal(d.spaces.spaceCount({accountId:d.record.accountId}),1);assert.equal(d.spaces.isEnabled({accountId:d.record.accountId}),false);
});
test('a dormant Space stays out of the network queue while other shared Spaces sync',async t=>{
  const {syncDevice}=require('./support/sync-device');const requests=[];
  const d=syncDevice({fetch:async(url,options={})=>{requests.push(String(url));return {status:404,ok:false,text:async()=> 'not found'};}});
  t.after(()=>d.dispose());const ctx={accountId:d.record.accountId};d.spaces.setEnabled(true,ctx);
  assert.equal(typeof d.spaces.setDormant,'function');d.spaces.setDormant([id(1)],ctx);
  await d.sync.syncNow(['space-'+id(1)]);assert.equal(requests.length,0);
  assert.equal(d.spaces.isDormant(id(1),ctx),true);
});
