'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const sourceText=fs.readFileSync(require.resolve('../../src/main/main.js'),'utf8');
const callback=sourceText.slice(sourceText.indexOf('  recoverNative:(sid,recovery,records)=>{'),sourceText.indexOf('\n  changed:()=>broadcastWorkspacesUpdated(),')).trim().replace(/,$/,'');
function harness({existing=true,snapshot=false}={}) {
 const id='a'.repeat(32),source={profileId:'default',workspaceId:'shared',tabOrder:['original']},target={profileId:'default',workspaceId:'recovery',tabOrder:['copy'],activeTabId:'copy'};
 const record={nav:{v:{url:'https://original.test/',title:'Original'}},name:{v:null},pinned:{v:false},groupId:{v:null}};
 const original={id:'original',sharedTabId:id,view:{form:'source edits'}},duplicate={id:'copy',sharedTabId:id,url:record.nav.v.url,title:record.nav.v.title,asleep:true,...(existing&&!snapshot?{view:{form:'recovery edits'}}:{})};
 const tabs=new Map([['original',original],['copy',duplicate]]),runtimes=existing?[source,target]:[source],closed=[],saved=[];
 let current,fail=false;
 const sandbox={isRecoveryPlaceholder:require('../../src/main/shared-spaces-sharing').isRecoveryPlaceholder,sessionPersistenceSuspended:false,DEFAULT_PROFILE_ID:'default',tabs,sleepSnapshots:new Map(snapshot?[['copy',{entries:['saved form']}]]:[]),windowRuntimes:{all:()=>runtimes},
  namedWorkspaces:{get:id=>id==='shared'?{sharedId:'sid'}:{},saveCapture:(id,capture)=>{saved.push({id,capture});return {ok:!fail};},flushPending:()=>({ok:!fail})},
  withWindowRuntime:(runtime,fn)=>{const previous=current;current=runtime;try{return fn();}finally{current=previous;}},
  makeResidentRuntime:()=>{runtimes.push(target);return target;},applyWorkspaceToWindow:()=>{},
  closeTab:id=>{closed.push(id);current.tabOrder=current.tabOrder.filter(key=>key!==id);tabs.delete(id);},
  detachTabForMove:(runtime,id)=>{assert.equal(runtime.workspaceTransition,true);assert.equal(sandbox.sessionPersistenceSuspended,true);runtime.tabOrder=runtime.tabOrder.filter(key=>key!==id);},rehomeTab:()=>{},
  createTab:()=>{source.tabOrder.push('blank');return 'blank';},NEW_TAB_URL:'blanc://newtab',
  workspaceCapture:runtime=>({ids:[...runtime.tabOrder]}),flushWorkspaceSession:()=>({ok:!fail})};
 vm.runInNewContext('this.recover={'+callback+'}.recoverNative;',sandbox);
 return {run:()=>sandbox.recover('sid',{id:'recovery'},{tabs:{[id]:record}}),source,target,tabs,original,duplicate,closed,saved,setFail:value=>{fail=value;}};
}
test('recovery retry preserves an existing live recovery copy and the incoming native page',()=>{
 const h=harness();h.run();assert.deepEqual(h.closed,[]);assert.equal(h.tabs.get('copy'),h.duplicate);assert.equal(h.tabs.get('original'),h.original);
 assert.ok(h.target.tabOrder.includes('original'));assert.equal(h.original.sharedTabId,undefined,'preserved extra page is local, not another copy of the retired record');
 h.run();assert.equal(h.target.tabOrder.length,2,'retry transfers nothing twice');assert.ok(h.saved.some(row=>row.id==='shared'));
});
test('recovery retry preserves an existing quiet copy with a snapshot',()=>{
 const h=harness({snapshot:true});h.run();assert.deepEqual(h.closed,[]);assert.equal(h.target.tabOrder.length,2);
});
test('initial recovery replaces only its newly created placeholder with the native page',()=>{
 const h=harness({existing:false});h.run();assert.deepEqual(h.closed,['copy']);assert.deepEqual(h.target.tabOrder,['original']);assert.ok(h.original.sharedTabId);
});

test('failed recovery checkpoints retry persistence without transferring or discarding pages again',()=>{
 const h=harness();h.setFail(true);assert.throws(()=>h.run(),/save-failed/);
 assert.equal(h.source.sharedRecoveryPending,true);assert.equal(h.target.tabOrder.length,2);
 h.setFail(false);h.run();assert.equal(h.source.sharedRecoveryPending,false);
 assert.equal(h.target.tabOrder.length,2);assert.deepEqual(h.closed,[]);
});

test('an unvisited unchanged recovery copy is replaced without making a duplicate',()=>{
 const h=harness();delete h.duplicate.view;h.run();assert.deepEqual(h.closed,['copy']);assert.deepEqual(h.target.tabOrder,['original']);
});
test('a quiet recovery copy with local navigation or metadata edits is preserved',()=>{
 for(const patch of [{url:'https://edited.test/'},{customTitle:'My name'},{pinned:true},{groupId:'local-group'},{muted:true},{splitId:'split'},{sleeping:true},{waking:true},{isLoading:true}]) {
  const h=harness();delete h.duplicate.view;Object.assign(h.duplicate,patch);h.run();assert.deepEqual(h.closed,[]);assert.equal(h.target.tabOrder.length,2);
 }
});
