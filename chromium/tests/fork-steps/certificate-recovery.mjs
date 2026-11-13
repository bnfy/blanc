import assert from 'node:assert/strict';
// Chromium retains a WebContents' immutable SessionTabHelper id when its live
// page is parked and reinserted. Electron instead creates a new tab record.
// Transport only: prove disappearance, the actual native hold, and return of
// that page. The unchanged following steps compare the real CDP target and
// committed certificate state, so a URL-only reload cannot pass.
export const CERTIFICATE_RECOVERY_STEPS = new Map([
 ['I close the local tab and reopen it straight away', async function(){
  const id=this.localTabId;
  this.closedWebContentsId=await this.call('tabWebContentsId',id);
  await this.waitForState(s=>s.tabs.some(t=>t.id===id&&!t.isLoading),{timeout:10000});
  await this.call('closeTab',id);
  assert.equal((await this.state()).tabs.some(t=>t.id===id),false,'closed page left the visible tab model');
  const [entry]=await this.call('closedEntriesSummary');
  assert.equal(entry?.held,true,'the closed tab must be parked as a live view');
  await this.call('reopenClosed');
  await this.waitForState(s=>s.tabs.some(t=>t.id===id&&t.loadedUrl.includes('/site/local')),{timeout:5000});
  this.localTabId=id;
 }],
]);
