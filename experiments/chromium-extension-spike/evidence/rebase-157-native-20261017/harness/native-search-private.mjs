import {assert,base,record,native,key,text,until,pause,snapshot,active,favorites,evaluate,goto,enter,click,capture,targets,connect} from './lib.mjs';
const rows=()=>evaluate(`Array.from(document.getElementById('overlay').contentDocument.querySelectorAll('#islandList .island-row')).map(e=>({title:e.querySelector('.row-title')?.textContent,tag:e.querySelector('.row-tag')?.textContent,active:e.classList.contains('active')}))`);
async function query(q){await click('#pillDomain');key(0,1048576);text(q);await pause(900);return rows();}
try{
  key(53);
  for(const t of (await snapshot()).tabs.filter(t=>t.url===base+'Alpha'))await evaluate(`BlancPrototypeHost.api.closeTab(${JSON.stringify(t.id)})`);
  const r=await query('Rebase157 Alpha'); const hits=r.filter(r=>r.title==='Rebase157 Alpha' && ['favorite','history','tab'].includes(r.tag));assert.equal(hits.length,1);assert.equal(hits[0].tag,'favorite');record('native-typed-favorite-deduplicated',{rows:r});await capture('favorite-search');
  key(36);await until(async()=>(await active()).url===base+'Alpha','favorite Enter navigation');record('native-favorite-enter-navigation');
  key(17,1048576);await pause(700);key(53);
  const h=await query('Rebase157 Invalid');assert.ok(h.some(r=>r.title==='Rebase157 Invalid'&&r.tag==='history'));record('native-typed-history-result',{rows:h});key(36);await until(async()=>(await active()).url===base+'Invalid','history Enter navigation');record('native-history-enter-navigation');
  native('click',500,700);key(45,1179648);await until(()=>evaluate('BlancPrototypeHost.api.getAllTabs()',true).catch(()=>false),'private window');await pause(500);
  await click('#pillDomain','strip',true);key(0,1048576);text(base+'Private');key(36);await until(async()=>(await active(true)).url===base+'Private','private HTTP page');
  // The private content origin is derived from its actual window, then clicked natively.
  const pt=(await targets()).find(t=>t.url===base+'Private');const pc=await connect(pt);const b=(await pc.send('Browser.getWindowForTarget')).bounds;pc.close();native('click',b.left+100,b.top+400);
  const before=await favorites();key(2,1048576);await pause(500);assert.deepEqual(await favorites(),before);assert.equal((await active(true)).bookmarked,false);
  await click('#pillDomain','strip',true);
  const state=await evaluate(`(()=>{const s=document.getElementById('strip').contentDocument,o=document.getElementById('overlay').contentDocument;return {pill:s.defaultView.getComputedStyle(s.getElementById('pillHeart')).display,panel:o.defaultView.getComputedStyle(o.getElementById('heartBtn')).display,error:document.getElementById('error')?.textContent||''}})()`,true);
  assert.equal(state.pill,'none');assert.equal(state.panel,'none');assert.equal(state.error,'');record('native-private-http-cmd-d-no-op-hidden-hearts',{state});
  const history=await evaluate('BlancPrototypeHost.api.listHistory({limit:300})');await enter('/save Private',true);assert.deepEqual(await favorites(),before);await enter('/clear',true);await until(async()=>(await evaluate('document.getElementById("status").textContent',true)).includes('Clear history from a regular window.'),'private clear refusal');assert.deepEqual(await evaluate('BlancPrototypeHost.api.listHistory({limit:300})'),history);record('native-private-save-clear-guards');
  // Native Escape, page focus, and Cmd-Shift-W close this private window only.
  key(53);native('click',b.left+100,b.top+400);key(13,1179648);await pause(700);record('native-search-private-complete');
}catch(e){record('failure',{message:e.stack});throw e;}
