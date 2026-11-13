import assert from 'node:assert/strict';
// Native retained WebContents keep immutable SessionTabHelper IDs on reopen.
// Preserve every shipping transfer assertion, locating that same retained tab
// rather than requiring Electron's newly allocated tab-record ID.
export const PINNED_HOME_STEPS = new Map([
 ['a pinned tab whose slow home is {string}',async function(name){
  const url=this.fixtureUrl(name)+'?hold=slow';
  const id=await this.call('openTab',url);
  await this.waitForState(s=>s.tabs.some(t=>t.id===id&&!t.isLoading&&t.url===url));
  await this.call('pinTab',id);
  assert.equal(await this.call('pinnedHome',id),url);
  this.pinnedTabId=id;this.pinnedHomeUrl=url;
  // Chromium can restore this response from disk cache, which stops it being
  // a slow fixture. Remove cached responses so the unchanged loading/title
  // assertion observes the server's real 2.5-second response on relaunch.
  await this.fixture.host.send('Network.clearBrowserCache');
 }],
 ['duplicate, reopen, move-window, and Space copies retain its pinned home',async function(){
  const home=this.pinnedHomeUrl, original=this.pinnedTabId;
  const before=new Set((await this.state()).tabs.map(t=>t.id));
  await this.call('activateTab',original);await this.call('duplicateActive');
  const duplicated=await this.waitForState(s=>s.tabs.length>before.size);
  const copy=duplicated.tabs.find(t=>!before.has(t.id));
  assert.equal(await this.call('pinnedHome',copy.id),home);
  await this.call('closeTab',copy.id);
  assert.equal((await this.state()).tabs.some(t=>t.id===copy.id),false);
  assert.equal((await this.call('closedEntriesSummary'))[0]?.held,true);
  await this.call('reopenClosed');
  await this.waitForState(s=>s.tabs.some(t=>t.id===copy.id));
  assert.equal(await this.call('pinnedHome',copy.id),home);
  await this.waitForState(s=>s.tabs.every(t=>!t.isLoading&&!t.asleep));
  const space=await this.call('workspaceAction','save','Pinned home acceptance');
  assert.equal(space.ok,true,JSON.stringify(space));
  const blank=await this.call('workspaceAction','create','Blank acceptance');
  assert.equal(blank.ok,true,JSON.stringify(blank));
  await this.waitForState(s=>s.tabs.every(t=>!t.isLoading&&!t.asleep));
  assert.equal((await this.call('workspaceAction','open',space.workspace.id)).ok,true);
  const state=await this.waitForState(s=>s.tabs.some(t=>t.pinned&&t.url===this.fixtureUrl('pinned-b')));
  const tab=state.tabs.find(t=>t.pinned&&t.url===this.fixtureUrl('pinned-b'));
  assert.equal(await this.call('pinnedHome',tab.id),home);
  assert.ok(await this.call('moveTabToNewWindow',tab.id),'Move to New Window should return the destination window');
  assert.equal(await this.call('pinnedHome',tab.id),home);
 }],
]);
