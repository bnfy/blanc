// Unit checks of extracted pure orchestration with fake tasks/listeners only.
// No fixture import, browser, or network socket is opened.
import fs from 'node:fs';import assert from 'node:assert/strict';import vm from 'node:vm';
const s=fs.readFileSync(new URL('./private-search-diagnostic-v5.mjs',import.meta.url),'utf8');
const start=s.indexOf('async function timedOutcome('),end=s.indexOf('\nfunction inventory(',start);assert.ok(start>=0&&end>start);
const {boundedSample,closeOwned}=vm.runInNewContext(`${s.slice(start,end)}\n({boundedSample,closeOwned})`,{setTimeout,clearTimeout,Promise,Error});
let stages=0;
const normal=await boundedSample(async check=>{check();stages++;await Promise.resolve();check();stages++;return 42},100);assert.equal(normal.kind,'value');assert.equal(normal.value,42);assert.equal(stages,2);
stages=0;
const cancelled=await boundedSample(async check=>{check();stages++;await new Promise(resolve=>setTimeout(resolve,40));check();stages++;return 1},5);
assert.equal(cancelled.kind,'timeout');assert.equal(cancelled.settled,true);assert.equal(stages,1,'cancelled chain must not send a later step');
const inactive=await closeOwned({listening:false},new Set());assert.equal(inactive.closed,true);assert.equal(inactive.forced,false);
let callback,destroyed=false;const listener={listening:true,close(cb){callback=cb}};const socket={destroy(){destroyed=true;callback()}};
const closed=await closeOwned(listener,new Set([socket]));assert.equal(closed.closed,true);assert.equal(closed.forced,true);assert.equal(destroyed,true);
assert.ok(s.includes("if(!sampleResult.settled){proof.pendingCdpDuringCleanup=true"));assert.ok(s.includes('if(proof.pendingCdpDuringCleanup){for(const c of clients)c.close?.()'));
console.log('PASS isolated cancellation, no later step, signal fallback and bounded owned listener cleanup; no fixture/browser run');
