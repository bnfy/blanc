// Unit test of the exact helper with a minimal fake DOM; not a browser test.
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const helper = fs.readFileSync(path.join(__dirname, 'overlay-submit.inc.js'), 'utf8');
class Element {
 constructor(){this.attrs={};this.listeners={};this.value='';this.hidden=false;}
 setAttribute(k,v){this.attrs[k]=v} getAttribute(k){return this.attrs[k]??null} removeAttribute(k){delete this.attrs[k]}
 addEventListener(k,fn){this.listeners[k]=fn} focus(){} after(){}
}
const addressInput = new Element();
const context = {addressInput,islandPanel:{querySelector:()=>new Element()},document:{createElement:()=>new Element()},blancI18n:{t:()=> 'Try again'},window:{browserAPI:{closed:0,closeOverlay(){this.closed++}}},mode:'panel',state:{activeTabId:'7',searchSelectionEpoch:'41'}};
vm.createContext(context);
vm.runInContext(helper+'\nthis.submit=submitAddressAction;this.invalidate=invalidateAddressSubmission;this.notice=addressSubmissionNotice;this.setState=setAddressSubmissionState;this.copy=outcomeCopy',context);
const {submit,invalidate,window} = context;
(async()=>{
 let finishOld,finishNew;addressInput.value='old';const old=submit(()=>new Promise(r=>finishOld=r));
 addressInput.value='new';addressInput.listeners.input();const next=submit(()=>new Promise(r=>finishNew=r));
 assert.equal(addressInput.getAttribute('aria-busy'),'true');finishOld(true);await old;
 assert.equal(addressInput.getAttribute('aria-busy'),'true');assert.equal(window.browserAPI.closed,0);
 finishNew(true);await next;assert.equal(window.browserAPI.closed,1);assert.equal(addressInput.getAttribute('aria-busy'),null);
 let finishHidden,finishReopen;const hidden=submit(()=>new Promise(r=>finishHidden=r));invalidate();addressInput.value='reopened';const reopened=submit(()=>new Promise(r=>finishReopen=r));
 finishHidden(true);await hidden;assert.equal(addressInput.getAttribute('aria-busy'),'true');assert.equal(window.browserAPI.closed,1);
 finishReopen(true);await reopened;assert.equal(window.browserAPI.closed,2);assert.equal(addressInput.getAttribute('aria-busy'),null);
 addressInput.value='private words';await submit(()=>Promise.reject(Error('The selected search provider is loading or unavailable.')));
 assert.equal(window.browserAPI.closed,2);assert.equal(context.notice.hidden,false);assert.equal(context.notice.textContent,'Try again');
 assert.equal(addressInput.getAttribute('aria-invalid'),'true');assert.equal(addressInput.value,'private words');
 let resolveTab;const tabPromise=submit(()=>new Promise(r=>resolveTab=r));context.setState({activeTabId:'8',searchSelectionEpoch:'42'});context.setState({activeTabId:'7',searchSelectionEpoch:'43'});resolveTab(true);await tabPromise;
 assert.equal(window.browserAPI.closed,2);
 addressInput.value='retry';await submit(()=>Promise.resolve({status:'same-document'}));assert.equal(window.browserAPI.closed,3);
 addressInput.value='unknown';await submit(()=>Promise.reject(Error('The action may still complete. Check the page before retrying.')));
 assert.equal(window.browserAPI.closed,3);assert.equal(context.notice.textContent,'The action may still complete. Check the page before retrying.');
 let finishNewTab;addressInput.value='new search';const newTab=submit(()=>new Promise(r=>finishNewTab=r),{createsTab:true});
 context.setState({activeTabId:'9',searchSelectionEpoch:'44'});finishNewTab({status:'committed',tabId:9,selectionEpoch:'44'});await newTab;
 assert.equal(window.browserAPI.closed,4);
 let failNewTab;addressInput.value='new failure';const failedTab=submit(()=>new Promise(r=>failNewTab=r),{createsTab:true});
 context.setState({activeTabId:'10',searchSelectionEpoch:'45'});failNewTab({status:'failed',tabId:10,selectionEpoch:'45'});await failedTab;
 assert.equal(window.browserAPI.closed,4);assert.equal(context.notice.hidden,false);assert.equal(addressInput.getAttribute('aria-invalid'),'true');
 let staleNewTab;addressInput.value='new ABA';const aba=submit(()=>new Promise(r=>staleNewTab=r),{createsTab:true});
 context.setState({activeTabId:'11',searchSelectionEpoch:'46'});context.setState({activeTabId:'10',searchSelectionEpoch:'47'});context.setState({activeTabId:'11',searchSelectionEpoch:'48'});
 staleNewTab({status:'committed',tabId:11,selectionEpoch:'46'});await aba;assert.equal(window.browserAPI.closed,4);
 let rejectNewTab;addressInput.value='new rejected';const rejected=submit(()=>new Promise((_,r)=>rejectNewTab=r),{createsTab:true});
 context.setState({activeTabId:'12',searchSelectionEpoch:'49'});rejectNewTab(Error('timeout'));await rejected;
 assert.equal(window.browserAPI.closed,4);assert.equal(context.notice.hidden,false);assert.equal(context.notice.textContent,'The action may still complete. Check the page before retrying.');
 addressInput.value='missing snapshot';await submit(()=>Promise.resolve({status:'committed',tabId:13,selectionEpoch:'50'}),{createsTab:true});
 assert.equal(window.browserAPI.closed,4);assert.equal(context.notice.hidden,false);assert.equal(context.notice.textContent,'The action may still complete. Check the page before retrying.');
 for(const lang of ['en','de','es','fr','it','pt']) { context.navigator={languages:[lang]};const [unknown,handoff]=context.copy();assert(unknown && handoff);if(lang!=='en')assert.notEqual(unknown,'The action may still complete. Check the page before retrying.'); }
 console.log('PASS: fake DOM failure, retry, unknown outcome, created-tab races, six copy variants, tab ABA, edit and reopen handling');
})().catch(e=>{console.error(e);process.exitCode=1});
