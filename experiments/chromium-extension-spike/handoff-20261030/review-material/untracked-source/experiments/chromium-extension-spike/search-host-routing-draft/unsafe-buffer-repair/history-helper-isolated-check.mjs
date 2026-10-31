// Synthetic temp databases only. Does not open any product or fixture profile.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {pathToFileURL} from 'node:url';
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'blanc-history-unit-')));
try{
 const helper=path.join(root,'owned-history-readonly.mjs');fs.copyFileSync(new URL('./owned-history-readonly.mjs',import.meta.url),helper);
 const {readClosedOwnedHistory}=await import(pathToFileURL(helper).href);
 const profile=path.join(root,'local-profile-unit');fs.mkdirSync(path.join(profile,'Default'),{recursive:true});const db=path.join(profile,'Default','History');
 let create=spawnSync('/usr/bin/sqlite3',[db,"PRAGMA journal_mode=WAL; CREATE TABLE urls(url TEXT); INSERT INTO urls VALUES('http://127.0.0.1/public'); PRAGMA wal_checkpoint(TRUNCATE);"],{encoding:'utf8'});assert.equal(create.status,0,create.stderr);
 assert.ok(create.stdout.trim().endsWith('0|0|0'),'synthetic checkpoint must complete');
 if(fs.existsSync(db+'-wal')){assert.equal(fs.statSync(db+'-wal').size,0);fs.unlinkSync(db+'-wal')}
 if(fs.existsSync(db+'-shm'))fs.unlinkSync(db+'-shm');
 assert.equal(fs.readFileSync(db)[18],2,'synthetic WAL-mode header');
 const state={regularExit:true,privateExit:true},result=readClosedOwnedHistory(profile,state);
 assert.equal(result.quickCheck,'ok');assert.equal(result.privateMarkerCount,0);assert.equal(result.sha256Before,result.sha256After);assert.equal(result.lsofSelfCheck,true);
 assert.throws(()=>readClosedOwnedHistory(profile,{regularExit:true,privateExit:false}),/exited normally/);
 fs.writeFileSync(db+'-wal','synthetic');assert.throws(()=>readClosedOwnedHistory(profile,state),/sidecar present/);fs.unlinkSync(db+'-wal');
 fs.symlinkSync('missing-target',db+'-shm');assert.throws(()=>readClosedOwnedHistory(profile,state),/sidecar present/);fs.unlinkSync(db+'-shm');
 const fd=fs.openSync(db,'r');try{assert.throws(()=>readClosedOwnedHistory(profile,state),/open by another process/)}finally{fs.closeSync(fd)}
 fs.symlinkSync('stale-test',path.join(profile,'SingletonLock'));assert.throws(()=>readClosedOwnedHistory(profile,state),/singleton artifact/);fs.unlinkSync(path.join(profile,'SingletonLock'));
 const insert=spawnSync('/usr/bin/sqlite3',[db,"INSERT INTO urls VALUES('http://127.0.0.1/?q=synthetic-private-marker'); PRAGMA wal_checkpoint(TRUNCATE);"],{encoding:'utf8'});assert.equal(insert.status,0,insert.stderr);assert.ok(insert.stdout.trim().endsWith('0|0|0'));
 if(fs.existsSync(db+'-wal')){assert.equal(fs.statSync(db+'-wal').size,0);fs.unlinkSync(db+'-wal')}
 if(fs.existsSync(db+'-shm'))fs.unlinkSync(db+'-shm');
 assert.equal(readClosedOwnedHistory(profile,state).privateMarkerCount,1,'synthetic private marker must be detected');
 console.log('PASS synthetic WAL-mode immutable read, lsof observability/open-handle refusal, WAL and dangling-SHM refusal, singleton refusal, marker detection, exit flags and unchanged hashes; no browser or product fixture opened');
}finally{fs.rmSync(root,{recursive:true,force:true})}
