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
