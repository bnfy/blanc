// The runner shares the owner's Mac: before each case, wait for enough free
// memory, and stop the run rather than add a browser under pressure.
import {execFileSync} from 'node:child_process';
import {pause} from './cdp.mjs';
export const freePercent=text=>{const m=/System-wide memory free percentage:\s*(\d+)%/.exec(text);return m?Number(m[1]):null;};
export async function awaitMemory({minimum=30,timeout=120000,read=()=>execFileSync('/usr/bin/memory_pressure',{encoding:'utf8'})}={}){
 const end=Date.now()+timeout;let free=null;
 for(;;){free=freePercent(read());if(free===null||free>=minimum)return free;
  if(Date.now()>end)throw Error(`Stopping: only ${free}% memory free (need ${minimum}%). No further browsers launched.`);
  await pause(5000);}
}
