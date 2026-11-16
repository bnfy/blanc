import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {nativeNavigationHistory} from '../lib/main-ports.mjs';
// Preserve shipping's live-document, POST count and disk non-disclosure
// assertions against Chromium's actual session and Spaces stores.
export const WORKSPACE_LIFECYCLE_STEPS=new Map([
 ['the POST response stays live without reposting or leaking page state to disk',async function(){
  assert.equal(await this.call('workspacePageIdentity',this.postTab),this.postIdentity);
  const values=await this.call('workspacePageScript',this.postTab,`({response:document.querySelector('#post-response').textContent,draft:document.querySelector('#draft').value,storage:sessionStorage.getItem('draft'),hash:location.hash,identity:window.documentIdentity})`);
  assert.deepEqual(values,{response:'workspace-response-sentinel',draft:'workspace-unsaved-sentinel',storage:'workspace-storage-sentinel',hash:'#post-history',identity:'post-document'});
  assert.deepEqual(await nativeNavigationHistory(this.fixture,this.postIdentity),this.postHistory);
  assert.equal(this.lifecycleFixture.requests.posts,1,'switch must not repeat POST');
  assert.equal(this.lifecycleFixture.requests.gets,0,'switch must not replace POST with GET');
  // This checkpoints and replays the real session, including queued writes.
  const saved=await this.call('persistedSessionData');
  assert.ok(saved.windows.some(w=>w.tabs.some(t=>t.url.includes('/submitted'))),'the POST tab must be represented in the checkpoint');
  const profile=path.join(this.fixture.profile,'Default');
  const spaces=path.join(profile,'BlancPrototypeSpaces.json');
  assert.ok(fs.existsSync(spaces),'native Spaces store must exist');
  const sessions=path.join(profile,'Sessions');
  const files=[spaces,...fs.readdirSync(sessions).map(name=>path.join(sessions,name))];
  assert.ok(files.length>1,'native session commands must exist');
  for(const file of files){
   const bytes=fs.readFileSync(file);
   for(const sentinel of ['workspace-post-sentinel','workspace-response-sentinel','workspace-unsaved-sentinel','workspace-storage-sentinel']){
    for(const encoding of ['utf8','utf16le'])assert.equal(bytes.includes(Buffer.from(sentinel,encoding)),false,`${path.basename(file)} must not persist ${sentinel}`);
   }
  }
 }],
]);
