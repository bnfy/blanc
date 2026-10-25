'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { encrypt } = require('../../src/main/sync-crypto');
let m = {};
try { m = require('../../src/main/shared-spaces-model'); } catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; }
const id = n => n.toString(16).padStart(32, '0');
const f = (v, c = 100, by = 'a') => ({ v, c, by });
const tab = (n = 1, overrides = {}) => ({ nav: f({ url: 'https://example.com/', title: 'Example' }), name: f(null), pinned: f(false), groupId: f(null), pos: f('i' + id(n).split('').map(h => '123456789abcdefg'[parseInt(h,16)]).join('')), deleted: f(false), ...overrides });
const blob = tabs => ({ v: 1, spaceId: id(99), groups: {}, tabs });
const seal = text => encrypt(Buffer.alloc(32), text);

test('shared Spaces merge keeps independent edits and final deletion', () => {
  assert.equal(typeof m.mergeBlob, 'function');
  const a = blob({ [id(1)]: tab(1, { pinned: f(true, 200, 'a') }) });
  const b = blob({ [id(1)]: tab(1, { nav: f({ url: 'https://other.test/', title: 'Other' }, 201, 'b') }) });
  const out = m.mergeBlob(a,b);
  assert.equal(out.tabs[id(1)].pinned.v, true);
  assert.equal(out.tabs[id(1)].nav.v.url, 'https://other.test/');
  assert.deepEqual(m.mergeField(f(false,999),f(true,1),'deleted'),f(true,1));
  assert.deepEqual(m.mergeField(f('z',100,'a'),f('a',100,'a'),'name'),f('a',100,'a'));
});

test('shared Spaces merge is commutative associative idempotent without mutation', () => {
  const xs = Array.from({length:40},(_,i)=>blob({[id(i%5+1)]:tab(i%5+1,{pinned:f(!!(i%2),100+i,'d'+i%3),deleted:f(i%7===0,10+i,'d'+i%3)})}));
  const saved=JSON.stringify(xs);
  for(let i=0;i<xs.length-2;i++) {
    const [a,b,c]=xs.slice(i,i+3);
    assert.deepEqual(m.mergeBlob(a,b),m.mergeBlob(b,a));
    assert.deepEqual(m.mergeBlob(m.mergeBlob(a,b),c),m.mergeBlob(a,m.mergeBlob(b,c)));
    assert.deepEqual(m.mergeBlob(a,a),a);
  }
  assert.equal(JSON.stringify(xs),saved);
});

test('mid handles prefix boundaries and generated intervals', () => {
  const cases=[['a1','a11','a10i'],['a1','a2','a1i'],['a1z','a2','a1zi'],['','1','0i'],['','a1','5'],['ab','','n'],['a','a0i','a09'],['i','i1','i0i'],['zz','','zzi']];
  for(const [a,b,want] of cases) assert.equal(m.mid(a,b),want);
  assert.throws(()=>m.mid('a','a'));
  assert.throws(()=>m.mid('b','a'));
  let seed=123456789; const rand=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  const key=()=>Array.from({length:1+Math.floor(rand()*12)},()=> '0123456789abcdefghijklmnopqrstuvwxyz'[Math.floor(rand()*36)]).join('')+'1';
  for(let i=0;i<200000;i++) { let a=key(),b=key(); if(a===b)continue; if(a>b)[a,b]=[b,a]; const p=m.mid(a,b); assert.ok(a<p&&p<b); assert.match(p,/^[0-9a-z]*[1-9a-z]$/); }
});

test('full record tags keep concurrent positions unique and insertable', () => {
  const a=m.keyFor('','',id(1)),b=m.keyFor('','',id(2));
  assert.notEqual(a,b); assert.ok(m.validKey(a,id(1))); assert.equal(m.validKey(a,id(2)),false);
  const mid=m.keyFor(a,b,id(3)); assert.ok(a<mid&&mid<b);
  const rows={[id(3)]:{pos:f(mid)},[id(1)]:{pos:f(a)},[id(2)]:{pos:f('bad')}};
  assert.deepEqual(m.orderOf(rows),[id(1),id(3),id(2)]);
});

