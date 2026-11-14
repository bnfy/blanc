import fs from 'node:fs';
import {assert,key,text,click,native,goto,pause,until,evaluate,snapshot,targets,connect,record,execFileSync} from './lib.mjs';
// Existing native popup must dismiss and the Island regain its shortcut.
key(53);key(37,1048576);await until(()=>evaluate('document.getElementById("overlay").contentDocument.activeElement.id==="addressInput"'),'Cmd L after popup');key(53);record('native-extension-popup-escape-cmd-l');
await goto('http://127.0.0.1:8786/TypedNative',true);
const c=await connect((await targets()).find(t=>t.url==='http://127.0.0.1:8786/TypedNative'));
await c.eval(`document.cookie='nativeSentinel=kept;path=/';localStorage.setItem('nativeSentinel','kept')`);
for(let i=0;i<12;i++){await c.send('Page.navigate',{url:'http://127.0.0.1:8786/'+(i%2?'TypedNative':'TypedOther'),transitionType:'typed'});await pause(140)}c.close();
record('native-visible-clear-fixture-seed',{method:'CDP typed transitions to seed native TopSites; /clear will be CGEvent input'});
key(17,1048576);await pause(800);
execFileSync('/usr/local/bin/node',['/private/tmp/blanc-task0/restart.mjs'],{timeout:30000});
await pause(18000);
const s=await snapshot();const nt=s.tabs.find(t=>t.url==='blanc://newtab/'||t.url==='chrome://newtab/');await evaluate(`BlancPrototypeHost.api.switchTab(${JSON.stringify(nt.id)})`);
const n=await connect((await targets()).find(t=>t.url==='chrome://newtab/'));console.log('SITES',await n.eval('state.topSites'));n.close();
