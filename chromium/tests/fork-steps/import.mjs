import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {sessionBytes} from '../lib/import-fixture.mjs';
import {importSheet} from '../adapters/import.mjs';
import {installDriver,nativeCall} from '../lib/test-driver.mjs';
import {jsLiteral} from '../lib/js-literal.mjs';
const page=(w,body)=>importSheet(w,`async()=>{${body}}`);
async function open(w){
 await w.call('openTabImport');
 await w.waitFor(()=>w.call('utilitySurface'),s=>s.visible&&s.ready&&s.url==='blanc://tab-import/','import sheet');
}
function seed(w,count=6){
 w.importRows=Array.from({length:count},(_,i)=>({url:w.fixtureUrl('import-'+(i===1?0:i)),title:'Imported '+i,
  window:i<Math.ceil(count/2)?1:2,pinned:i===0||i===4,...(i<2?{group:'Research'}:i===2?{group:'Solo'}:i===3?{group:''}:{})}));
 w.importRows[w.importRows.length-1].url=w.importRows[w.importRows.length-1].url.replace('http:','https:');
 w.importRoot=path.join(w.fixture.browserHome,'Library/Application Support/Google/Chrome');
 w.importSource=path.join(w.importRoot,'Default');fs.mkdirSync(path.join(w.importSource,'Sessions'),{recursive:true});
 fs.writeFileSync(path.join(w.importSource,'Sessions/Session_100'),sessionBytes(w.importRows));
 w.importBytes=sessionBytes(w.importRows);
}
async function before(w){w.importBefore=await w.state();w.importFavorites=await w.call('bookmarkRecords');}
async function select(w){
 const sources=await w.native('importSources');
 const source=sources.sources.find(s=>s.browserId==='chrome'&&s.profile==='Default')??sources.sources.find(s=>s.browserId==='chrome');
 assert.ok(source,JSON.stringify(sources));w.importSourceId=source.id;
 w.importProjection=await page(w,`return window.bowserPages.tabImport.openSource(${jsLiteral(source.id)});`);
 assert.ok(!w.importProjection.error,JSON.stringify(w.importProjection));
}
async function reviewed(w,count=6){seed(w,count);await before(w);await open(w);await select(w);
 const p=w.importProjection;w.importRequest={generation:p.generation,groups:[],ungroupedCandidateIds:p.candidates.map(c=>c.candidateId)};}
