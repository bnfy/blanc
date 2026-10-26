'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const model=require('../../src/main/shared-spaces-model');
let adapter={};try{adapter=require('../../src/main/shared-spaces-adapter');}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;}
const id=n=>n.toString(16).padStart(32,'0'),f=(v,c=100)=>({v,c,by:'a'});
function baseline() {
  const p=model.keyFor('','',id(1));
  const tab=(n,pos)=>({nav:f({url:'https://'+(n===1?'one':'two')+'.test/',title:n===1?'One':'Two'}),name:f(null),pinned:f(false),groupId:f(null),pos:f(pos),deleted:f(false)});
  return {v:1,spaceId:id(99),groups:{},tabs:{[id(1)]:tab(1,p),[id(2)]:tab(2,model.keyFor(p,'',id(2)))},active:f(id(1))};
}
const capture=()=>({urls:['https://one.test/','https://two.test/'],meta:[{title:'One'},{title:'Two'}],tabIds:[id(1),id(2)],pinned:[false,false],groupIds:[null,null],groups:[],activeIndex:0});
const ids=()=>{let n=10;return ()=>id(n++);};
test('a new tab gets a fresh id and a position after its neighbour',()=>{
  assert.equal(typeof adapter.diffWindow,'function');const b=baseline(),c=capture();
  c.urls.push('https://new.test/');c.meta.push({title:'New'});c.tabIds.push(null);
  const result=adapter.diffWindow(b,c,200,'b',ids()),tab=result.nextBaseline.tabs[id(10)];
  assert.equal(tab.nav.v.url,'https://new.test/');assert.ok(tab.pos.v>b.tabs[id(2)].pos.v);assert.ok(model.validKey(tab.pos.v,id(10)));
  assert.equal(result.tabIds[2],id(10));assert.equal(tab.deleted.v,false);
});
test('navigation changes one nav field rather than closing and recreating the tab',()=>{
  const c=capture();c.urls[0]='https://changed.test/';c.meta[0].title='Changed';
  const result=adapter.diffWindow(baseline(),c,200,'b',ids());
  assert.deepEqual(Object.keys(result.edits.tabs[id(1)]),['nav']);assert.equal(result.edits.tabs[id(1)].nav.c,200);
});
test('a missing tab becomes a final tombstone and a reopened tombstoned id is replaced',()=>{
  const b=baseline(),c=capture();c.urls.pop();c.meta.pop();c.tabIds.pop();
  const removed=adapter.diffWindow(b,c,200,'b',ids());assert.deepEqual(removed.edits.tabs[id(2)].deleted,{v:true,c:200,by:'b'});
  const reopened=adapter.diffWindow(removed.nextBaseline,capture(),300,'b',ids());
  assert.equal(reopened.tabIds[1],id(10));assert.equal(reopened.nextBaseline.tabs[id(2)].deleted.v,true);
});
test('protected navigation is accepted without advancing the displayed baseline or echoing it',()=>{
  const b=baseline(),remote=structuredClone(b);remote.tabs[id(1)].nav=f({url:'https://remote.test/',title:'Remote'},300);
  const plan=adapter.planApply(b,remote,new Set([id(1)]));
  assert.equal(plan.apply.length,0);assert.equal(plan.accept.length,1);
  assert.deepEqual(plan.nextBaseline.tabs[id(1)].nav,b.tabs[id(1)].nav);
  assert.deepEqual(adapter.diffWindow(plan.nextBaseline,capture(),400,'b',ids()).edits,{});
});
test('a deferred remote close cannot make an unrelated local close publish any other field',()=>{
  const b=baseline(),remote=structuredClone(b);remote.tabs[id(1)].deleted=f(true,300);
  const plan=adapter.planApply(b,remote,new Set([id(1)])),c=capture();c.urls.pop();c.meta.pop();c.tabIds.pop();
  const diff=adapter.diffWindow(plan.nextBaseline,c,400,'b',ids());
  assert.deepEqual(Object.keys(diff.edits.tabs),[id(2)]);assert.equal(diff.edits.tabs[id(2)].deleted.v,true);
});
test('a local edit of an accepted field uses a clock above the deferred target',()=>{
  const b=baseline(),remote=structuredClone(b);remote.tabs[id(1)].nav=f({url:'https://remote.test/',title:'Remote'},500);
  const plan=adapter.planApply(b,remote,new Set([id(1)])),c=capture();c.urls[0]='https://local.test/';c.accepted=plan.accept;
  const diff=adapter.diffWindow(plan.nextBaseline,c,200,'b',ids());
  assert.equal(diff.edits.tabs[id(1)].nav.c,501);
  assert.equal(adapter.planApply(diff.nextBaseline,remote,new Set([id(1)])).accept.length,0);
});
test('quiet navigation and metadata apply once and the resulting capture produces no echo',()=>{
  const b=baseline(),remote=structuredClone(b);remote.tabs[id(2)].nav=f({url:'https://remote.test/',title:'Remote'},300);remote.tabs[id(2)].pinned=f(true,301);
  const plan=adapter.planApply(b,remote,new Set([id(1)]));assert.equal(plan.apply.length,2);assert.equal(plan.accept.length,0);
  const c=capture();c.urls[1]='https://remote.test/';c.meta[1].title='Remote';c.pinned[1]=true;
  assert.deepEqual(adapter.diffWindow(plan.nextBaseline,c,400,'b',ids()).edits,{});
});
test('applied group deletion ungroups members without echoing a groupId write',()=>{
  const b=baseline();b.groups[id(9)]={name:f('G'),color:f(null),collapsed:f(false),pos:f(model.keyFor('','',id(9))),deleted:f(false)};b.tabs[id(1)].groupId=f(id(9));
  const remote=structuredClone(b);remote.groups[id(9)].deleted=f(true,300);
  const plan=adapter.planApply(b,remote,new Set());assert.ok(plan.apply.some(x=>x.op==='delete-group'));
  assert.deepEqual(adapter.diffWindow(plan.nextBaseline,capture(),400,'b',ids()).edits,{});
});
test('duplicate tab bindings create distinct records and unsupported URLs never enter records',()=>{
  const c=capture();c.tabIds=[id(1),id(1)];c.urls.push('file:///private');c.meta.push({title:'Private'});
  const diff=adapter.diffWindow(baseline(),c,200,'b',ids());
  assert.equal(diff.tabIds[1],id(10));assert.equal(diff.tabIds[2],null);
  assert.equal(Object.values(diff.nextBaseline.tabs).some(t=>t.nav.v.url.startsWith('file:')),false);
});
test('internal and local navigation retain the last shareable page without publishing a delete',()=>{
  for(const url of ['blanc://settings/','file:///Users/me/private.html']) {
    const c=capture();c.urls[0]=url;c.meta[0].title='Local only';
    const diff=adapter.diffWindow(baseline(),c,200,'b',ids());
    assert.equal(diff.tabIds[0],id(1));
    assert.equal(diff.edits.tabs?.[id(1)],undefined);
    assert.equal(diff.nextBaseline.tabs[id(1)].deleted.v,false);
    assert.deepEqual(diff.nextBaseline.tabs[id(1)].nav.v,{url:'https://one.test/',title:'One'});
  }
});
test('reordering keeps every position valid and strictly ordered',()=>{
  const c=capture();c.urls.reverse();c.meta.reverse();c.tabIds.reverse();c.activeIndex=1;
  const diff=adapter.diffWindow(baseline(),c,200,'b',ids()),a=diff.nextBaseline.tabs[id(2)],b=diff.nextBaseline.tabs[id(1)];
  assert.ok(a.pos.v<b.pos.v);assert.ok(model.validKey(a.pos.v,id(2)));assert.ok(model.validKey(b.pos.v,id(1)));
});
