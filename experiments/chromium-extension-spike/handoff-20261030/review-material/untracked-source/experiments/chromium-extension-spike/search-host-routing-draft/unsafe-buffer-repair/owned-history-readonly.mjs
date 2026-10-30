// Read-only check for a just-closed, fresh local fixture profile only.
// immutable=1 skips WAL replay: refuse every sidecar and any observed open handle.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function absent(p){try{fs.lstatSync(p);return false}catch(e){if(e.code==='ENOENT')return true;throw e}}
function checkNoSidecars(db){for(const suffix of ['-wal','-shm','-journal'])if(!absent(db+suffix))throw Error(`History sidecar present: ${suffix}; immutable read prohibited`)}
function openPids(db){
 const result=spawnSync('/usr/sbin/lsof',['-nP','-Fpn','--',db],{encoding:'utf8',timeout:5000});
 if(result.error||![0,1].includes(result.status)||(result.stderr||'').trim())throw Error('lsof unavailable or incomplete; cannot establish closed fixture database');
 const pids=(result.stdout||'').split('\n').filter(x=>/^p\d+$/.test(x)).map(x=>Number(x.slice(1)));
 if(result.status===0&&!pids.length)throw Error('lsof returned unrecognized output');
 if(result.status===1&&(result.stdout||'').trim())throw Error('lsof returned inconsistent output');
 return pids;
}
export function readClosedOwnedHistory(profile,{regularExit,privateExit}){
 if(regularExit!==true||privateExit!==true)throw Error('Both fixture browser processes must have exited normally');
 const name=path.basename(profile);
 if(!/^local-profile-[A-Za-z0-9_-]{1,40}$/.test(name)||path.resolve(profile)!==path.join(root,name))throw Error('Only a fresh owned fixture profile is eligible');
 const db=path.join(profile,'Default','History');
 for(const p of [profile,path.join(profile,'Default'),db]){const st=fs.lstatSync(p);if(st.isSymbolicLink())throw Error(`Unexpected symlink: ${p}`)}
 if(!fs.lstatSync(db).isFile())throw Error('History is not a regular file');
 for(const name of ['SingletonLock','SingletonSocket','SingletonCookie'])if(!absent(path.join(profile,name)))throw Error(`Profile singleton artifact present: ${name}`);
 checkNoSidecars(db);
 // Verify that the operating environment can see our own open descriptor;
 // an empty lsof result alone is not evidence that lsof can inspect processes.
 const fd=fs.openSync(db,'r');try{if(!openPids(db).includes(process.pid))throw Error('lsof self-check did not see the owned descriptor')}finally{fs.closeSync(fd)}
 const beforeOpen=openPids(db);if(beforeOpen.length)throw Error('History is open by another process');
 const beforeStat=fs.statSync(db,{bigint:true}), before=hash(db);checkNoSidecars(db);
 const uri=pathToFileURL(db).href+'?mode=ro&immutable=1';
 const sql="PRAGMA quick_check; SELECT count(*) FROM urls WHERE instr(url, 'synthetic-private-') > 0;";
 const result=spawnSync('/usr/bin/sqlite3',['-readonly',uri,sql],{encoding:'utf8',timeout:15000});
 if(result.error||result.status!==0||(result.stderr||'').trim())throw Error(`Immutable History read failed: ${result.error?.message||result.stderr||result.status}`);
 const lines=(result.stdout||'').trim().split('\n');
 if(lines.length!==2||lines[0]!=='ok'||!/^\d+$/.test(lines[1]))throw Error('Unexpected History integrity or query result');
 const count=Number(lines[1]);if(!Number.isSafeInteger(count))throw Error('History count outside safe range');
 checkNoSidecars(db);const after=hash(db),afterStat=fs.statSync(db,{bigint:true});
 if(before!==after||['dev','ino','size','mtimeNs','ctimeNs'].some(k=>beforeStat[k]!==afterStat[k]))throw Error('History changed during immutable read');
 if(openPids(db).length)throw Error('History opened during or after immutable read');
 for(const name of ['SingletonLock','SingletonSocket','SingletonCookie'])if(!absent(path.join(profile,name)))throw Error(`Profile singleton artifact appeared: ${name}`);
 return {method:'immutable read-only, clean closed owned fixture',quickCheck:lines[0],privateMarkerCount:count,sha256Before:before,sha256After:after,sidecarsAbsent:['-wal','-shm','-journal'],lsofSelfCheck:true,observedOpenPidsBefore:0,observedOpenPidsAfter:0};
}
