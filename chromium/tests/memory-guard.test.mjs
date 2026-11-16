import test from 'node:test';
import assert from 'node:assert/strict';
import {freePercent,awaitMemory} from './lib/memory-guard.mjs';
test('reads macOS free memory and refuses to launch under pressure',async()=>{
 assert.equal(freePercent('Pageouts: 1\n\nSystem-wide memory free percentage: 82%\n'),82);
 assert.equal(await awaitMemory({read:()=>'System-wide memory free percentage: 50%'}),50);
 await assert.rejects(()=>awaitMemory({timeout:0,read:()=>'System-wide memory free percentage: 9%'}),/only 9% memory free/);
});
