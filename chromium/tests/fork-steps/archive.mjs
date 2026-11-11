import assert from 'node:assert/strict';
// Shipping's tab map includes resident Spaces. Chromium retains their actual
// WebContents in a separate hidden native window; the ordinary strip snapshot
// excludes them. Assert presence in the owning native strip in either case.
export const ARCHIVE_STEPS=new Map([
 ['that tab is still open and the Archive is empty',async function(){
  const state=await this.state();
  if(!state.tabs.some(t=>t.id===this.archiveCandidateId)){
   const space=(await this.call('residentSpaces')).find(s=>s.id===this.archiveSpaceId);
   assert.ok(space?.tabs.some(t=>t.id===this.archiveCandidateId&&t.present===true),'held tab still has its native WebContents');
  }
  assert.deepEqual(await this.call('archiveEntries'),[]);
 }],
]);
