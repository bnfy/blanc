import {execFileSync,assert,record,native,key,text,pause,until,snapshot,evaluate,targets,connect,active} from './lib.mjs';
import {page,pageClick} from './page.mjs';
await evaluate("BlancPrototypeHost.api.openPage('bookmarks')");await pause(500);const m=await page('chrome://bookmarks/');
key(17,1048576);await pause(1000);
let nt;for(const t of (await targets()).filter(t=>t.url==='chrome://newtab/')){const c=await connect(t);if(await c.eval('!document.hidden')){nt=c;break}c.close()}assert.ok(nt);
await until(()=>nt.eval('document.body.classList.contains("layout-ready")'),'visible layout initialized');
for(const layout of ['ledger','shelf','tally','billboard']){
 await pageClick(nt,'#customizeButton');await pageClick(nt,`[data-layout-pick="${layout}"]`);key(53);await pause(450);assert.equal(await nt.eval('document.body.dataset.layout'),layout);
 if(layout!=='billboard'){
  const root={ledger:'#favoritesList',shelf:'#shFavorites',tally:'#tlFavorites'}[layout],url='http://127.0.0.1:8786/Live-'+layout;
  const n=await m.eval(`chrome.bookmarks.create({title:'Live ${layout}',url:${JSON.stringify(url)}})`);
  await until(()=>nt.eval(`Boolean(document.querySelector('${root} a[href="${url}"]'))`),'live insert '+layout);
  await m.eval(`chrome.bookmarks.remove(${JSON.stringify(n.id)})`);await until(async()=>!await nt.eval(`Boolean(document.querySelector('${root} a[href="${url}"]'))`),'live remove '+layout);
 }
 execFileSync('screencapture',['-x','-l','2065','/private/tmp/blanc-task0/visible-'+layout+'.png']);
 record('native-visible-layout-refresh',{layout,visible:await nt.eval('!document.hidden')});
}
// A native keystroke on the visible start page must open the Island and preserve text.
const b=(await nt.send('Browser.getWindowForTarget')).bounds;native('click',b.left+250,b.top+b.height-180);text('n');await until(()=>evaluate('document.getElementById("overlay").contentDocument.getElementById("addressInput").value').then(v=>v==='n'),'first typed character bridged');text('ative typing bridge');await pause(400);
assert.equal(await evaluate('document.getElementById("overlay").contentDocument.getElementById("addressInput").value'),'native typing bridge');key(53);record('native-start-page-typing-bridge');
nt.close();m.close();