test('acknowledgement uses the complete field rule', () => {
  assert.equal(m.acknowledged(f(false,999),f(true,1),'deleted'),false);
  assert.equal(m.acknowledged(f(true,1),f(false,999),'deleted'),true);
  assert.equal(m.acknowledged(f('b',10,'a'),f('a',10,'a'),'name'),false);
  assert.equal(m.acknowledged(f('b',10,'a'),f('a',10,'b'),'name'),true);
  assert.equal(m.acknowledged(f('a',11),f('b',10),'name'),true);
});

test('revision includes content independent of writer clocks and insertion order', () => {
  const a=blob({[id(1)]:tab()}); const b=structuredClone(a);b.tabs[id(1)].name=f('Changed',1);
  assert.notEqual(m.revisionOf(a),m.revisionOf(b));
  assert.equal(m.revisionOf({b:2,a:1}),m.revisionOf({a:1,b:2}));
  assert.match(m.revisionOf(a),/^[0-9a-f]{16}$/);
});

test('encrypted budget measures the actual UTF-8 envelope including tombstones', () => {
  assert.equal(m.blobFits('x'.repeat(320*1024),seal),true);
  assert.equal(m.blobFits('x'.repeat(400*1024),seal),false);
  const a=blob({[id(1)]:tab(1,{deleted:f(true)})});
  let measured; m.blobFits(a,s=>{measured=s;return seal(s);});
  assert.deepEqual(JSON.parse(measured),a);
  assert.equal(Buffer.byteLength(JSON.stringify(seal('x'.repeat(320*1024)))),436980);
  assert.equal(Buffer.byteLength(JSON.stringify(seal('x'.repeat(400*1024)))),546208);
});

test('sanitization rejects malformed identities and unsafe tabs without truncating the record set', () => {
  const a=blob({[id(1)]:tab(),[id(2)]:tab(2,{nav:f({url:'file:///tmp/secret',title:'Private'})}),bad:tab()});
  a.tabs[id(1)].name=f('n'.repeat(110)); a.tabs[id(1)].nav.v.title='t'.repeat(220);
  const clean=m.sanitizeBlob(a);
  assert.deepEqual(Object.keys(clean.tabs),[id(1)]);
  assert.equal(clean.tabs[id(1)].name.v.length,100);assert.equal(clean.tabs[id(1)].nav.v.title.length,200);
  const index=m.sanitizeIndex({v:1,spaces:{[id(99)]:{name:f('Work'),color:f('oops'),symbol:f('nope'),pos:f('i'),deleted:f(false)}}});
  assert.equal(index.spaces[id(99)].color.v,'#426c4c');assert.equal(index.spaces[id(99)].symbol.v,'briefcase');
});

test('deleted groups project as ungrouped; expiry removes records without mutating input', () => {
  const a=blob({[id(1)]:tab(1,{groupId:f(id(4))}),[id(2)]:tab(2,{deleted:f(true,1)})});
  a.groups[id(4)]={deleted:f(true,1)};
  assert.equal(m.effectiveGroup(a,a.tabs[id(1)]),null);
  const out=m.expireTombstones(a,m.LIMITS.tombstoneMs+2);
  assert.equal(out.tabs[id(2)],undefined);assert.ok(a.tabs[id(2)]);
  assert.equal(m.liveTabCount(a),1);
});

test('shared custom names use the same code-point and whitespace rules as local F46 names', () => {
  const a=blob({[id(1)]:tab(1,{name:f('  A\n\tB\u0000  ')}),[id(2)]:tab(2,{name:f('🦊'.repeat(101))})});
  const clean=m.sanitizeBlob(a);
  assert.equal(clean.tabs[id(1)].name.v,'A B');
  assert.equal(clean.tabs[id(2)].name.v,'🦊'.repeat(100));
});

const input = (remote,local,pending={},over={}) => ({fetchedBlob:remote,fetchedVersion:'v1',localBlob:local,pending,lastMergeAt:1000,now:2000,deviceId:'a',encryptFn:seal,lastPublishable:remote,...over});
const countSeal = raw => { const b=JSON.parse(raw);return {ct:'x'.repeat((Object.keys(b.tabs).length+Object.keys(b.groups).length)*300000)}; };

