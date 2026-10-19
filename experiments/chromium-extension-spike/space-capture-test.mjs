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
