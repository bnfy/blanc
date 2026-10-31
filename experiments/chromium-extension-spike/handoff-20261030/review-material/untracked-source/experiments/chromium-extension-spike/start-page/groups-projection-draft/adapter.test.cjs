const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'newtab-adapter-candidate.js'),'utf8');
function method(name,next){const start=source.indexOf(`      ${name}: async `),end=source.indexOf(`      ${next}: async `,start);assert(start>=0&&end>start);return source.slice(start,end).replace(new RegExp(`^\\s*${name}: `),'').replace(/,\s*$/,'')}
const dataCode=method('data','focusGroup'),focusCode=method('focusGroup','setClock');
const validateCode=source.slice(source.indexOf('  function validateGroupSnapshot('),source.indexOf('  const isPrivatePage'));
const validateGroupSnapshot=vm.runInNewContext('('+validateCode.trim()+')');
const qs=source.indexOf('  async function queueGroups()'),qe=source.indexOf('  window.blancRetryStartGroups',qs);assert(qs>=0&&qe>qs);const queueCode=source.slice(qs,qe).trim();
const row={id:'group-1',name:'work',color:'#426c4c',count:2};
(async()=>{
 const calls=[],ctx={isPrivatePage:false,topSitesEpoch:0,groupEpoch:0,preferences:()=>({layout:'billboard'}),document:{hidden:false},refreshClock:async()=>{},refreshLayout:async()=>{},topSitesStatus:()=>{},suppressRankedSites:()=>{},console:{warn:()=>{}},request:async(m)=>{calls.push(m);if(m==='topSites')return [];if(m==='focusGroup')return true;throw Error(m)}};
 const data=vm.runInNewContext('('+dataCode+')',ctx),focus=vm.runInNewContext('('+focusCode+')',ctx);
 const result=await data();assert.equal(result.layout,'billboard');assert(!calls.includes('groupsRead'));assert.equal(await focus('group-1'),true);
 ctx.isPrivatePage=true;assert.equal(await focus('group-1'),false);
 let done;let observed=[];const qctx={isPrivatePage:false,document:{hidden:false},startDataReady:true,groupReadInFlight:false,groupEpoch:0,validateGroupSnapshot,request:(m,a,t)=>{assert.equal(t,1500);return new Promise(r=>done=r)},window:{blancApplyStartGroups:(v,e)=>observed.push([v,e])},console:{warn:()=>{}}};
 const queue=vm.runInNewContext('('+queueCode+')',qctx);const pending=queue();assert.equal(qctx.groupReadInFlight,true);await queue();qctx.groupEpoch++;done([row]);await pending;assert.equal(observed.length,0);assert.equal(qctx.groupReadInFlight,false);
 qctx.request=async()=>[row];await queue();assert.equal(observed[0][0][0].id,'group-1');assert.equal(observed[0][1],false);
 qctx.request=async()=>{throw Error('failed')};await queue();assert.equal(observed.at(-1)[1],true);assert.equal(observed.at(-1)[0].length,0);
 qctx.request=async()=>[{...row,count:-1}];await queue();assert.equal(observed.at(-1)[1],true);
 let invoked=false;qctx.request=async()=>{invoked=true;return []};qctx.isPrivatePage=true;await queue();assert.equal(invoked,false);qctx.isPrivatePage=false;qctx.document.hidden=true;await queue();assert.equal(invoked,false);
 console.log('PASS independent bounded group reads, one in flight, stale response, failure clearing, invalid data, private and hidden refusal');
})().catch(e=>{console.error(e);process.exitCode=1});
