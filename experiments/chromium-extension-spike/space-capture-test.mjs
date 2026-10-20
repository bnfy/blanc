import splitModel from './electron-split-reference/split-model.js';
import test from 'node:test';import assert from 'node:assert/strict';import {captureSpace} from './space-capture.mjs';
test('private or mixed-private snapshots cannot become saved spaces',()=>{
 assert.equal(captureSpace({tabs:[{private:true,url:'https://private.test/'}]}),null);
 assert.equal(captureSpace({tabs:[{url:'https://regular.test/'},{private:true}]}),null);
});
test('capture preserves zipped columns, group identity and active selection',()=>{
 const source={activeTabId:'b',tabs:[{id:'a',url:'https://a.test/',pinned:true},{id:'b',url:'https://b.test/',groupId:'g',title:'B'}],groups:[{id:'g',name:'Work',color:'#123456',collapsed:true}]};
 const x=captureSpace(source);assert.equal(x.complete,true);assert.equal(x.activeIndex,1);assert.deepEqual(x.pinned,[true,false]);assert.deepEqual(x.groupIds,[null,'g']);assert.equal(x.groups[0].collapsed,true);x.groups[0].name='changed';assert.equal(source.groups[0].name,'Work');
});
test('unsupported URLs are explicit incomplete captures, not silently lost',()=>{
 const x=captureSpace({activeTabId:2,tabs:[{id:1,url:'file:///private.txt'},{id:2,url:'blanc://newtab/'},{id:3,url:'javascript:alert(1)'}]});assert.equal(x.complete,false);assert.deepEqual(x.urls,['blanc://newtab/']);assert.equal(x.activeIndex,0);assert.equal(x.omitted.length,2);
});
test('empty and malformed snapshots cannot claim a complete capture',()=>{
 assert.equal(captureSpace(null),null);assert.equal(captureSpace({tabs:[]}).complete,false);assert.equal(captureSpace({tabs:[{id:1,url:'invalid'}]}).complete,false);
});

 test('persistent split columns round-trip with focused pane and layout from PR993',()=>{
 const x=captureSpace({activeTabId:'b',tabs:[{id:'a',url:'https://a.test/',splitId:'s'},{id:'b',url:'https://b.test/',splitId:'s'}],splits:[{id:'s',tabIds:['a','b'],layout:{kind:'columns',widths:[0.4,0.6]},focusedIndex:1}]});
 assert.equal(x.complete,true);assert.deepEqual(splitModel.restoreSplits(x.splits,x.splitIds,['new-a','new-b']),[{id:'s',tabIds:['new-a','new-b'],layout:{kind:'columns',widths:[0.4,0.6]},focusedIndex:1}]);assert.deepEqual(x.splitIds,['s','s']);assert.equal(x.activeIndex,1);assert.deepEqual(x.splits,[{id:'s',layout:{kind:'columns',widths:[0.4,0.6]},focusedIndex:1}]);
 });
 test('temporary Glance is not captured as a persistent split',()=>{
 const x=captureSpace({activeTabId:'a',glanceTabId:'b',tabs:[{id:'a',url:'https://a.test/'},{id:'b',url:'https://b.test/'}]});
 assert.deepEqual(x.splits,[]);assert.deepEqual(x.splitIds,[null,null]);
 });
 test('omitted split member leaves incomplete capture and dissolves orphan split',()=>{
 const x=captureSpace({activeTabId:'a',tabs:[{id:'a',url:'https://a.test/'},{id:'b',url:'file:///local'}],splits:[{id:'s',tabIds:['a','b'],layout:{kind:'columns',widths:[0.5,0.5]},focusedIndex:1}]});
 assert.equal(x.complete,false);assert.deepEqual(x.splits,[]);assert.deepEqual(x.splitIds,[null]);
 });
