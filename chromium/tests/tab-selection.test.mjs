import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {matchStep} from './steps.mjs';
import {tabs} from './adapters/tabs.mjs';

const context = vm.createContext({});
for (const file of ['selection-tab-sections.js', 'tab-selection.js'])
 vm.runInContext(fs.readFileSync(new URL('../blanc/island/' + file, import.meta.url), 'utf8'), context);
const selection = context.BlancTabSelection;
const plain = value => JSON.parse(JSON.stringify(value));
const list = [
 {id:'a',groupId:null}, {id:'b',groupId:'hidden'},
 {id:'c',groupId:'open',splitId:'split'}, {id:'d',groupId:'open',splitId:'split'},
 {id:'e',groupId:null},
];
const groups = [{id:'hidden',collapsed:true},{id:'open',collapsed:false}];

test('toggle includes the active split and ranges skip collapsed rows', () => {
 let state = selection.selectTabs(selection.emptySelection(), list, groups, 'd', 'a', 'toggle');
 assert.deepEqual(plain(state.selectedTabIds), ['a','c','d']);
 state = selection.selectTabs(state, list, groups, 'd', 'e', 'range');
 assert.deepEqual(plain(state.selectedTabIds), ['a','c','d','e']);
 assert.equal(state.focusId, 'e');
 state = selection.selectTabs(state, list, groups, 'd', 'e', 'extend-up');
 assert.deepEqual(plain(state.selectedTabIds), ['a','c','d']);
 assert.equal(state.focusId, 'c');
});
test('closing prunes ids, while split formation or dissolution clears selection', () => {
 const state = selection.selectTabs(selection.emptySelection(), list, groups, 'e', 'c', 'toggle');
 assert.deepEqual(plain(selection.pruneSelection(state, list.slice(0,4)).selectedTabIds), ['c','d']);
 assert.deepEqual(plain(selection.pruneSelection(state, list.map(t=>({...t,splitId:null}))).selectedTabIds), []);
});
test('shipping selection steps are loaded from the pinned reference', () => {
 for (const text of ['three pages for multi-tab selection', 'the selection is empty', 'I run the batch action "pin"'])
  assert.equal(matchStep(text).definition.shippingSource, 'test/desktop/steps/tab-selection.steps.js');
});
test('selection hooks read host-owned state and send selection intents', async () => {
 const calls = [];
 const world = {api:async(method,args)=>{calls.push([method,args]);return {selectedTabIds:['a','b']};}};
 await tabs.selectTabRows(world,'a','toggle');
 assert.deepEqual(await tabs.selectedTabIds(world), ['a','b']);
 assert.deepEqual(calls, [['selectTab',['a','toggle']],['getAllTabs',undefined]]);
});

