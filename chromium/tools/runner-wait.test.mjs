import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
test('native watchdog extends only a bounded, idle scheduler wait',()=>{
 const root=fileURLToPath(new URL('../',import.meta.url));
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'blanc-runner-wait-'));
 try {
  const source=path.join(dir,'wait.cc'),binary=path.join(dir,'wait');
  fs.writeFileSync(source,`
#include "blanc/browser/sync/runner_wait.h"
#include <cassert>
#include <limits>
using blanc::sync_merge::RunnerQueueWaitMs;
int main() {
 assert(RunnerQueueWaitMs(7,0,61000,1000,90000)==65000);
 assert(RunnerQueueWaitMs(1,0,31000,1000,5000)==5000);
 assert(RunnerQueueWaitMs(0,0,61000,1000,90000)==0);
 assert(RunnerQueueWaitMs(7,1,61000,1000,90000)==0);
 assert(RunnerQueueWaitMs(7,-1,61000,1000,90000)==0);
 assert(RunnerQueueWaitMs(7,0,1000,1000,90000)==0);
 assert(RunnerQueueWaitMs(7,0,999,1000,90000)==0);
 assert(RunnerQueueWaitMs(7,0,61001,1000,90000)==0);
 assert(RunnerQueueWaitMs(7,0,61000,1000,0)==0);
 assert(RunnerQueueWaitMs(7,0,61000,1000,-1)==0);
 assert(RunnerQueueWaitMs(7,0,std::numeric_limits<double>::infinity(),1000,90000)==0);
 assert(RunnerQueueWaitMs(7,0,std::numeric_limits<double>::quiet_NaN(),1000,90000)==0);
 assert(RunnerQueueWaitMs(7,0,61000,1000,std::numeric_limits<double>::infinity())==0);
}
`);
  const built=spawnSync('clang++',['-std=c++20','-Wall','-Wextra','-Werror','-I',root,source,'-o',binary],{encoding:'utf8'});
  assert.equal(built.status,0,built.stderr);
  const run=spawnSync(binary,[],{encoding:'utf8'});assert.equal(run.status,0,run.stderr);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

// A serialized call that timed out holds the lane until its late reply. A call
// that never answers (beta.2: Settings said "Could not check sync" until the
// app was restarted) must not hold it for the life of the process.
test('a timed-out lane is released by an idle runner or the ceiling, never by a busy one',()=>{
 const root=fileURLToPath(new URL('../',import.meta.url));
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'blanc-lane-release-'));
 try {
  const source=path.join(dir,'lane.cc'),binary=path.join(dir,'lane');
  fs.writeFileSync(source,`
#include "blanc/browser/sync/runner_wait.h"
#include <cassert>
#include <limits>
using blanc::sync_merge::RunnerQueueIdle;
using blanc::sync_merge::ReleaseTimedOutLane;
int main() {
 assert(RunnerQueueIdle(0,0,false));
 assert(!RunnerQueueIdle(1,0,false));
 assert(!RunnerQueueIdle(0,1,false));
 assert(!RunnerQueueIdle(0,0,true));
 assert(!RunnerQueueIdle(-1,0,false));
 assert(!RunnerQueueIdle(0,-1,false));
 // One idle answer can be the gap between two requests of one pass.
 assert(!ReleaseTimedOutLane(0,20000));
 assert(!ReleaseTimedOutLane(1,20000));
 assert(ReleaseTimedOutLane(2,20000));
 assert(ReleaseTimedOutLane(3,20000));
 // A busy but answering runner keeps the lane until no call can still be running.
 assert(!ReleaseTimedOutLane(0,299999));
 assert(ReleaseTimedOutLane(0,300000));
 assert(!ReleaseTimedOutLane(2,-1));
 assert(!ReleaseTimedOutLane(2,std::numeric_limits<double>::quiet_NaN()));
 assert(!ReleaseTimedOutLane(0,std::numeric_limits<double>::infinity()));
}
`);
  const built=spawnSync('clang++',['-std=c++20','-Wall','-Wextra','-Werror','-I',root,source,'-o',binary],{encoding:'utf8'});
  assert.equal(built.status,0,built.stderr);
  const run=spawnSync(binary,[],{encoding:'utf8'});assert.equal(run.status,0,run.stderr);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
