import assert from 'node:assert/strict';
export const BATCH_CLOSE_STEPS=new Map([
 ['closing and reopening the selection restores the split',async function(){
  assert.equal(await this.call('runSelectedTabsAction','batch-close'),true);
  const closed=await this.waitForState(s=>this.selectionPages.every(id=>!s.tabs.some(t=>t.id===id)));
  assert.ok(this.selectionPages.every(id=>!closed.tabs.some(t=>t.id===id)),'every selected native page closed');
  const entries=await this.call('closedEntriesSummary');
  assert.equal(entries.at(-1).tabCount,3,'one recoverable batch represents all three pages');
  await this.call('reopenClosed');
  const st=await this.waitForState(s=>s.splits.length===1);
  const urls=st.splits[0].tabIds.map(id=>st.tabs.find(t=>t.id===id)?.url);
  assert.deepEqual(urls,['selection-one','selection-two'].map(name=>this.fixtureUrl(name)));
  assert.equal(st.tabs.some(t=>t.url===this.fixtureUrl('selection-three')),true);
 }],
]);
