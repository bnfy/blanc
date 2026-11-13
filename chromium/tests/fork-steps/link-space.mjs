import assert from 'node:assert/strict';
import {runtimes} from '../adapters/tabs.mjs';
import {nativeCall} from '../lib/test-driver.mjs';
// Shipping has one global tab map; Chromium's native strips are per window.
// Read the destination's real strip while preserving the same assertions.
export const LINK_SPACE_STEPS=new Map([
 ['the link loads in the other window without changing either selection',async function(){
  assert.equal(this.linkResult?.ok,true,JSON.stringify(this.linkResult));
  await this.waitFor(()=>this.linkRequests,n=>n>0,'linked article loaded');
  const other=(await runtimes(this)).find(r=>r.id===this.otherWindow);assert.ok(other);
  const target=await this.waitFor(()=>nativeCall(other.cdp,'snapshot'),s=>s.tabs.some(t=>t.url===this.linkUrl&&!t.isLoading),'link loaded in destination');
  const linked=target.tabs.find(t=>t.url===this.linkUrl);assert.ok(linked);
  assert.equal(String(target.tabs.at(-1).id),String(linked.id));
  assert.notEqual(String(target.activeTabId),String(linked.id));assert.equal(linked.groupId,null);
  const source=await this.state();assert.deepEqual(source.tabOrder,this.linkSourceOrder);assert.equal(source.activeTabId,this.linkSourceActive);
 }],
]);
