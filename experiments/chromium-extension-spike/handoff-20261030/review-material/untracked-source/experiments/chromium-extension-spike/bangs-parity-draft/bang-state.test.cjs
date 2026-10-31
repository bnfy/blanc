'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {normalizeSnapshot,resolveRequest}=require('./bang-state');

test('released built-in aliases and query encoding use primary code for regular recents',()=>{
 const r=resolveRequest({recentBangs:['w','yt']},' snow & ice !youtube ',false);
 assert.equal(r.resolved.url,'https://www.youtube.com/results?search_query=snow+%26+ice');
 assert.equal(r.resolved.code,'yt');assert.deepEqual(r.nextRecents,['yt','w']);assert.equal(r.recentsChanged,true);
});
test('private uses same target and cannot add or reorder recent codes',()=>{
 const input={recentBangs:['w','yt']}, before=JSON.stringify(input);
 const r=resolveRequest(input,'!yt private fixture',true);
 assert.equal(r.resolved.url,'https://www.youtube.com/results?search_query=private+fixture');
 assert.deepEqual(r.nextRecents,['w','yt']);assert.equal(r.recentsChanged,false);assert.equal(JSON.stringify(input),before);
});
test('disabled, unknown and malformed inputs do not create recent entries',()=>{
 for(const [state,text] of [[{bangsEnabled:false},'!yt example'],[{},'!nosuchbangexample words'],[{},'!bad? words']]){
  const r=resolveRequest(state,text,false);assert.equal(r.resolved,null);assert.equal(r.recentsChanged,false);
 }
 assert.equal(resolveRequest({bangsEnabled:false},'!yt example',false).bangShaped,true);
 assert.equal(resolveRequest({},'!nosuchbangexample words',false).bangShaped,true);
 assert.equal(resolveRequest({},'!bad? words',false).bangShaped,false);
});
test('custom entries are normalized, validated and shadow catalog aliases',()=>{
 const entries=[{code:'  YOUTUBE ',name:' Custom ',template:'https://search.example/find?q=%s',ignored:'x'},
  {code:'youtube',name:'duplicate',template:'https://ignored.example/?q=%s'},
  {code:'bad',name:'Bad',template:'http://remote.example/?q=%s'},
  {code:'leak',name:'Leak',template:'https://%s.example/'},
  {code:'auth',name:'Auth',template:'https://user:<redacted-email>/?q=%s'},
  {code:'local',name:'Local',template:'http://localhost:8080/?q=%s'}];
 const snapshot=normalizeSnapshot({customBangs:entries});assert.deepEqual(snapshot.customBangs.map(x=>x.code),['youtube','local']);
 assert.deepEqual(Object.keys(snapshot.customBangs[0]),['code','name','template']);
 const r=resolveRequest(snapshot,'!youtube one two',false);assert.equal(r.resolved.url,'https://search.example/find?q=one+two');assert.equal(r.resolved.code,'youtube');
});
test('empty query opens the released home and recents are bounded and deduplicated',()=>{
 const r=resolveRequest({recentBangs:['yt','w','w','gh','a','g','r','so','x','wa','nf','spotify']},'!youtube',false);
 assert.equal(r.resolved.url,'https://www.youtube.com/');assert.equal(r.nextRecents.length,10);assert.equal(r.nextRecents[0],'yt');assert.equal(new Set(r.nextRecents).size,10);
});
test('custom limits and privacy state cannot be bypassed by malformed input',()=>{
 const custom=Array.from({length:110},(_,i)=>({code:`b${i}`,name:`site ${i}`,template:'https://example.com/?q=%s'}));
 assert.equal(normalizeSnapshot({customBangs:custom}).customBangs.length,100);
 assert.throws(()=>resolveRequest({},'!yt x',undefined),TypeError);
 assert.throws(()=>resolveRequest({},12,false),TypeError);
});
