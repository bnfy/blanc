'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'host-candidate.js'),'utf8');
const pick=(start,end)=>{const a=source.indexOf(start),b=source.indexOf(end,a);assert(a>=0&&b>a,'source section unavailable');return source.slice(a,b)};
const noticeCode=pick('  const snapshotTimeoutMarker', '  function subscribe(');
const requestCode=pick('  function request(method, args = []) {','  function paintHeader()');
const refreshCode=pick('  function refresh() {','  // Shipping chrome-layout.js:');
function harness(){
 const status={textContent:'',hidden:true},sent=[],timers=new Map();let timerId=0,onEmit=null;
 const context={console:{warn(){}},document:{getElementById(id){assert.equal(id,'status');return status}},strip:{contentDocument:null,contentWindow:null},chrome:{send(name,args){sent.push({name,args})}},setTimeout(fn){const id=++timerId;timers.set(id,fn);return id},clearTimeout(id){timers.delete(id)},BlancTabSelection:{pruneSelection(){return {selectedTabIds:[]}}},BlancShieldModel:{},paintHeader(){},paintSplitHeaders(){},reportGeometry(){},selectionTabs(){return []},currentSplitLayout(){return null},emit(...args){if(onEmit)onEmit(...args)},JSON,Symbol,Promise,Error,Map,Set,String};
 context.window=context;vm.createContext(context);
 vm.runInContext(`let nextId=0,snapshot=null,tabSelection={},serialized='',refreshQueue=Promise.resolve(),closedBefore=null,blockerRecoveryShown=false;const pending=new Map();\n${noticeCode}\n${requestCode}\n${refreshCode}\nwindow.__fixture={notice,request,refresh,pending};`,context);
 return {status,sent,timers,api:context.__fixture,reply:context.blancPrototypeReply,fire(id){const fn=timers.get(id);assert(fn);timers.delete(id);fn()},setEmit(fn){onEmit=fn}};
}
const snapshot={tabs:[],splits:[],activeTabId:null,adblockEnabled:false,blockerHealth:'ready'};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function begin(h){const p=h.api.refresh();await tick();const sent=h.sent.at(-1);assert.equal(sent.args[1],'snapshot');return {p,id:sent.args[0],timer:[...h.timers.keys()].at(-1)}}
async function timeout(h){const a=await begin(h);h.fire(a.timer);await a.p;assert.equal(h.status.textContent,'Native bridge timed out: snapshot');assert.equal(h.status.hidden,false);return a}
async function success(h){const x=await begin(h);h.reply(x.id,true,structuredClone(snapshot));await x.p;return x}
test('newer fully processed snapshot clears its own older timeout',async()=>{const h=harness();await timeout(h);await success(h);assert.equal(h.status.hidden,true);assert.equal(h.status.textContent,'')});
test('newer unrelated notice, including identical text, survives a subsequent snapshot',async()=>{for(const message of ['Blocking unavailable','Native bridge timed out: snapshot']){const h=harness();await timeout(h);const b=await begin(h);h.api.notice(message);h.reply(b.id,true,structuredClone(snapshot));await b.p;assert.equal(h.status.hidden,false);assert.equal(h.status.textContent,message)}});
test('subscriber error during processing takes precedence',async()=>{const h=harness();await timeout(h);h.setEmit(()=>h.api.notice('new render error'));await success(h);assert.equal(h.status.textContent,'new render error');assert.equal(h.status.hidden,false)});
test('unsettled snapshot prevents clearing and later success may retire old timeout',async()=>{const h=harness();await timeout(h);const b=await begin(h);const other=h.api.request('snapshot').catch(()=>{});const latest=h.sent.at(-1),otherTimer=[...h.timers.keys()].at(-1);h.reply(b.id,true,structuredClone(snapshot));await b.p;assert.equal(h.status.hidden,false);assert.equal(h.status.textContent,'Native bridge timed out: snapshot');h.fire(otherTimer);await other;assert(!h.api.pending.has(latest.args[0]));await success(h);assert.equal(h.status.hidden,true)});
test('failed or malformed snapshot does not clear and later success preserves that newer error',async()=>{const h=harness();await timeout(h);const b=await begin(h);h.reply(b.id,false,'snapshot rejected');await b.p;assert.equal(h.status.textContent,'snapshot rejected');await success(h);assert.equal(h.status.textContent,'snapshot rejected');assert.equal(h.status.hidden,false);const j=harness();await timeout(j);const c=await begin(j);j.reply(c.id,true,{tabs:null});await c.p;assert.equal(j.status.hidden,false);assert.notEqual(j.status.textContent,'');await success(j);assert.equal(j.status.hidden,false)});
test('externally replaced notice is not cleared even without a new notice call',async()=>{const h=harness();await timeout(h);h.status.textContent='new message';await success(h);assert.equal(h.status.textContent,'new message');assert.equal(h.status.hidden,false)});
