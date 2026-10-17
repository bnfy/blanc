import {assert,record,snapshot,evaluate,targets,connect,pause,until} from './lib.mjs';
const api=async(name,...args)=>evaluate(`BlancPrototypeHost.api[${JSON.stringify(name)}](...${JSON.stringify(args)})`);
const nt=await connect((await targets()).find(t=>t.url==='chrome://newtab/'));
try{
 const history=await api('listHistory',{limit:300});assert.ok(history.length>0);record('history-before-clear',{history});
 await nt.send('Page.reload');await pause(1200);record('topsites-before-clear',{sites:await nt.eval('state.topSites')});
 await nt.eval(`window.rebaseDocumentToken='same-page';window.rebaseEvents=[];const original=blancNewTabEvent;window.blancNewTabEvent=(k)=>{rebaseEvents.push(k);return original(k)}`);
 const favorites=await api('listFavorites');await api('clearHistory');await until(async()=>(await api('listHistory',{limit:300})).length===0,'clear');
 await until(async()=>(await nt.eval('rebaseEvents')).includes('topSites'),'deletion notification',30000);
 assert.equal(await nt.eval('rebaseDocumentToken'),'same-page');assert.ok(!(await nt.eval('state.topSites')).some(t=>t.url.startsWith('http://127.0.0.1:8786/')));assert.deepEqual(await api('listFavorites'),favorites);
 const c=await connect((await targets()).find(t=>t.url==='http://127.0.0.1:8786/TypedTopSite'));const data=await c.eval(`({cookie:document.cookie,storage:localStorage.getItem('rebaseSentinel')})`);c.close();assert.equal(data.storage,'kept');assert.ok(data.cookie.includes('rebaseSentinel=kept'));
 record('automated-clear-history-and-event-pass',{favorites,data,events:await nt.eval('rebaseEvents'),sites:await nt.eval('state.topSites'),qualification:'TopSites seeded by typed visits and restart before verifying live deletion.'});
}catch(e){record('history-failure',{error:e.stack});throw e}finally{nt.close()}
