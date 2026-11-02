import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('./notice.js', import.meta.url), 'utf8');
const base = {version:'157.0.8103.15', revision:'a'.repeat(40), status:'not-released',
  statusUrl:'https://github.com/bnfy/blanc/pull/1028', supportUrl:'mailto:support@blanc.day?subject=Blanc%20Chromium%20Preview',
  packagedAt:'2026-10-23T00:00:00Z', supportedPlatform:'Apple Silicon', maintainer:'Anthony Loria'};
function fixture(info = base) {
  const nodes = new Map(), calls = [];
  const element = id => {
    const handlers = new Map();
    return {id, hidden:true, textContent:'', dataset:{}, attrs:new Map(),
      addEventListener: (name, fn) => handlers.set(name, fn), fire: name => handlers.get(name)?.(),
      setAttribute(name,value) { this.attrs.set(name,value); }, removeAttribute(name) { this.attrs.delete(name); },
      focus() { calls.push('focus:'+id); }, showModal() { this.open=true; },
      close() { this.open=false; handlers.get('close')?.(); }};
  };
  for (const id of ['previewNotice','previewNoticeButton','previewNoticeStatus','previewNoticeClose','previewLiveStatus','previewSupport','previewStatusLink']) nodes.set(id,element(id));
  const fields=Object.keys(base).map(key=>({...element(key),dataset:{previewField:key}}));
  nodes.get('previewNotice').querySelectorAll=()=>fields;
  let ready;
  const document={querySelector:()=>({content:JSON.stringify(info)}),getElementById:id=>nodes.get(id),addEventListener:(_event,fn)=>{ready=fn;}};
  const context={document,location:{origin:'chrome://blanc-prototype'},window:{browserAPI:{createTab:async url=>calls.push(url),closeOverlay:async()=>calls.push('closeOverlay')}}};
  vm.runInNewContext(source,context);ready();return {nodes,calls};
}
test('notice and status link do no work until a user action', async()=>{
  const {nodes,calls}=fixture();assert.deepEqual(calls,[]);
  assert.match(nodes.get('previewNoticeButton').textContent,/157\.0\.8103\.15/);
  nodes.get('previewNoticeButton').fire('click');assert.equal(nodes.get('previewNotice').open,true);
  assert.equal(nodes.get('previewNotice').attrs.get('aria-modal'),'true');
  nodes.get('previewNoticeClose').fire('click');assert.equal(nodes.get('previewNotice').open,false);
  assert.equal(nodes.get('previewNotice').attrs.has('aria-modal'),false);assert.equal(calls.pop(),'focus:previewNoticeButton');
  await nodes.get('previewStatusLink').fire('click');assert.deepEqual(calls,[base.statusUrl,'closeOverlay']);
});
test('withdrawn metadata gives explicit stop-and-retreat guidance',()=>{
  const {nodes}=fixture({...base,status:'withdrawn'});
  assert.match(nodes.get('previewNoticeStatus').textContent,/Withdrawn.*quit.*shipping Blanc/);
  assert.equal(nodes.get('previewNotice').dataset.status,'withdrawn');
});
test('unreviewed destinations and invalid metadata cannot enable controls',()=>{
  for(const patch of [{statusUrl:'https://evil.invalid/'},{supportUrl:'javascript:alert(1)'},{revision:'HEAD'},{status:'safe'},{version:'<img>'}]){
    const {nodes,calls}=fixture({...base,...patch});assert.equal(nodes.get('previewNoticeButton').hidden,true);assert.equal(nodes.get('previewStatusLink').hidden,true);assert.deepEqual(calls,[]);
  }
});