const hostSource = fs.readFileSync(new URL('../blanc/island/host.js', import.meta.url), 'utf8');
function actionHost(request) {
 const ctx = vm.createContext({});
 for (const file of ['selection-tab-sections.js','tab-selection.js'])
  vm.runInContext(fs.readFileSync(new URL('../blanc/island/'+file,import.meta.url),'utf8'),ctx);
 ctx.snapshot = {tabs:['a','b','c'].map(id=>({id,url:'https://example.test/'+id})),selectedTabIds:['a','b','c']};
 ctx.tabSelection = {selectedTabIds:['a','b','c'],selectionAnchorId:'a'};
 ctx.selectionRevision = 0;
 ctx.calls=[];ctx.notices=[];ctx.announcements=[];
 ctx.refresh=async()=>{};
 ctx.nativeId=id=>id;
 ctx.request=async(method,args)=>{ctx.calls.push([method,args]);return request(method,args,ctx);};
 ctx.typed=ctx.request;
 ctx.notice=message=>ctx.notices.push(message);
 ctx.glanceSay=(...args)=>ctx.announcements.push(args);
 ctx.clearSelection=()=>{ctx.selectionRevision++;ctx.tabSelection={selectedTabIds:[]};};
 ctx.selectionTabs=()=>ctx.snapshot.tabs;
 ctx.emit=()=>{};
 const retainStart=hostSource.indexOf('  function retainSelection(');
 vm.runInContext(hostSource.slice(retainStart,hostSource.indexOf('  let serialized',retainStart)),ctx);
 const start=hostSource.indexOf('    runSelectedTabsAction:');
 ctx.action=vm.runInContext('({'+hostSource.slice(start,hostSource.indexOf('    keepGlanceAsSplit:',start))+'}).runSelectedTabsAction',ctx);
 return ctx;
}
test('batch mutations submit the complete ordered set in one native request', async () => {
 const ctx=actionHost(()=>true);
 assert.equal(await ctx.action('batch-pin'),true);
 assert.deepEqual(plain(ctx.calls),[['batchTabsAction',[['a','b','c'],'pin',null]]]);
 assert.deepEqual(plain(ctx.tabSelection.selectedTabIds),[]);
});
test('quiet refusals stay selected and report an accurate count', async () => {
 const ctx=actionHost((method,args)=>args[0]!=='c');
 assert.equal(await ctx.action('batch-quiet'),false);
 assert.deepEqual(plain(ctx.tabSelection.selectedTabIds),['c']);
 assert.deepEqual(plain(ctx.announcements),[['tabsSelection.quieted',{count:2,total:3}]]);
});
test('an asynchronous batch does not overwrite a newer selection', async () => {
 const ctx=actionHost((method,args,ctx)=>{
  if(args[0]==='b'){ctx.selectionRevision++;ctx.tabSelection={selectedTabIds:['b'],selectionAnchorId:'b'};}
  return true;
 });
 await ctx.action('batch-quiet');
 assert.deepEqual(plain(ctx.tabSelection.selectedTabIds),['b']);
});
test('failed native mutations preserve selection and unsupported actions stay undefined', async () => {
 const ctx=actionHost(()=>false);
 assert.equal(await ctx.action('batch-mute'),false);
 assert.deepEqual(plain(ctx.tabSelection.selectedTabIds),['a','b','c']);
 const {UndefinedNativeAdapterError}=await import('./lib/adapters.mjs');
 assert.throws(()=>tabs.runSelectedTabsAction({},'batch-close'),UndefinedNativeAdapterError);
});
test('a partial Space move retains only source members and names the failure', async () => {
 const ctx=actionHost((method,args,ctx)=>{
  assert.equal(method,'spaceMoveTabs');
  ctx.snapshot.tabs=ctx.snapshot.tabs.slice(1);
  return {ok:false,error:'moved-partly',movedCount:1};
 });
 ctx.spaceList=async()=>({meta:{items:{reading:{name:'Reading'}},deleted:[]}});
 ctx.announceSpaces=async()=>{};
 ctx.shown=[];ctx.show=(...args)=>ctx.shown.push(args);
 const start=hostSource.indexOf('  async function moveTabsToSpace(');
 vm.runInContext(hostSource.slice(start,hostSource.indexOf('  async function createSpaceWithTabs(',start)),ctx);
 const result=await ctx.moveTabsToSpace(['a','b','c'],'reading');
 assert.equal(result.movedCount,1);
 assert.deepEqual(plain(ctx.tabSelection.selectedTabIds),['b','c']);
 assert.deepEqual(plain(ctx.shown[0][3]),{spaceMoveError:{name:'Reading',error:'moved-partly',movedCount:1}});
});
test('the split fixture preserves the active page as shipping makeSplit does', async () => {
 const calls=[];
 const world={state:async()=>({activeTabId:'c',splits:[{id:'s',tabIds:['a','b']}]}),api:async(...args)=>calls.push(args)};
 assert.equal(await tabs.makeSplit(world,'a',['b']),'s');
 assert.deepEqual(calls,[['createSplit',['a','b']],['switchTab',['c']]]);
});
test('every tab-selection Gherkin step resolves without starting a browser', () => {
 const feature=fs.readFileSync(new URL('../../spec/acceptance/F41-named-workspaces.feature',import.meta.url),'utf8');
 const section=feature.slice(feature.indexOf('  @F41-58'),feature.indexOf('  @F41-75'));
 const steps=section.split('\n').map(line=>/^\s*(?:Given|When|Then|And) (.+)$/.exec(line)?.[1]).filter(Boolean);
 assert.ok(steps.length>80);
 for(const step of steps)assert.ok(matchStep(step),'missing: '+step);
});
function newSpaceHost(result) {
 const ctx=actionHost(()=>result);
 ctx.spaceList=async()=>({meta:{items:{one:{name:'One'}},order:['one'],deleted:[]}});
 ctx.checkSpaceName=(list,name)=>({name:name.trim()});
 ctx.SPACE_LIMIT=25;ctx.crypto={randomUUID:()=> 'new-space'};
 ctx.spaceIdentity=()=>({color:'#426c4c',symbol:'briefcase'});
 ctx.spacesPayload=async()=>({items:[]});
 ctx.writes=[];ctx.writeSpaces=async list=>ctx.writes.push(plain(list));
 ctx.spaceResult=async details=>({ok:true,...details});
 // createSpaceWithTabs reads the real editor's remembered overlay purpose
 // (F41-78); the extracted slice below needs them as free variables too.
 ctx.overlayMode='spaces';ctx.overlayPurpose=null;
 const start=hostSource.indexOf('  async function createSpaceWithTabs(');
 vm.runInContext(hostSource.slice(start,hostSource.indexOf('  // Floating Glance',start)),ctx);
 return ctx;
}
test('New Space from the group menu threads the remembered group id (F41-78)',async()=>{
 const ctx=newSpaceHost({ok:true,movedCount:2,saved:true,tabCount:2});
 ctx.overlayPurpose={newSpaceTabIds:['a','b'],newSpaceGroupId:'native-group',newSpaceGroupName:'Research'};
 await ctx.createSpaceWithTabs('Reading',{},['a','b']);
 assert.deepEqual(plain(ctx.calls),[['spaceMoveTabs',[['a','b'],'new-space',true,'native-group']]]);
});
test('New Space from a plain tab/selection never sends a group id',async()=>{
 const ctx=newSpaceHost({ok:true,movedCount:3,saved:true,tabCount:3});
 ctx.overlayPurpose={newSpaceTabIds:['a','b','c']};
 await ctx.createSpaceWithTabs('Reading',{},['a','b','c']);
 assert.deepEqual(plain(ctx.calls),[['spaceMoveTabs',[['a','b','c'],'new-space',true]]]);
});
test('New Space writes the complete bound selection and adds its list entry',async()=>{
 const ctx=newSpaceHost({ok:true,movedCount:3,saved:true,tabCount:3});
 const result=await ctx.createSpaceWithTabs('Reading',{},['a','b','c']);
 assert.equal(result.workspaceId,'new-space');
 assert.deepEqual(plain(ctx.calls),[['spaceMoveTabs',[['a','b','c'],'new-space',true]]]);
 assert.equal(ctx.writes[0].meta.items['new-space'].name,'Reading');
 assert.deepEqual(plain(ctx.tabSelection.selectedTabIds),[]);
});
test('New Space retains a failed draft; a saved partial move remains findable',async()=>{
 const failed=newSpaceHost({ok:false,error:'storage-failed',movedCount:0,saved:false});
 assert.equal((await failed.createSpaceWithTabs('Reading',{},['a','b','c'])).error,'storage-failed');
 assert.equal(failed.writes.length,0);
 assert.deepEqual(plain(failed.tabSelection.selectedTabIds),['a','b','c']);
 const partial=newSpaceHost({ok:false,error:'moved-partly',movedCount:1,saved:true,tabCount:1});
 partial.snapshot.tabs=partial.snapshot.tabs.slice(1);
 assert.equal((await partial.createSpaceWithTabs('Reading',{},['a','b','c'])).error,'saved-not-moved');
 assert.equal(partial.writes[0].meta.items['new-space'].name,'Reading');
 assert.deepEqual(plain(partial.tabSelection.selectedTabIds),['b','c']);
});

