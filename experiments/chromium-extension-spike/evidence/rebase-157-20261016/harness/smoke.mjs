import fs from 'node:fs';
import {targets,connect,pause,assert,record,snapshot,evaluate} from './lib.mjs';
const ts=await targets();const c=await connect(ts.find(t=>t.url==='chrome://newtab/'));
record('browser-version',await c.send('Browser.getVersion'));
record('start-page-initial',await c.eval(`({url:location.href,title:document.title,text:document.body.innerText.slice(0,700),state:typeof state==='undefined'?null:{layout:state.layout,topSites:state.topSites}})`));
let s=await snapshot();record('island-initial',{snapshot:s,dom:await evaluate(`({strip:!!document.getElementById('strip').contentDocument?.querySelector('#pillDomain'),overlay:!!document.getElementById('overlay').contentDocument?.querySelector('#addressInput'),status:document.getElementById('status').textContent})`)});
assert.equal((await c.send('Browser.getVersion')).product,'Chrome/157.0.8103.6');assert.equal(s.tabs[0].url,'blanc://newtab/');
await evaluate(`BlancPrototypeHost.api.createTab('http://127.0.0.1:8786/A')`);await pause(1000);s=await snapshot();record('fixture-created',{snapshot:s});assert.ok(s.tabs.some(t=>t.url==='http://127.0.0.1:8786/A'));
const shot=await c.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync('/private/tmp/blanc-task0/start-page.png',Buffer.from(shot.data,'base64'));c.close();
