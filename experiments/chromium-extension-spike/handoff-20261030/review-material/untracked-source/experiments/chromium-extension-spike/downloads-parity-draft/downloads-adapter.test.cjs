'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {createDownloadsAdapter,safeActions} = require('./downloads-adapter.cjs');
const row = overrides => ({id:'id-1',filename:'report.pdf',url:'https://example.test/report',state:'progressing',security:'safe',private:false,inFlight:true,canResume:false,receivedBytes:10,totalBytes:100,capabilities:['cancel'],...overrides});
test('preserves shipping action order while respecting native capabilities', () => {
  assert.deepEqual(safeActions(row({state:'completed',inFlight:false,capabilities:['show','open']})),['open','show']);
  assert.deepEqual(safeActions(row({state:'completed',inFlight:false,capabilities:['show']})),['show']);
  assert.deepEqual(safeActions(row({state:'interrupted',canResume:true,capabilities:['resume','cancel']})),['resume','cancel']);
  assert.deepEqual(safeActions(row({state:'interrupted',canResume:false,capabilities:['retry','cancel']})),['retry','cancel']);
});
test('does not offer commands for denied capabilities or non-web retry', () => {
  assert.deepEqual(safeActions(row({state:'completed',inFlight:false,capabilities:[]})),[]);
  assert.deepEqual(safeActions(row({state:'interrupted',url:'file:///private/report',capabilities:['retry']})),[]);
});
test('rejects malformed, unsafe numeric and unknown native data', async () => {
  for (const bad of [row({state:'dangerous'}),row({receivedBytes:NaN}),row({totalBytes:-1}),row({private:'false'}),row({capabilities:['keep']})]) assert.throws(() => safeActions(bad),TypeError);
  const api=createDownloadsAdapter(async () => [row(),row()]); await assert.rejects(api.list(),/Duplicate/);
});
test('dispatches only typed fixed commands and preserves native failures', async () => {
  const calls=[];const api=createDownloadsAdapter(async (method,args) => {calls.push([method,args]); if(method==='downloads.open')throw Error('denied');return true});
  await api.cancel('id-1'); await api.clearFinished(); await assert.rejects(api.open('id-1'),/denied/);
  await assert.rejects(api.retry(''),TypeError);
  assert.deepEqual(calls,[['downloads.cancel',['id-1']],['downloads.clearFinished',[]],['downloads.open',['id-1']]]);
});
test('does not expose target paths or additional native fields to the page', async () => {
  const api=createDownloadsAdapter(async () => [row({savePath:'/sensitive/file',unexpected:'ignored'})]);
  const [item]=await api.list();assert.equal(item.savePath,undefined);assert.equal(item.unexpected,undefined);assert.equal(Object.isFrozen(item),true);
});
test('redacts source credentials, paths, query and non-web URLs, rejects path filenames', async () => {
  const api=createDownloadsAdapter(async () => [
    row({url:'https://user:<redacted-email>/private?token=secret#fragment'}),
    row({id:'id-2',url:'file://<local-home>/private.txt'}),
    row({id:'id-3',url:'http:broken'})
  ]);
  const rows=await api.list();
  assert.equal(rows[0].url,'https://example.test');
  assert.equal(rows[1].url,'');assert.equal(rows[2].url,'');
  assert.throws(()=>safeActions(row({filename:'<local-home>/private.txt'})),TypeError);
  assert.throws(()=>safeActions(row({filename:'C:\\Users\\example\\private.txt'})),TypeError);
  assert.deepEqual(safeActions(row({state:'interrupted',url:'http:broken',capabilities:['retry']})),[]);
});
test('renderer clamps a native overrun to a valid progressbar range', async () => {
  const fs=require('node:fs'),vm=require('node:vm');
  class Element {
    constructor(tag){this.tag=tag;this.children=[];this.dataset={};this.attrs={};this.style={};this.className='';this.textContent='';}
    append(...items){this.children.push(...items)} replaceChildren(...items){this.children=[...items]}
    setAttribute(k,v){this.attrs[k]=v} addEventListener(){} contains(){return false} querySelectorAll(){return []}
  }
  const list=new Element('div'), clear=new Element('button');
  const doc={getElementById:id=>id==='list'?list:clear,createElement:tag=>new Element(tag),activeElement:null};
  const adapter=createDownloadsAdapter(async method=>method==='downloads.list'?[row({receivedBytes:150,totalBytes:100})]:true);
  const context={document:doc,window:{bowserPages:{downloads:adapter},blancDownloadsRow:require('./shipping/downloads-row-model.js')},blancI18n:{t:(key)=>key,formatLocale:()=> 'en-US'},Intl,setInterval:()=>0};
  vm.runInNewContext(fs.readFileSync(require.resolve('./downloads-renderer-candidate.js'),'utf8'),context);
  await new Promise(resolve=>setImmediate(resolve));
  const walk=node=>[node,...node.children.flatMap(walk)];const progress=walk(list).find(x=>x.attrs.role==='progressbar');
  assert.ok(progress);assert.equal(progress.attrs['aria-valuenow'],'100');assert.equal(progress.children[0].style.width,'100%');
});
test('rejects drive-relative and control-character names', () => {
  for(const filename of ['C:private.txt','a\u0000b','a\nb','x\u007fy']) assert.throws(()=>safeActions(row({filename})),TypeError);
});
test('renderer removes stale actions on refresh failure and recovers on a later success', async () => {
  const fs=require('node:fs'),vm=require('node:vm');
  class Element {
    constructor(tag){this.tag=tag;this.children=[];this.dataset={};this.attrs={};this.style={};this.className='';this.textContent='';this.disabled=false;}
    append(...items){this.children.push(...items)} replaceChildren(...items){this.children=[...items]}
    setAttribute(k,v){this.attrs[k]=v} addEventListener(){} contains(){return false} querySelectorAll(){return []} focus(){}
  }
  const list=new Element('div'),clear=new Element('button');let fail=false,poll;
  const doc={getElementById:id=>id==='list'?list:clear,createElement:tag=>new Element(tag),activeElement:null,hidden:false};
  const adapter=createDownloadsAdapter(async method=>{if(method==='downloads.list'){if(fail)throw Error('native unavailable');return [row()]};return true});
  const context={document:doc,window:{bowserPages:{downloads:adapter},blancDownloadsRow:require('./shipping/downloads-row-model.js')},blancI18n:{t:(key)=>key==='downloads.loadError'?'Unable to load downloads':key,formatLocale:()=> 'en-US'},Intl,setInterval:fn=>{poll=fn}};
  vm.runInNewContext(fs.readFileSync(require.resolve('./downloads-renderer-candidate.js'),'utf8'),context);
  const tick=()=>new Promise(resolve=>setImmediate(resolve));await tick();assert.equal(list.children[0].className,'row');
  fail=true;poll();await tick();assert.equal(list.children.length,1);assert.equal(list.children[0].attrs.role,'alert');assert.equal(clear.disabled,true);
  fail=false;poll();await tick();assert.equal(list.children[0].className,'row');assert.equal(clear.disabled,false);
});
test('slow polling renders and error recovery preserves keyboard focus', async () => {
  const fs=require('node:fs'),vm=require('node:vm');let doc,poll;
  class Element {
    constructor(tag){this.tag=tag;this.children=[];this.dataset={};this.attrs={};this.style={};this.className='';this.textContent='';this.disabled=false;this.listeners={};}
    append(...items){this.children.push(...items)} replaceChildren(...items){this.children=[...items]}
    setAttribute(k,v){this.attrs[k]=v} addEventListener(k,fn){this.listeners[k]=fn} contains(node){return this===node||this.children.some(c=>c.contains(node))}
    querySelectorAll(){const walk=e=>[e,...e.children.flatMap(walk)];return walk(this).filter(e=>e.dataset.actionKey)} focus(){doc.activeElement=this}
  }
  const list=new Element('div'),clear=new Element('button');doc={getElementById:id=>id==='list'?list:clear,createElement:tag=>new Element(tag),activeElement:null,hidden:false};
  const pending=[];let count=0;
  const adapter=createDownloadsAdapter(method=>method==='downloads.list'?new Promise((resolve,reject)=>{count++;pending.push({resolve,reject})}):Promise.resolve(true));
  const context={document:doc,window:{bowserPages:{downloads:adapter},blancDownloadsRow:require('./shipping/downloads-row-model.js')},blancI18n:{t:key=>key,formatLocale:()=> 'en-US'},Intl,setInterval:fn=>{poll=fn}};
  vm.runInNewContext(fs.readFileSync(require.resolve('./downloads-renderer-candidate.js'),'utf8'),context);
  const tick=()=>new Promise(resolve=>setImmediate(resolve));poll();poll();assert.equal(count,1);
  pending.shift().resolve([row()]);await tick();assert.equal(list.children[0].className,'row');assert.equal(count,1);
  const button=list.querySelectorAll()[0];assert.ok(button);button.focus();poll();assert.equal(count,2);pending.shift().reject(Error('unavailable'));await tick();
  assert.equal(list.children[0].attrs.role,'alert');assert.equal(doc.activeElement,list.children[0]);assert.equal(clear.disabled,true);
  poll();assert.equal(count,3);pending.shift().resolve([row()]);await tick();assert.equal(list.children[0].className,'row');assert.equal(doc.activeElement,clear);assert.equal(clear.disabled,false);
});
test('a deferred mutation invalidates pre-mutation results and refreshes afterward', async () => {
  const fs=require('node:fs'),vm=require('node:vm');let doc,poll,finishAction;
  class Element {
    constructor(tag){this.tag=tag;this.children=[];this.dataset={};this.attrs={};this.style={};this.className='';this.textContent='';this.disabled=false;this.listeners={};}
    append(...items){this.children.push(...items)} replaceChildren(...items){this.children=[...items]}
    setAttribute(k,v){this.attrs[k]=v} addEventListener(k,fn){this.listeners[k]=fn} contains(node){return this===node||this.children.some(c=>c.contains(node))}
    querySelectorAll(){const walk=e=>[e,...e.children.flatMap(walk)];return walk(this).filter(e=>e.dataset.actionKey)} focus(){doc.activeElement=this}
  }
  const list=new Element('div'),clear=new Element('button');doc={getElementById:id=>id==='list'?list:clear,createElement:tag=>new Element(tag),activeElement:null,hidden:false};
  const pending=[];let reads=0;
  const adapter=createDownloadsAdapter(method=>method==='downloads.list'?new Promise(resolve=>{reads++;pending.push(resolve)}):new Promise(resolve=>{finishAction=resolve}));
  const context={document:doc,window:{bowserPages:{downloads:adapter},blancDownloadsRow:require('./shipping/downloads-row-model.js')},blancI18n:{t:key=>key,formatLocale:()=> 'en-US'},Intl,setInterval:fn=>{poll=fn}};
  vm.runInNewContext(fs.readFileSync(require.resolve('./downloads-renderer-candidate.js'),'utf8'),context);
  const tick=()=>new Promise(resolve=>setImmediate(resolve));pending.shift()([row()]);await tick();
  const button=list.querySelectorAll()[0];button.focus();poll();assert.equal(reads,2);
  const action=button.listeners.click();assert.equal(list.children[0].attrs.role,'status');assert.equal(clear.disabled,true);
  poll();assert.equal(reads,2);pending.shift()([row({filename:'old.txt'})]);await tick();assert.equal(list.children[0].attrs.role,'status');
  finishAction(true);await tick();assert.equal(reads,3);pending.shift()([]);await action;assert.equal(list.children[0].textContent,'downloads.empty');assert.equal(doc.activeElement,clear);
});
test('unresponsive list and command time out and false is not success', async () => {
  const stalled=createDownloadsAdapter(()=>new Promise(()=>{}),{timeoutMs:5});
  await assert.rejects(stalled.list(),/not confirmed/);
  await assert.rejects(stalled.cancel('id-1'),/not confirmed/);
  const denied=createDownloadsAdapter(async()=>false,{timeoutMs:5});
  await assert.rejects(denied.clearFinished(),/not confirmed/);
  assert.throws(()=>createDownloadsAdapter(()=>true,{timeoutMs:0}),TypeError);
});
test('timed-out mutation remains unconfirmed through polls and late completion', async () => {
  const fs=require('node:fs'),vm=require('node:vm');let doc,poll,finishAction;
  class Element {
    constructor(tag){this.tag=tag;this.children=[];this.dataset={};this.attrs={};this.style={};this.className='';this.textContent='';this.disabled=false;this.listeners={};}
    append(...items){this.children.push(...items)} replaceChildren(...items){this.children=[...items]}
    setAttribute(k,v){this.attrs[k]=v} addEventListener(k,fn){this.listeners[k]=fn} contains(node){return this===node||this.children.some(c=>c.contains(node))}
    querySelectorAll(){const walk=e=>[e,...e.children.flatMap(walk)];return walk(this).filter(e=>e.dataset.actionKey)} focus(){doc.activeElement=this}
  }
  const list=new Element('div'),clear=new Element('button');doc={getElementById:id=>id==='list'?list:clear,createElement:tag=>new Element(tag),activeElement:null,hidden:false};
  let reads=0;const adapter=createDownloadsAdapter(method=>method==='downloads.list'?(reads++,Promise.resolve([row()])):new Promise(resolve=>{finishAction=resolve}),{timeoutMs:5});
  const context={document:doc,window:{bowserPages:{downloads:adapter},blancDownloadsRow:require('./shipping/downloads-row-model.js')},blancI18n:{t:key=>key,formatLocale:()=> 'en-US'},Intl,setInterval:fn=>{poll=fn}};
  vm.runInNewContext(fs.readFileSync(require.resolve('./downloads-renderer-candidate.js'),'utf8'),context);
  const tick=()=>new Promise(resolve=>setImmediate(resolve));await tick();const button=list.querySelectorAll()[0];button.focus();await button.listeners.click();
  assert.equal(list.children[0].textContent,'downloads.actionUnconfirmed');assert.equal(clear.disabled,true);
  poll();poll();await tick();assert.equal(reads,1);assert.equal(list.children[0].attrs.role,'alert');
  finishAction(true);await tick();poll();await tick();assert.equal(reads,1);assert.equal(list.children[0].textContent,'downloads.actionUnconfirmed');
});
test('unknown or review-required state blocks unsafe actions but can allow native-authorized cancel', () => {
  for(const security of ['unknown','needs-review']) assert.deepEqual(safeActions(row({state:'completed',inFlight:false,security,capabilities:['open','show']})),[]);
  assert.deepEqual(safeActions(row({security:'needs-review',capabilities:['cancel','open']})),['cancel']);
  assert.deepEqual(safeActions(row({security:'unknown',capabilities:[]})),[]);
  assert.deepEqual(safeActions(row({security:'unknown',inFlight:false,capabilities:['cancel']})),[]);
  assert.throws(()=>safeActions(row({security:'future-unknown'})),TypeError);
});
test('renderer presents an accessible security status and no actions for unknown state', async () => {
  const fs=require('node:fs'),vm=require('node:vm');
  class Element {
    constructor(tag){this.tag=tag;this.children=[];this.dataset={};this.attrs={};this.style={};this.className='';this.textContent='';}
    append(...items){this.children.push(...items)} replaceChildren(...items){this.children=[...items]}
    setAttribute(k,v){this.attrs[k]=v} addEventListener(){} contains(){return false} querySelectorAll(){return []} focus(){}
  }
  const list=new Element('div'),clear=new Element('button');const doc={getElementById:id=>id==='list'?list:clear,createElement:tag=>new Element(tag),activeElement:null};
  const adapter=createDownloadsAdapter(async method=>method==='downloads.list'?[row({state:'completed',inFlight:false,security:'unknown',capabilities:['open','show']})]:true);
  const context={document:doc,window:{bowserPages:{downloads:adapter},blancDownloadsRow:require('./shipping/downloads-row-model.js')},blancI18n:{t:key=>key,formatLocale:()=> 'en-US'},Intl,setInterval:()=>0};
  vm.runInNewContext(fs.readFileSync(require.resolve('./downloads-renderer-candidate.js'),'utf8'),context);
  await new Promise(resolve=>setImmediate(resolve));const walk=n=>[n,...n.children.flatMap(walk)];const nodes=walk(list);
  assert.ok(nodes.some(n=>n.attrs.role==='status'&&n.textContent==='downloads.securityUnknown'));
  assert.equal(nodes.filter(n=>n.tag==='button').length,0);
});
test('renderer distinguishes a review warning from an unavailable security status', async () => {
  const fs=require('node:fs'),vm=require('node:vm');
  class Element {constructor(tag){this.tag=tag;this.children=[];this.dataset={};this.attrs={};this.style={};this.textContent='';}append(...items){this.children.push(...items)}replaceChildren(...items){this.children=[...items]}setAttribute(k,v){this.attrs[k]=v}addEventListener(){}contains(){return false}querySelectorAll(){return []}focus(){}}
  const list=new Element('div'),clear=new Element('button');const doc={getElementById:id=>id==='list'?list:clear,createElement:tag=>new Element(tag),activeElement:null};
  const adapter=createDownloadsAdapter(async method=>method==='downloads.list'?[row({security:'needs-review',capabilities:['cancel']})]:true);
  const context={document:doc,window:{bowserPages:{downloads:adapter},blancDownloadsRow:require('./shipping/downloads-row-model.js')},blancI18n:{t:key=>key,formatLocale:()=> 'en-US'},Intl,setInterval:()=>0};
  vm.runInNewContext(fs.readFileSync(require.resolve('./downloads-renderer-candidate.js'),'utf8'),context);await new Promise(resolve=>setImmediate(resolve));
  const walk=n=>[n,...n.children.flatMap(walk)],nodes=walk(list);assert.ok(nodes.some(n=>n.attrs.role==='status'&&n.textContent==='downloads.securityReview'));
  assert.equal(nodes.filter(n=>n.tag==='button').length,1);
});
