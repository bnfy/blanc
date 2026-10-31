'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {createSnapshotController} = require('./snapshot-controller.cjs');
const snap = (active, ids, splits = []) => ({activeTabId: active, tabs: ids.map(id => ({id})), splits: splits.map(tabIds => ({tabIds}))});
const harness = () => {
  const landed = [], w = {}, other = {};
  const c = createSnapshotController({activate: (window,id) => landed.push([window,id])});
  return {landed,w,other,c};
};
test('held switch chooses in actual use order without activating until release', () => {
  const {landed,w,c}=harness();
  c.observe(w,snap('a',['a','b','c']));c.observe(w,snap('b',['a','b','c']));c.observe(w,snap('c',['a','b','c']));
  assert.equal(c.step(w,1),true);assert.equal(c.step(w,1),true);assert.equal(c.session(w).order[c.session(w).pick],'a');assert.deepEqual(landed,[]);
  assert.equal(c.release(w),true);assert.deepEqual(landed,[[w,'a']]);
});
test('split panes occupy one entry; newest focused pane is selected', () => {
  const {landed,w,c}=harness();const ids=['a','p1','p2','z'];
  c.observe(w,snap('p2',ids,[['p1','p2']]));c.observe(w,snap('p1',ids,[['p1','p2']]));c.observe(w,snap('z',ids,[['p1','p2']]));
  c.step(w,1);assert.deepEqual(c.session(w).order,['z','p1','a']);c.release(w);assert.deepEqual(landed,[[w,'p1']]);
});
test('window histories stay isolated and moved/closed candidates cannot be activated', () => {
  const {landed,w,other,c}=harness();c.observe(w,snap('a',['a','b','c']));c.observe(w,snap('b',['a','b','c']));c.observe(w,snap('c',['a','b','c']));c.observe(other,snap('x',['x','y']));
  c.step(w,1);c.observe(w,snap('c',['a','c']));assert.equal(c.session(w).order[c.session(w).pick],'a');c.step(other,1);c.release(other);c.release(w);
  assert.deepEqual(landed,[[other,'y'],[w,'a']]);
});
test('external activation and split topology changes cancel a pending choice', () => {
  const {landed,w,c}=harness();c.observe(w,snap('a',['a','b','c']));c.step(w,1);c.observe(w,snap('b',['a','b','c']));assert.equal(c.release(w),false);
  c.step(w,1);c.observe(w,snap('b',['a','b','c'],[['a','c']]));assert.equal(c.release(w),false);assert.deepEqual(landed,[]);
});
test('invalid snapshots and directions do not select a tab', () => {
  const {landed,w,c}=harness();assert.throws(()=>c.observe(w,snap('a',['a','a'])));assert.throws(()=>c.observe(w,snap('a',['a','b'],[['a','missing']])));assert.throws(()=>c.observe(w,{tabs:[],activeTabId:null}));
  assert.equal(c.step(w,1),false);c.observe(w,snap('a',['a','b']));assert.equal(c.step(w,0),false);assert.equal(c.release(w),false);assert.deepEqual(landed,[]);
});

test('invalid replacement snapshot cancels an armed selection and discards stale authority', () => {
  const {landed,w,c}=harness();c.observe(w,snap('a',['a','b']));c.step(w,1);assert.throws(()=>c.observe(w,{tabs:[],activeTabId:null}));assert.equal(c.release(w),false);assert.equal(c.step(w,1),false);assert.deepEqual(landed,[]);
});

test('view callbacks cannot change the controller selection through shared objects', () => {
  const landed=[],w={};const c=createSnapshotController({activate:(_w,id)=>landed.push(id),onChange:(_w,session)=>{if(session){session.order[1]='unrelated';session.pick=0}}});
  c.observe(w,snap('a',['a','b']));c.step(w,1);const exposed=c.session(w);exposed.order[1]='other';exposed.pick=0;assert.equal(c.release(w),true);assert.deepEqual(landed,['b']);
});