test('New Space maps native refusal and preparation failures to editor errors', async () => {
 for (const [error, expected] of [['refused','busy'],['prepare-failed','activation-failed']]) {
  const ctx=newSpaceHost({ok:false,error,saved:false});
  assert.equal((await ctx.createSpaceWithTabs('Reading',{},['a','b','c'])).error,expected);
  assert.equal(ctx.writes.length,0);
 }
});

test('menu actions refuse a pruned or replaced selection visibly',async()=>{
 for(const selected of [[],['a'],['a','b'],['b','c','d']]){
  const ctx=actionHost(()=>true);
  ctx.tabSelection.selectedTabIds=selected;
  assert.equal(await ctx.action('batch-pin',{selectedTabIds:['a','b','c']}),false);
  assert.equal(ctx.calls.length,0);
  assert.deepEqual(plain(ctx.announcements),[['tabsSelection.failed']]);
 }
});
test('New Group binds the menu ids even for a one-member selection',async()=>{
 const ctx=actionHost(()=>({canGroup:true}));
 ctx.tabSelection.selectedTabIds=['b'];ctx.show=async(...args)=>ctx.shown=args;
 assert.equal(await ctx.action('batch-group-new',{selectedTabIds:['b']}),true);
 assert.deepEqual(plain(ctx.shown[3]),{beginGroupTabIds:['b']});
});
test('context-menu provenance survives refresh but ends on a selection gesture',()=>{
 const state={...selection.selectionState(['c'],'c',list),contextMenu:true};
 assert.equal(selection.pruneSelection(state,list).contextMenu,true);
 assert.equal(selection.selectTabs(state,list,groups,'d','a','toggle').contextMenu,undefined);
});

