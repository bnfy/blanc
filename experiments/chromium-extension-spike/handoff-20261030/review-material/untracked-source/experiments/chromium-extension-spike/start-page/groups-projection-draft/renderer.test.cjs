const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const text=fs.readFileSync(path.join(__dirname,'newtab-candidate.js'),'utf8');
const start=text.indexOf('function appendGroupFailure('),end=text.indexOf('function renderBillboard(',start);assert(start>=0&&end>start);const code=text.slice(start,end);
for(const layout of ['groupsList','bbGroups','shGroups','tlGroups']){
 let document;
 class Element {constructor(){this.children=[];this.dataset={};this.hidden=false;this.card={hidden:false};this.tabIndex=0;this.writes=0;}
  setAttribute(){} append(...nodes){for(const n of nodes)this.appendChild(n)} appendChild(n){n.parent=this;this.children.push(n)}
  replaceChildren(){this.children=[];this.writes++} contains(n){return n===this||this.children.includes(n)}
  closest(){return this.card} querySelectorAll(q){return this.children.filter(c=>q==='[data-group-id]'&&c.dataset.groupId)}
  querySelector(q){return q==='[data-group-retry]'?this.children.find(c=>c.dataset.groupRetry):null}
  addEventListener(k,cb){this.click=cb} focus(){document.activeElement=this}
 }
 const containers=Object.fromEntries(['groupsList','bbGroups','shGroups','tlGroups','startContent','groupsSection'].map(x=>[x,new Element()]));
 document={activeElement:null,createElement:()=>new Element(),getElementById:id=>containers[id],querySelector:()=>({hidden:false})};
 const row=(id,name='work')=>({id,name,color:'red',count:1});let retryCount=0;
 const state={groups:[],groupsUnavailable:false};
 const context={document,state,window:{blancRetryStartGroups:()=>retryCount++,bowserPages:{start:{focusGroup:()=>{}}}},t:k=>k,paintGroupDots:()=>{},groupChip:g=>{const e=new Element();e.dataset.groupId=g.id;return e}};
 vm.runInNewContext(code,context);const update=context.window.blancApplyStartGroups;
 update([row('g')],false);const c=containers[layout],focused=c.children.find(e=>e.dataset.groupId==='g');focused.focus();const writes=c.writes;
 update([row('g')],false);assert.equal(c.writes,writes);assert.equal(document.activeElement,focused);
 // An unrelated start-data retry forces layout render: identical groups must
 // retain the same focused node in every layout.
 context.renderLedgerGroups(state.groups);for(const id of ['bbGroups','shGroups','tlGroups'])context.renderGroupChips(id,state.groups);
 assert.equal(c.writes,writes);assert.equal(document.activeElement,focused);
 update([row('g','renamed')],false);assert.equal(document.activeElement.dataset.groupId,'g');assert.notEqual(document.activeElement,focused);
 update([],true);assert.equal(c.children.some(e=>e.dataset.groupId),false);assert.equal(document.activeElement.dataset.groupRetry,'true');document.activeElement.click();assert.equal(retryCount,1);
 update([row('g')],false);assert.equal(document.activeElement,containers.startContent);assert.equal(containers.startContent.tabIndex,-1);
 c.children.find(e=>e.dataset.groupId==='g').focus();update([],false);assert.equal(document.activeElement,containers.startContent);
 update([row('g')],false);c.children.find(e=>e.dataset.groupId==='g').focus();update([],true);assert.equal(document.activeElement.dataset.groupRetry,'true');update([],false);assert.equal(document.activeElement,containers.startContent);
}
console.log('PASS unchanged snapshot avoids repaint; stable-id focus, failure retry and removed-focus fallback across four layouts');
