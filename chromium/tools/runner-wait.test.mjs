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