const identities=s=>({tabs:s.tabs.map(t=>({id:t.id,url:t.url,groupId:t.groupId,pinned:t.pinned})),groups:s.groups});
export default register=>{
 register('I opened Bring Your Tabs without selecting a source',async function(){seed(this);await before(this);await open(this);});
 register('I select a supported browser profile with a complete restorable session',async function(){await select(this);});
 register('its normal HTTP and HTTPS tabs are shown by source window and tab order',function(){
  assert.deepEqual(this.importProjection.candidates.map(c=>c.title),this.importRows.map(r=>r.title));
  assert.deepEqual(this.importProjection.candidates.map(c=>c.sourceWindow),this.importRows.map(r=>r.window));
 });
 register('exact duplicate open tabs remain separate',function(){const p=this.importProjection.candidates;assert.equal(p[0].hostname,p[1].hostname);assert.notEqual(p[0].candidateId,p[1].candidateId);assert.equal(p.length,this.importRows.length);});
 register('no tabs, groups, or Favorites have been created',async function(){assert.deepEqual(identities(await this.state()),identities(this.importBefore));assert.deepEqual(await this.call('bookmarkRecords'),this.importFavorites);});
 register('I reviewed selected open-tab candidates from multiple source windows',async function(){await reviewed(this);});
 register('I apply the tab migration',async function(){
  this.importResult=await page(this,`return window.bowserPages.tabImport.apply(${jsLiteral(this.importProjection.sessionId)},${jsLiteral(this.importRequest)});`);
  if(this.importResult?.ok){await this.waitForState(s=>s.tabs.filter(t=>this.importResult.tabIds.includes(t.id)).length===this.importRows.length);}
 });
 register('imported tabs appear in source-window and source-tab order',async function(){
  assert.equal(this.importResult.ok,true,JSON.stringify(this.importResult));const ids=new Set(this.importResult.tabIds);
  const rows=(await this.state()).tabs.filter(t=>ids.has(t.id));assert.deepEqual(rows.map(t=>t.url),this.importRows.map(r=>r.url));
 });
 register('the moving-in checklist records tab migration as complete',async function(){assert.equal((await this.call('migrationChecklistSettings')).tabsComplete,true);});
 register('source pins remain pinned',async function(){const rows=(await this.state()).tabs.filter(t=>this.importResult.tabIds.includes(t.id));assert.deepEqual(rows.map(t=>t.pinned),this.importRows.map(r=>r.pinned));});
 register('only the first selected imported tab is awake and focused',async function(){const s=await this.waitForState(s=>s.activeTabId===this.importResult.tabIds[0]&&!s.tabs.find(t=>t.id===s.activeTabId).isLoading);assert.equal(s.tabs.find(t=>t.id===s.activeTabId).asleep,false);});
 register('every other imported tab is quiet and viewless',async function(){const snap=await this.snapshot();for(const id of this.importResult.tabIds.slice(1)){const tab=snap.tabs.find(t=>String(t.id)===id);assert.equal(tab.asleep,true);assert.equal(tab.rendererLive,false);}});
 register('Favorites are unchanged',async function(){assert.deepEqual(await this.call('bookmarkRecords'),this.importFavorites);});
 register('available browser and profile labels may be listed',async function(){const s=await this.native('importSources');assert.ok(s.sources.some(r=>r.browserId==='chrome'));assert.ok(!JSON.stringify(s).includes(this.fixture.browserHome));});
 register('no session file has been opened',async function(){assert.equal(await this.native('importDebug',['reads']),0);});
 register('I select a source profile',async function(){await select(this);});
 register('Blanc reads only its bounded session snapshot',async function(){assert.equal(await this.native('importDebug',['reads']),1);assert.deepEqual(fs.readFileSync(path.join(this.importSource,'Sessions/Session_100')),this.importBytes);});
 register('a tab-migration session contains candidate URLs and a source path',async function(){await reviewed(this);});
 register('the utility renderer requests its candidate projection',async function(){this.importProjection=await page(this,`return window.bowserPages.tabImport.project(${jsLiteral(this.importProjection.sessionId)});`);});
 register('it receives opaque IDs, bounded titles, hostnames, source-window and group labels, pin, and selection state',function(){for(const c of this.importProjection.candidates){assert.match(c.candidateId,/^[a-zA-Z0-9-]+$/);assert.ok(c.title.length<=240);assert.deepEqual(Object.keys(c).sort(),['candidateId','excluded','hostname','pinned','selected','sourceGroupName','sourceTabOrder','sourceWindow','title'].sort());}});
 register('it receives no full URL or source filesystem path',function(){const s=JSON.stringify(this.importProjection);assert.ok(!s.includes('http://')&&!s.includes('https://')&&!s.includes(this.fixture.browserHome));});
 register('a reviewed tab migration is ready to apply',async function(){await reviewed(this);});
 register('its quiet-tab batch will fail',async function(){await this.native('importDebug',['fail-after',2]);});
 register('no imported tab or group remains',async function(){assert.equal(this.importResult.error,'batch-failed');assert.deepEqual(identities(await this.state()),identities(this.importBefore));});
 register('selected source tabs include an eligible named source group',async function(){await reviewed(this);});
 register('I organize the migration',async function(){this.importSuggestion=await page(this,`return window.bowserPages.tabImport.suggestSourceGroups(${jsLiteral(this.importProjection.sessionId)});`);});
 register('that name and membership seed an editable Blanc Named Group',function(){const groups=this.importSuggestion.proposal.groups;assert.equal(groups.length,1);assert.equal(groups[0].name,'Research');assert.deepEqual(groups[0].candidateIds,this.importProjection.candidates.slice(0,2).map(c=>c.candidateId));});
 register('single-tab, blank-group, and ungrouped tabs remain ungrouped',function(){assert.deepEqual(this.importSuggestion.proposal.ungroupedCandidateIds,this.importProjection.candidates.slice(2).map(c=>c.candidateId));});
 register('no placeholder group is invented',function(){assert.deepEqual(this.importSuggestion.proposal.groups.map(g=>g.name),['Research']);});
 register('I can create, rename, move, ungroup, leave out, and restore tabs',async function(){
  // Exercise shipping's actual organizer controls in its sheet, not a shadow model.
  await page(this,`const source=[...document.querySelectorAll('.tab-import-source-btn')][0];source.click();`);
  await this.waitFor(()=>page(this,`return document.querySelector('[data-step-panel="tabs"]')?.hidden===false && !document.getElementById('tabImportContinueToOrganize').disabled;`),Boolean,'loaded source');
  await page(this,`document.getElementById('tabImportContinueToOrganize').click();`);
  await this.waitFor(()=>page(this,`return document.querySelectorAll('#tabImportOrganizeBoard select').length;`),n=>n>0,'organizer controls');
  const read=()=>page(this,`return [...document.querySelectorAll('#tabImportOrganizeBoard section')].map(section=>({name:section.querySelector('input')?.value??section.querySelector('h3')?.textContent,excluded:section.classList.contains('excluded'),rows:[...section.querySelectorAll('.tab-import-review-row')].map(row=>row.querySelector('.title')?.textContent??row.textContent)}));`);
  await page(this,`const input=document.getElementById('tabImportNewGroupName');input.value='Project';document.getElementById('tabImportNewGroupForm').requestSubmit();`);
  assert.ok((await read()).some(s=>s.name==='Project'),'create a group');
  await page(this,`const input=[...document.querySelectorAll('.tab-import-group-name')].find(i=>i.value==='Project');input.value='Planning';input.dispatchEvent(new window.Event('change',{bubbles:true}));`);
  assert.ok((await read()).some(s=>s.name==='Planning'),'rename the group');
  const move=async(title,lane)=>{
   await page(this,`const row=[...document.querySelectorAll('.tab-import-review-row')].find(r=>r.textContent.includes(${jsLiteral(title)}));const select=row.querySelector('select');const option=[...select.options].find(o=>o.textContent===${jsLiteral(lane)}||o.value===${jsLiteral(lane)});if(!option)throw Error('missing destination '+${jsLiteral(lane)});select.value=option.value;select.dispatchEvent(new window.Event('change',{bubbles:true}));`);
   await this.waitFor(()=>read(),sections=>sections.some(s=>(lane==='__excluded__'?s.excluded:lane==='__ungrouped__'?s.name==='ungrouped':s.name===lane)&&s.rows.some(t=>t.includes(title))),'row moved');
  };
  await move('Imported 0','Planning');
  await move('Imported 0','__ungrouped__');
  await move('Imported 0','__excluded__');
  await page(this,`const row=[...document.querySelectorAll('.tab-import-review-row')].find(r=>r.textContent.includes('Imported 0'));row.querySelector('button').click();`);
  await this.waitFor(()=>read(),sections=>sections.some(s=>s.name==='Research'&&s.rows.some(t=>t.includes('Imported 0'))),'restored source group');
  assert.ok(!(await read()).some(s=>s.excluded),'restored selection');
 });
 register('a tab-migration session has candidates in memory',async function(){await reviewed(this);});
 register('I cancel or dismiss Bring Your Tabs',async function(){await this.call('closeUtilitySurface');});
 register('the session is destroyed',async function(){assert.equal((await this.native('importProject',[this.importProjection.sessionId])).error,'session-unavailable');});
 register('no migration secret enters persistence, sync, telemetry, or logs',async function(){
  // Candidate URLs contain this unique marker and were never opened.
  const needle='import-0';const files=[];const walk=p=>{for(const e of fs.readdirSync(p,{withFileTypes:true})){const f=path.join(p,e.name);if(e.isDirectory())walk(f);else if(e.isFile()&&fs.statSync(f).size<16*1024*1024)files.push(f);}};walk(this.fixture.profile);
  const hits=files.filter(f=>fs.readFileSync(f).includes(Buffer.from(needle)));assert.deepEqual(hits,[]);
 });
 register('I reviewed the maximum 500 open-tab candidates',async function(){
  await reviewed(this,500);
  await this.hostEval(`(()=>{window.__importBatchBroadcasts=[];const prior=new Set(${jsLiteral(this.importBefore.tabs.map(t=>t.id))});let last='';window.__importBatchUnsubscribe=window.BlancPrototypeHost.api.onTabsUpdated(s=>{const ids=s.tabs.filter(t=>!prior.has(String(t.id))).map(t=>String(t.id));const key=ids.join(',');if(ids.length&&key!==last){window.__importBatchBroadcasts.push(ids.length);last=key;}});})()`);
 });
 register('only the focused imported tab has live web contents',async function(){const s=await this.snapshot();const ids=new Set(this.importResult.tabIds);const live=s.tabs.filter(t=>ids.has(String(t.id))&&t.rendererLive);assert.equal(live.length,1);assert.equal(String(live[0].id),this.importResult.tabIds[0]);});
 register('the other imported tabs remain quiet and viewless',async function(){const s=await this.snapshot();for(const t of s.tabs.filter(t=>this.importResult.tabIds.slice(1).includes(String(t.id)))){assert.equal(t.asleep,true);assert.equal(t.rendererLive,false);}});
 register('the newest source session cannot be read while its browser is running',async function(){
  seed(this);await before(this);fs.writeFileSync(path.join(this.importSource,'Sessions/Session_200'),'incomplete snapshot');
  fs.symlinkSync('synthetic-host-123',path.join(this.importRoot,'SingletonLock'));await open(this);
 });
 register('Blanc can parse an older saved restorable session as preflight evidence',async function(){
  const sources=await this.native('importSources');this.importSourceId=sources.sources.find(s=>s.browserId==='chrome').id;
  this.importRecovery=await page(this,`return window.bowserPages.tabImport.openSource(${jsLiteral(this.importSourceId)});`);
  assert.equal(this.importRecovery.error,'source-locked');assert.equal(this.importRecovery.recoverable,true);assert.equal(this.importRecovery.recoverableTabCount,6);
  await page(this,`document.querySelector('.tab-import-source-btn').click();`);
  await this.waitFor(()=>page(this,`return document.getElementById('tabImportSourceRecovery').textContent;`),s=>s.includes('Quit'),'quit guidance');
 });
 register('Blanc may ask me to quit the source browser normally',async function(){assert.match(await page(this,`return document.getElementById('tabImportSourceRecovery').textContent;`),/Quit Google Chrome/);});
 register('Blanc says tabs remain saved and restorable without promising automatic reopening',async function(){const text=await page(this,`return document.getElementById('tabImportSourceRecovery').textContent;`);assert.match(text,/saved/);assert.match(text,/restor/i);assert.doesNotMatch(text,/will (?:automatically )?reopen/i);});
 register('Blanc never force-quits or modifies that browser',function(){assert.equal(fs.readFileSync(path.join(this.importSource,'Sessions/Session_200'),'utf8'),'incomplete snapshot');assert.deepEqual(fs.readFileSync(path.join(this.importSource,'Sessions/Session_100')),this.importBytes);assert.equal(fs.readlinkSync(path.join(this.importRoot,'SingletonLock')),'synthetic-host-123');});
 register('the destination already has a Named Group named {string}',async function(name){await this.call('openTab',this.fixtureUrl('existing-work'));await this.call('groupActiveByName',name);});
 register('I renamed a reviewed migration group to {string}',async function(name){await reviewed(this);this.importRequest.groups=[{name,candidateIds:this.importProjection.candidates.slice(0,2).map(c=>c.candidateId)}];this.importRequest.ungroupedCandidateIds=this.importProjection.candidates.slice(2).map(c=>c.candidateId);});
 register('those imported tabs join the existing {string} group',async function(name){const s=await this.state(),g=s.groups.find(g=>g.name===name);assert.ok(g);const original=this.importBefore.groups.find(g=>g.name===name);assert.equal(g.id,original.id);for(const id of this.importResult.tabIds.slice(0,2))assert.equal(s.tabs.find(t=>t.id===id).groupId,g.id);});
 register('no second {string} group is created',async function(name){assert.equal((await this.state()).groups.filter(g=>g.name===name).length,1);});
 register('a tab-migration session belongs to one window and profile',async function(){await reviewed(this);});
 register('a stale generation, another window, or another profile tries to apply it',async function(){
  const p=this.importProjection;
  const stale=await this.native('importApply',[p.sessionId,{...this.importRequest,generation:'stale'}]);
  assert.equal(stale.error,'stale-generation');
  const original=(await this.fixture.host.send('Target.getTargetInfo')).targetInfo.targetId;
  await this.call('openNewWindow');
  const other=(await this.fixture.targets()).find(t=>t.url==='chrome://blanc-prototype/host.html'&&t.id!==original);
  let cdp=this._hosts?.get(other.id);if(!cdp){cdp=await this.fixture.connectTarget(other);await installDriver(cdp);}
  const foreign=await nativeCall(cdp,'importApply',[p.sessionId,this.importRequest]);assert.equal(foreign.error,'session-unavailable');
  await nativeCall(cdp,'createTab',['chrome://newtab/',true]);
  const privateReply=await nativeCall(cdp,'importApply',[p.sessionId,this.importRequest]);assert.equal(privateReply.error,'private-window');
  this.importOwnershipChecked=true;
 });
 register('the apply is rejected',function(){assert.equal(this.importOwnershipChecked,true);});
 register('no tabs, groups, Favorites, or workspaces are changed',async function(){assert.deepEqual(identities(await this.state()),identities(this.importBefore));assert.deepEqual(await this.call('bookmarkRecords'),this.importFavorites);assert.equal((await this.call('workspaceAction','list')).items.length,0);});
 register('Blanc asked me to quit the source browser after a successful preflight',async function(){
  seed(this);await before(this);fs.writeFileSync(path.join(this.importSource,'Sessions/Session_200'),'malformed');fs.symlinkSync('synthetic-host-123',path.join(this.importRoot,'SingletonLock'));await open(this);
  const sources=await this.native('importSources');this.importSourceId=sources.sources.find(s=>s.browserId==='chrome').id;
  const r=await this.native('importOpenSource',[this.importSourceId,{}]);assert.equal(r.recoverable,true);
 });
 register('the exact newest session remains locked, changing, incomplete, or malformed',async function(){
  this.importPostQuit=[];
  for(const bytes of [Buffer.from('malformed'),sessionBytes(this.importRows,{marker:false}),Buffer.concat([this.importBytes,Buffer.from([20,0,6])])]){
   fs.writeFileSync(path.join(this.importSource,'Sessions/Session_200'),bytes);
   const result=await this.native('importOpenSource',[this.importSourceId,{afterQuit:true}]);this.importPostQuit.push(result);assert.ok(result.error);assert.equal(result.sessionId,undefined);assert.notEqual(result.recoverable,true);
  }
  // Permission and concurrent-write failures use the same post-quit path;
  // those nondeterministic OS states are not faked by a parser result.
 });
 register('Blanc does not import an older snapshot',async function(){assert.ok(this.importPostQuit.every(r=>r.error&&!r.sessionId));assert.deepEqual(identities(await this.state()),identities(this.importBefore));});
 register('Blanc tells me to reopen the source browser',async function(){
  await page(this,`document.querySelector('.tab-import-source-btn').click();`);
  await this.waitFor(()=>page(this,`return document.getElementById('tabImportSourceRecovery').textContent;`),s=>s.includes('Quit'),'quit guidance');
  await page(this,`document.querySelector('#tabImportSourceRecovery button').click();`);
  const text=await this.waitFor(()=>page(this,`return document.getElementById('tabImportStatus').textContent;`),s=>/open Google Chrome/i.test(s),'reopen guidance');assert.match(text,/open Google Chrome/i);
 });
 register('the selected session is encrypted, malformed, oversized, or unsupported',async function(){seed(this);await before(this);await open(this);const sources=await this.native('importSources');this.importSourceId=sources.sources.find(s=>s.browserId==='chrome').id;});
 register('Blanc attempts its explicit read',async function(){
  this.importRejected=[];
  for(const bytes of [sessionBytes(this.importRows,{version:5}),Buffer.from('bad'),sessionBytes(this.importRows,{version:91})]){
   fs.writeFileSync(path.join(this.importSource,'Sessions/Session_100'),bytes);this.importRejected.push(await this.native('importOpenSource',[this.importSourceId,{}]));
  }
  fs.truncateSync(path.join(this.importSource,'Sessions/Session_100'),64*1024*1024+1);
  this.importRejected.push(await this.native('importOpenSource',[this.importSourceId,{}]));
  assert.deepEqual(this.importRejected.map(r=>r.error),['encrypted-session','invalid-session-header','unsupported-session-version','session-too-large']);
 });
 register('no source-browser credential or OS-crypt key is requested',function(){assert.equal(this.importRejected[0].error,'encrypted-session');assert.ok(this.importRejected.every(r=>!r.sessionId));assert.equal(JSON.parse(fs.readFileSync(path.join(this.importRoot,'Local State'),'utf8')).os_crypt,undefined,'no source OS-crypt key is available to the importer');});
 register('no import state is created',async function(){assert.deepEqual(identities(await this.state()),identities(this.importBefore));assert.deepEqual(await this.call('bookmarkRecords'),this.importFavorites);});
 register('I successfully imported reviewed tabs and groups',async function(){await reviewed(this);this.importResult=await page(this,`return window.bowserPages.tabImport.apply(${jsLiteral(this.importProjection.sessionId)},${jsLiteral(this.importRequest)});`);assert.equal(this.importResult.ok,true);await this.waitForState(s=>s.activeTabId===this.importResult.tabIds[0]&&!s.tabs.find(t=>t.id===s.activeTabId).isLoading);});
 register('the imported state is available without Patron',async function(){await this.call('clearSupporter');assert.equal((await this.state()).tabs.filter(t=>this.importResult.tabIds.includes(t.id)).length,this.importRows.length);});
 register('I choose to save that setup as a Named Workspace',async function(){this.importSpace=await this.call('workspaceAction','save','Imported setup');});
 register('Blanc uses the existing space flow as a separate gesture',async function(){assert.equal(this.importSpace.ok,true,JSON.stringify({result:this.importSpace,tabs:(await this.snapshot()).tabs.map(({id,url,committedUrl,asleep,isLoading,rendererLive})=>({id,url,committedUrl,asleep,isLoading,rendererLive}))}));assert.equal((await this.call('workspaceAction','list')).items.filter(s=>s.name==='Imported setup').length,1);});
 register("I am on first-run onboarding's import step",async function(){
  seed(this);await before(this);assert.equal(await this.call('showTestFirstRunMigration'),true);
  await this.waitFor(()=>this.call('readOnboardingDom'),s=>s?.shown,'walkthrough');
  assert.equal(await this.call('advanceOnboardingTo',1),true);
 });
 register('I choose Bring your open tabs before or after Favorites import',async function(){
  // Both entry points use the same sheet. First take the explicit skip path.
  assert.equal(await this.call('clickOnboarding','#obBringTabs'),true);
  await this.waitFor(()=>this.call('utilitySurface'),s=>s.visible&&s.ready&&s.url==='blanc://tab-import/','onboarding import');
  assert.deepEqual(await this.call('bookmarkRecords'),this.importFavorites);
  await this.call('closeUtilitySurface');
  // Replay the walkthrough, perform its existing Favorites import, then hand off.
  assert.equal(await this.call('showTestFirstRunMigration'),true);
  await this.waitFor(()=>this.call('readOnboardingDom'),s=>s?.shown,'walkthrough replay');
  assert.equal(await this.call('advanceOnboardingTo',1),true);
  assert.equal(await this.call('clickFirstRunMigrationFind'),true);
  await this.waitFor(()=>this.call('readFirstRunMigrationDom'),s=>s.options.some(x=>x.includes('Google Chrome')),'Favorites source');
  assert.equal(await this.call('clickFirstRunMigration'),true);
  await this.waitFor(()=>this.call('readFirstRunMigrationDom'),s=>s.status&&!/Importing/.test(s.status),'Favorites import result');
  this.importOnboardingFavorites=await this.call('bookmarkRecords');
  assert.equal(await this.call('clickOnboarding','#obBringTabs'),true);
 });
 register('the same Bring Your Tabs sheet opens',async function(){await this.waitFor(()=>this.call('utilitySurface'),s=>s.visible&&s.ready&&s.url==='blanc://tab-import/','same import sheet');});
 register('Favorites import remains a separate F30 action',async function(){assert.deepEqual(await this.call('bookmarkRecords'),this.importOnboardingFavorites);assert.equal(await this.native('importDebug',['reads']),0);});
 register('the batch produces one tab-state broadcast',async function(){
  const result=await this.hostEval('window.__importBatchBroadcasts');
  assert.equal(result.length,1,JSON.stringify(result));assert.equal(result[0],this.importRows.length);
 });
};