test('long-stale recovery excludes records and every pending field before merging', () => {
  assert.equal(typeof m.pushPlan,'function');
  const remote=blob({}),local=blob({[id(1)]:tab()});
  const pending={tabs:{[id(1)]:tab()}};
  const args=input(remote,local,pending,{lastMergeAt:1,now:m.LIMITS.tombstoneMs+2});
  const p=m.pushPlan(args);
  assert.deepEqual([...p.recover],[id(1)]);assert.equal(p.upload,null);
  assert.equal(p.pendingAfter.tabs?.[id(1)],undefined);assert.equal(p.mergedBlob.tabs[id(1)],undefined);
  assert.equal(args.lastMergeAt,1);assert.equal(p.nextLastMergeAt,args.now);
});

test('recent local records survive even when not pending, and no-op merges do not PUT', () => {
  const remote=blob({}),local=blob({[id(1)]:tab()});
  const p=m.pushPlan(input(remote,local));
  assert.ok(p.upload.blob.tabs[id(1)]);assert.equal(p.indexEntry.rev,p.upload.rev);
  assert.equal(m.pushPlan(input(local,local)).upload,null);
});

test('pending replay merges independent additions and acknowledges only fetched winners', () => {
  const a=blob({[id(1)]:tab()}),b=blob({[id(2)]:tab(2)});
  const pending={tabs:{[id(1)]:tab()}};
  const p=m.pushPlan(input(b,a,pending));assert.deepEqual(Object.keys(p.upload.blob.tabs),[id(1),id(2)]);
  assert.ok(p.pendingAfter.tabs[id(1)]);
  assert.deepEqual(m.settlePending(p.pendingAfter,p.upload.blob),{});
  assert.ok(m.settlePending({tabs:{[id(1)]:{deleted:f(true,1)}}},a).tabs[id(1)].deleted);
  assert.equal(m.acknowledged(f(false,1000),f(true,1),'deleted'),false);
});

test('lost writes without any remaining local copy cannot be recovered', () => {
  const remote=blob({}),local=blob({});
  const p=m.pushPlan(input(remote,local,{}));assert.equal(p.upload,null);assert.deepEqual(p.mergedBlob.tabs,{});
});

test('recent replica may resurrect a record when the remote tombstone was lost or expired', () => {
  const local=blob({[id(1)]:tab()});
  const p=m.pushPlan(input(blob({}),local,{}, {now:m.LIMITS.tombstoneMs+100,lastMergeAt:m.LIMITS.tombstoneMs+99}));
  assert.ok(p.upload.blob.tabs[id(1)]);
});

test('admission holds a new record atomically and keeps its complete pending write', () => {
  const local=blob({[id(1)]:tab(1),[id(2)]:tab(2,{name:f('newest',200)})});
  const p=m.pushPlan(input(blob({}),local,{tabs:local.tabs},{encryptFn:countSeal}));
  assert.deepEqual(Object.keys(p.upload.blob.tabs),[id(1)]);
  assert.ok(p.unsynced.has(id(2)));assert.deepEqual(p.pendingAfter.tabs[id(2)],local.tabs[id(2)]);
  assert.equal(p.reason,'full');
});

test('admission retains newer remote state rather than replaying an old publishable snapshot', () => {
  const remote=blob({[id(1)]:tab(1,{name:f('remote',300,'b')})});
  const local=blob({[id(1)]:tab(1),[id(2)]:tab(2,{name:f('new',400)})});
  const p=m.pushPlan(input(remote,local,{tabs:{[id(2)]:local.tabs[id(2)]}},{encryptFn:countSeal,lastPublishable:local}));
  const out=p.upload?.blob??p.mergedBlob;
  assert.equal(out.tabs[id(1)].name.v,'remote');assert.ok(p.unsynced.has(id(2)));
});

test('mandatory remote over-budget content yields no PUT or new index revision', () => {
  const remote=blob({[id(1)]:tab(),[id(2)]:tab(2)});
  const p=m.pushPlan(input(remote,remote,{}, {encryptFn:countSeal}));
  assert.equal(p.upload,null);assert.equal(p.indexEntry,null);assert.equal(p.reason,'remote-over-budget');
  assert.deepEqual(p.mergedBlob.tabs,remote.tabs);
});

