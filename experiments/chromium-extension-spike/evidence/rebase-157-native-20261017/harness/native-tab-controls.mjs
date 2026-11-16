import {assert,record,native,key,enter,pause,until,snapshot,active,evaluate,click,point,targets,connect} from './lib.mjs';
import {pageClick} from './page.mjs';
for(const t of (await snapshot()).tabs.filter(t=>t.url.startsWith('http://127.0.0.1:8786/')))await evaluate(`BlancPrototypeHost.api.closeTab(${JSON.stringify(t.id)})`);
for(const n of ['MoveA','MoveB','MoveC']){await evaluate(`BlancPrototypeHost.api.createTab('http://127.0.0.1:8786/${n}')`);await pause(250)}
const tab=async n=>(await snapshot()).tabs.find(t=>t.url.endsWith('/'+n));
const A=(await tab('MoveA')).id,B=(await tab('MoveB')).id,C=(await tab('MoveC')).id;
await click('#pillDomain');await click(`[data-tab-id="${A}"] .row-pin`,'overlay');await until(async()=>(await tab('MoveA')).pinned,'row pin');await click(`[data-tab-id="${A}"] .row-pin`,'overlay');await until(async()=>!(await tab('MoveA')).pinned,'row unpin');record('native-row-pin-unpin');
async function drag(a,b){const x=await point(`[data-tab-id="${a}"] .row-title`,'overlay'),y=await point(`[data-tab-id="${b}"] .row-title`,'overlay');native('drag',x.x,x.y,y.x,y.y-8);await pause(500)}
await drag(B,A);let order=(await snapshot()).tabs.map(t=>t.id);assert.ok(order.indexOf(B)<order.indexOf(A));record('native-loose-row-drag');
for(const id of [A,C])await click(`[data-tab-id="${id}"] .row-pin`,'overlay');await drag(C,A);assert.equal((await snapshot()).tabs[0].id,C);record('native-pinned-row-drag');const before=(await snapshot()).tabs.map(t=>t.id);await drag(A,B);assert.deepEqual((await snapshot()).tabs.map(t=>t.id),before);record('native-pinned-boundary-refusal');
key(53);await evaluate(`BlancPrototypeHost.api.switchTab(${JSON.stringify(C)})`);
const c=await connect((await targets()).find(t=>t.url.endsWith('/MoveC')));
await c.eval(`(()=>{let b=document.createElement('button');b.id='play';b.textContent='Play test tone';document.body.append(b);b.onclick=()=>{window.testAudio=new AudioContext();window.testOsc=testAudio.createOscillator();let g=testAudio.createGain();g.gain.value=.005;testOsc.connect(g).connect(testAudio.destination);testOsc.start()}})()`);
await pageClick(c,'#play');await until(async()=>(await active()).audible,'audible native tone');
await click('#pillDomain');await click(`[data-tab-id="${C}"] .row-mute`,'overlay');await until(async()=>(await active()).muted,'row mute');await click(`[data-tab-id="${C}"] .row-mute`,'overlay');await until(async()=>!(await active()).muted,'row unmute');key(53);await enter('/mute');assert.equal((await active()).muted,true);await enter('/mute');assert.equal((await active()).muted,false);await c.eval('testOsc.stop();testAudio.close()');c.close();record('native-audible-row-and-slash-mute');
await click('#pillDomain');await click(`[data-tab-id="${B}"] .row-close`,'overlay');await until(async()=>!(await snapshot()).tabs.some(t=>t.id===B),'row close');key(53);record('native-row-close');