test('New Space uses the persisted count for complete, partial, zero and failed-rewrite moves',async()=>{
 for(const result of [
  {ok:true,saved:true,movedCount:3,tabCount:3},
  {ok:false,saved:true,error:'moved-partly',movedCount:1,tabCount:1},
  {ok:false,saved:true,error:'move-failed',movedCount:0,tabCount:1},
  {ok:false,saved:true,recorded:false,error:'move-failed',movedCount:0,tabCount:3},
 ]){
  const ctx=newSpaceHost(result);await ctx.createSpaceWithTabs('Reading',{},['a','b','c']);
  assert.equal(ctx.writes[0].meta.items['new-space'].tabCount,result.tabCount);
 }
});
const nativeSource=fs.readFileSync(new URL('../blanc/browser/ui/blanc_prototype_ui.cc',import.meta.url),'utf8');
test('batch unpin keeps source order at the end, matching single-tab placement',()=>{
 // Execute the native loop with a strip double implementing Chromium's pinned boundary.
 const start=nativeSource.indexOf('        auto ordered = pages;');
 const end=nativeSource.indexOf('        reply',start);
 assert.ok(start>=0 && end>start);
 const loop=nativeSource.slice(start,end)
  .replace('auto ordered = pages;', 'const ordered = [...pages];')
  .replace('std::ranges::reverse(ordered)', 'ordered.reverse()')
  .replaceAll(/for \(auto\* page : (\w+)\)/g,'for (const page of $1)')
  .replaceAll('const int ', 'const ').replaceAll('const auto ', 'const ').replaceAll('->','.')
  .replaceAll('*split','split').replaceAll('std::nullopt','null')
  .replaceAll('static_cast<int>(range.start())','range.start()')
  .replaceAll('TabStripModel::CommandTogglePinned','"toggle"')
  .replaceAll('SiteMuteTab::Get(page)','page');
 const strip=['a','b','c','d'].map(id=>({id,pinned:id!=='d'}));
 const model={
  GetIndexOfWebContents:page=>strip.indexOf(page),
  IsTabPinned:at=>strip[at].pinned,
  GetSplitForTab:()=>null,GetTabGroupForTab:()=>null,count:()=>strip.length,
  SetTabPinned(at,value){
   const boundary=strip.filter(page=>page.pinned).length;
   const [page]=strip.splice(at,1);page.pinned=value;strip.splice(boundary-1,0,page);
  },
  MoveWebContentsAt(from,to){const [page]=strip.splice(from,1);strip.splice(to,0,page);},
 };
 vm.runInNewContext(loop,{pages:strip.slice(0,2),model,action:'pin',enable:false});
 assert.deepEqual(strip.map(page=>page.id),['c','d','a','b']);
 assert.deepEqual(strip.filter(page=>page.pinned).map(page=>page.id),['c']);
});