test('holding a new group holds its dependent new tab rather than emitting a dangling reference', () => {
  const local=blob({[id(1)]:tab(1,{groupId:f(id(9),200)})});
  local.groups[id(9)]={name:f('Group',300),color:f(null,300),collapsed:f(false,300),pos:f(m.keyFor('','',id(9)),300),deleted:f(false,300)};
  const p=m.pushPlan(input(blob({}),local,{tabs:local.tabs,groups:local.groups},{encryptFn:countSeal}));
  const out=p.upload?.blob??blob({});
  assert.equal(out.tabs[id(1)],undefined);assert.equal(out.groups[id(9)],undefined);
  assert.ok(p.unsynced.has(id(1)));assert.ok(p.unsynced.has(id(9)));
});

test('a held update restores its fetched base rather than deleting a required field', () => {
  const remote=blob({[id(1)]:tab()});
  const local=blob({[id(1)]:tab(1,{nav:f({url:'https://long.test/',title:'Long'},300)})});
  const budget=raw=>({ct:'x'.repeat(JSON.parse(raw).tabs[id(1)].nav.v.url.includes('long')?600000:10)});
  const p=m.pushPlan(input(remote,local,{tabs:{[id(1)]:{nav:local.tabs[id(1)].nav}}},{encryptFn:budget}));
  assert.equal(p.upload,null);assert.equal(p.reason,'full');assert.ok(p.unsynced.has(id(1)));
  assert.ok(p.pendingAfter.tabs[id(1)].nav);
});

test('admission of retained non-pending local work requeues held writes durably', () => {
  const local=blob({[id(1)]:tab(),[id(2)]:tab(2,{name:f('later',200)})});
  const p=m.pushPlan(input(blob({}),local,{}, {encryptFn:countSeal}));
  assert.deepEqual(p.pendingAfter.tabs[id(2)],local.tabs[id(2)]);
});

test('pipeline classifies and removes recovery records before encryption sees a candidate', () => {
  const local=blob({[id(1)]:tab()});let seen;
  const p=m.pushPlan(input(blob({}),local,{tabs:local.tabs},{lastMergeAt:1,now:m.LIMITS.tombstoneMs+2,encryptFn:s=>{seen=JSON.parse(s);return seal(s);}}));
  assert.deepEqual(seen.tabs,{});assert.equal(p.nextLastMergeAt,m.LIMITS.tombstoneMs+2);
});

test('index publication waits for blob success and survives an index failure', () => {
  const pending={tabs:{[id(1)]:tab()}},local=blob({[id(1)]:tab()});
  const p=m.pushPlan(input(blob({}),local,pending));
  assert.equal(typeof m.settleUpload,'function');
  assert.deepEqual(m.settleUpload(p,pending,{blobStored:false}),{pending,indexEntry:null});
  const stored=m.settleUpload(p,pending,{blobStored:true,indexStored:false});
  assert.equal(stored.pending.index.rev,p.upload.rev);assert.equal(stored.indexEntry.rev,p.upload.rev);
  const retry=m.pushPlan(input(p.upload.blob,local,stored.pending));
  assert.equal(retry.upload,null);assert.equal(retry.indexEntry.rev,p.upload.rev);
});

test('the 501st local live tab is held without dropping any remote tab', () => {
  const rows={};for(let i=1;i<=500;i++)rows[id(i)]=tab(i);
  const remote=blob(rows),local=structuredClone(remote);local.tabs[id(501)]=tab(501,{name:f('last',500)});
  const p=m.pushPlan(input(remote,local,{tabs:{[id(501)]:local.tabs[id(501)]}}));
  assert.equal(p.upload,null);assert.equal(p.reason,'tabs');assert.ok(p.unsynced.has(id(501)));
  assert.equal(m.liveTabCount(p.mergedBlob),501);
});

