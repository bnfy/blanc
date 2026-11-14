import test from 'node:test';
import assert from 'node:assert/strict';
import {shippingState} from './adapters/state.mjs';
import {observedState,UndefinedNativeAdapterError} from './lib/adapters.mjs';
const tab=(id,extra={})=>({id,url:'http://a/'+id,committedUrl:'http://a/'+id,isLoading:false,title:'t'+id,groupId:null,pinned:false,...extra});
test('fork snapshot projects to shipping state with string ids and shipping clusters',()=>{
 const s=shippingState({activeTabId:2,focusedTabId:2,glanceTabId:null,splits:[],
  groups:[{id:'g1',name:'research',collapsed:false}],
  tabs:[tab(1,{pinned:true}),tab(2),tab(3,{groupId:'g1'}),tab(4,{groupId:'g1'}),tab(5,{url:'chrome://newtab/',committedUrl:'chrome://newtab/'})]});
 assert.equal(s.activeTabId,'2');
 assert.deepEqual(s.tabOrder,['1','2','3','4','5']);
 assert.deepEqual(s.clusters.map(c=>[c.key,c.tabIds]),[['pinned',['1']],['run:2',['2']],['g1',['3','4']],['run:5',['5']]]);
 assert.equal(s.tabs[4].url,'blanc://newtab/');
 assert.equal(s.groups[0].color,null);
});
test('fields the fork snapshot lacks stay undefined adapters, never guesses',()=>{
 const s=observedState(shippingState({activeTabId:1,splits:[],groups:[],tabs:[tab(1)]}));
 assert.throws(()=>s.tabs[0].capture,UndefinedNativeAdapterError);
 assert.throws(()=>s.glanceCard,UndefinedNativeAdapterError);
});
