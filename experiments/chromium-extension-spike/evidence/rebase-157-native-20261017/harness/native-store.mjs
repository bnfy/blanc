import {assert,record,evaluate,until,targets,connect,pause,native} from './lib.mjs';
const url='https://chromewebstore.google.com/detail/bitwarden-password-manager/nngceckbapebfimnlniiiahkandclblb';
await evaluate(`BlancPrototypeHost.api.createTab(${JSON.stringify(url)})`);
await until(async()=>(await targets()).some(t=>t.url===url),'store target');
const c=await connect((await targets()).find(t=>t.url===url));
await until(()=>c.eval(`[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Add to Chrome'&&!b.disabled)`),'normal Add to Chrome enabled',40000);
const r=await c.eval(`(()=>{let e=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Add to Chrome');e.scrollIntoView({block:'center'});let r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,inner:innerHeight}})()`);const b=(await c.send('Browser.getWindowForTarget')).bounds;
native('click',b.left+r.x,b.top+b.height-r.inner+r.y);await pause(1200);record('native-store-install-button-clicked',{url});c.close();