test('persisted pending writes cannot upload unknown fields malformed ids or unbounded names', () => {
  const local=blob({[id(1)]:tab()});
  const pending={tabs:{[id(1)]:{name:f('x'.repeat(1000),200),unexpected:f('private page state',200)},bad:tab(2)}};
  const p=m.pushPlan(input(local,local,pending));
  assert.equal(p.upload.blob.tabs[id(1)].name.v,'x'.repeat(100));
  assert.equal(p.upload.blob.tabs[id(1)].unexpected,undefined);
  assert.equal(p.upload.blob.tabs.bad,undefined);
});

test('pending unsafe addresses and foreign position tags cannot replace valid fields', () => {
  const local=blob({[id(1)]:tab()});
  const pending={tabs:{[id(1)]:{nav:f({url:'file:///tmp/private',title:'Private'},200),pos:f(m.keyFor('','',id(2)),200)}}};
  const p=m.pushPlan(input(local,local,pending));
  assert.equal(p.upload,null);assert.deepEqual(p.mergedBlob,local);
});

test('a new missing group reference is withheld without losing the pending edit', () => {
  const local=blob({[id(1)]:tab()});
  const pending={tabs:{[id(1)]:{groupId:f(id(123),300)}}};
  const p=m.pushPlan(input(local,local,pending));
  assert.equal(p.upload,null);assert.ok(p.unsynced.has(id(1)));
  assert.equal(p.pendingAfter.tabs[id(1)].groupId.v,id(123));
});

test('successful index-only retry clears its receipt and acknowledged writes', () => {
  const local=blob({[id(1)]:tab()}),pending={tabs:local.tabs};
  const initial=m.pushPlan(input(blob({}),local,pending));
  const saved=m.settleUpload(initial,pending,{blobStored:true});
  const retry=m.pushPlan(input(initial.upload.blob,local,saved.pending));
  const done=m.settleUpload(retry,saved.pending,{indexStored:true});
  assert.equal(done.pending.index,undefined);assert.equal(done.pending.tabs,undefined);
});

test('newer fetched content rebases an old index receipt without rewriting the blob', () => {
  const local=blob({[id(1)]:tab()}),pending={tabs:local.tabs};
  const initial=m.pushPlan(input(blob({}),local,pending));
  const saved=m.settleUpload(initial,pending,{blobStored:true});
  const remote=structuredClone(local);remote.tabs[id(1)].name=f('newer',300,'b');
  const retry=m.pushPlan(input(remote,local,saved.pending));
  assert.equal(retry.upload,null);assert.equal(retry.indexEntry.rev,m.revisionOf(remote));
  assert.equal(m.settleUpload(retry,saved.pending,{indexStored:true}).pending.index,undefined);
});

test('required-state rejection reports every blocked local record as unsynced', () => {
  const local=blob({[id(1)]:tab(1,{name:f('from another device',300,'b')})});
  const pending={tabs:{[id(1)]:{nav:local.tabs[id(1)].nav}}};
  const p=m.pushPlan(input(blob({}),local,pending,{encryptFn:()=>({ct:'x'.repeat(600000)})}));
  assert.equal(p.upload,null);assert.equal(p.reason,'required-state-over-budget');
  assert.ok(p.unsynced.has(id(1)));assert.ok(p.pendingAfter.tabs[id(1)].nav);
});

test('admission ranks local edits without borrowing an unchanged remote field clock', () => {
  const remote=blob({[id(1)]:tab(1,{name:f('remote',10000,'b')})});
  const local=structuredClone(remote);local.tabs[id(1)].nav=f({url:'https://long.test/',title:'Local'},200,'a');
  local.tabs[id(2)]=Object.fromEntries(Object.entries(tab(2)).map(([k,v])=>[k,{...v,c:1000}]));
  const budget=s=>{const b=JSON.parse(s);return {ct:'x'.repeat(10000+(b.tabs[id(1)].nav.v.url.includes('long')?250000:0)+(b.tabs[id(2)]?300000:0))};};
  const p=m.pushPlan(input(remote,local,{},{encryptFn:budget}));
  assert.ok(p.unsynced.has(id(2)));assert.equal(p.unsynced.has(id(1)),false);
  assert.equal(p.upload.blob.tabs[id(1)].nav.v.url,'https://long.test/');
});
