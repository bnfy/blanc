// Shipping Send assertions over the actual local Worker, native inbox and UI.
// Fixture labels map to real paired device IDs; no result is injected into UI.
import assert from 'node:assert/strict';
import {ensureSyncPeer,syncPump,syncRoom} from '../lib/sync-fixture.mjs';
import {tabPage} from './core.mjs';

async function startPage(w){
 const state=await w.snapshot();return tabPage(w,state.activeTabId);
}
export const sends={
 async injectSends(w,input){
  assert.ok(w.syncServer,'Send fixture must use the local Worker');
  if(!input.targets.length&&!input.inbox.length)return;
  await ensureSyncPeer(w,input.targets[0]?.name??input.inbox[0].fromName);
  await w.waitFor(async()=>{await syncPump(w);return w.api('listSendTargets');},
   rows=>rows.some(row=>row.name===input.targets[0]?.name),'paired Send target',180000);
  w.sentFixturePeerId=w.syncPeer.sync.sharedContext().deviceId;
  for(const item of input.inbox){
   w.sentFixtureIds??=new Set();if(w.sentFixtureIds.has(item.id))continue;
   const target=w.syncPeer.sync.listSendTargets()[0];assert.ok(target,'native receiver presence');
   await syncRoom(w);w.syncPeer.sync.resetRequestWindowForTest();
   assert.equal((await w.syncPeer.sync.sendTab({url:item.url,title:item.title,to:target.id})).status,'sent');
   await w.waitFor(async()=>{await syncPump(w);return w.api('listSentToThisDevice');},
    rows=>rows.some(row=>row.url===item.url&&row.title===item.title),'native received Send',180000);
   w.sentFixtureIds.add(item.id);
  }
  if(input.sendStatus==='unavailable'&&!w.sentUnavailableRule){
   w.sentUnavailableRule=w.syncServer.inject({type:'unknown-store',store:'sends',times:100});
  }
  await syncRoom(w);await w.native('desktopSyncCall',['sync.resetRequestWindowForTest']);
  await w.hostEval('window.BlancPrototypeHost.refreshSyncSurfaces()');
 },
 async sentRequests(w){
  assert.ok(w.syncPeer,'paired receiver');
  await syncRoom(w);w.syncPeer.sync.resetRequestWindowForTest();
  await w.syncPeer.sync.syncNow(['sends']);
  return w.syncPeer.sync.listSentToThisDevice().map(row=>({
   ...row,to:w.sentFixturePeerId===w.syncPeer.sync.sharedContext().deviceId?'acceptance-phone':null,
  }));
 },
 async sentStartPageRows(w){
  return (await startPage(w)).evaluate(()=>[...document.querySelectorAll('#sentList .sent-item')].map(row=>({
   title:row.querySelector('.name')?.textContent,from:row.querySelector('.host')?.textContent,
   visible:row.getBoundingClientRect().width>0&&row.getBoundingClientRect().height>0,
  })));
 },
 async clickSentStartPageRow(w,title,action){
  assert.equal(action,'dismiss');const page=await startPage(w);
  await page.locator('#sentList .sent-item').filter({hasText:title}).locator('.sent-dismiss').click();return true;
 },
};
