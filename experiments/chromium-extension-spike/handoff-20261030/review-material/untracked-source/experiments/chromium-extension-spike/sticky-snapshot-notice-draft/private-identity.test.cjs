'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const s=fs.readFileSync(path.join(__dirname,'browser-check-snapshot-notice-private.mjs'),'utf8');const a=s.indexOf('function privateIdentityIsValid('),b=s.indexOf('function syncEvidenceDir()',a);assert(a>=0&&b>a);const valid=vm.runInNewContext(`(${s.slice(a,b).trim()})`,{Array});
test('requires non-default context, unique correlated page, and all active tabs private',()=>{
 const url='http://127.0.0.1/unique',target={type:'page',url,browserContextId:'private'},tabs={activeTabId:'1',tabs:[{id:'1',url,private:true}]},base={hostContext:'private',defaultContext:'regular',target,tabs,url};assert.equal(valid(base),true);
 for(const x of [{...base,defaultContext:'private'},{...base,defaultContext:undefined},{...base,target:{...target,browserContextId:'regular'}},{...base,target:{...target,url:'http://other'}},{...base,target:{...target,type:'worker'}},{...base,tabs:{...tabs,activeTabId:'other'}},{...base,tabs:{...tabs,tabs:[...tabs.tabs,{id:'2',private:false}]}},{...base,tabs:{...tabs,tabs:[]}}])assert.equal(valid(x),false);
});
test('private variant requires private scenario, unique host/page and owned profile',()=>{
 assert.match(s,/const scenarios=\['private'\]/);assert.match(s,/await launch\(true\)/);assert.match(s,/matches\.length>1/);assert.match(s,/targets\.length>1/);assert.match(s,/privateIdentityIsValid\(/);assert.doesNotMatch(s,/await launch\(false\)/);
});
