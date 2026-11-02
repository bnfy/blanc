import fs from 'node:fs';
import {spawn,execFileSync} from 'node:child_process';
const root='/private/tmp/blanc-task0';
const app='/Users/anthonyjloria/Projects/BlancChromium157/src/out/BlancPrototype/Blanc Prototype.app';
const profile=root+'/profile';
fs.mkdirSync(profile,{recursive:true});
if(!fs.existsSync(root+'/server.pid')){const log=fs.openSync(root+'/server.log','a');const server=spawn('/usr/local/bin/node',[root+'/server.mjs'],{detached:true,stdio:['ignore',log,log]});server.unref();fs.writeFileSync(root+'/server.pid',String(server.pid));}
execFileSync('open',['-n',app,'--args',`--user-data-dir=${profile}`,'--blanc-prototype-assets=/private/tmp/blanc-chromium157-work/experiments/chromium-extension-spike/generated','--no-first-run','--no-default-browser-check','--restore-last-session','--remote-debugging-port=9225','--remote-allow-origins=http://127.0.0.1:9225','--use-mock-keychain','chrome://newtab/']);
for(let i=0;i<100;i++){try{const tabs=await fetch('http://127.0.0.1:9225/json/list').then(r=>r.json());if(tabs.some(t=>t.url.endsWith('/host.html'))){const proc=execFileSync('ps',['-axo','pid=,command='],{encoding:'utf8'}).split('\n').find(l=>l.includes('/Contents/MacOS/Blanc Prototype --user-data-dir='+profile+' '));if(!proc)throw Error('Missing isolated process');const pid=proc.trim().split(/\s+/)[0];fs.writeFileSync(root+'/test.pid',pid);console.log(JSON.stringify({pid,profile,tabs:tabs.map(({type,url})=>({type,url}))}));process.exit(0)}}catch{}await new Promise(r=>setTimeout(r,200))}throw Error('Isolated browser not ready');
