import assert from 'node:assert/strict';
import test from 'node:test';
import { suiteArguments } from '../linux/run-suite.mjs';

test('a Linux suite run requires the f0 slice and accepts one nonempty filter', () => {
  assert.deepEqual(suiteArguments(['--slice=f0']), []);
  assert.deepEqual(suiteArguments(['--slice=f0', '--only=tab-groups']), ['--only=tab-groups']);
  for (const bad of [
    [], ['--slice=s1'], ['--slice=f0', '--only='], ['--slice=f0', '--only=a', '--only=b'],
    ['--slice=f0', '--case-list=x'], ['--only=a'], ['--slice=f0', '--slice=f0'],
  ]) assert.throws(() => suiteArguments(bad), undefined, bad.join(' '));
});

test('current Linux candidates are architecture-bound, including the original x64 tracker', async () => {
  const {byArchitecture, matchesLinuxCandidate} = await import('../linux/candidate.mjs');
  const records = {};
  for (const [arch, hex] of [['x64','1'], ['arm64','2']]) {
    const exeSha256 = hex.repeat(64);
    records[arch] = {id:'linux-' + arch + '-' + exeSha256.slice(0,16), exeSha256};
  }
  assert.deepEqual(byArchitecture(records.x64), {x64:records.x64});
  assert.deepEqual(byArchitecture(records), records);
  for (const arch of Object.keys(records)) {
    const {id:candidate, exeSha256:executableSha256} = records[arch];
    assert.equal(matchesLinuxCandidate(records, arch, {candidate,executableSha256}), true);
    assert.equal(matchesLinuxCandidate(records, arch, {candidate:candidate + '0',executableSha256}), false);
    assert.equal(matchesLinuxCandidate(records, arch, {candidate,executableSha256:executableSha256.slice(0,16)+'0'.repeat(48)}), false);
    assert.equal(matchesLinuxCandidate(records, arch === 'x64' ? 'arm64' : 'x64', {candidate,executableSha256}), false);
  }
});

test('one full S1 report per architecture and no subset can replace it', async t => {
  const fs = await import('node:fs'), os = await import('node:os'), path = await import('node:path');
  const {writeSuiteReport} = await import('../linux/run-suite.mjs');
  const out = fs.mkdtempSync(path.join(os.tmpdir(),'linux-reports-'));
  t.after(() => fs.rmSync(out,{recursive:true,force:true}));
  for (const arch of ['arm64','x64']) {
    const baseline = {platform:'linux',arch,candidate:'linux-'+arch+'-123',scenarios:[]};
    writeSuiteReport(out, baseline);
    const file = path.join(out,'s1-linux-'+arch+'.json');
    assert.equal(JSON.parse(fs.readFileSync(file)).candidate,baseline.candidate);
    assert.throws(() => writeSuiteReport(out,baseline));
    assert.throws(() => writeSuiteReport(out,{...baseline,developmentSubset:'glance'}),/subset/i);
  }
});
test('2x comparison keeps only rerun cases and separates changed outcomes', async () => {
  const {compareLayoutRuns} = await import('../linux/run-suite.mjs');
  const run = (deviceScaleFactor,results) => ({platform:'linux',arch:'arm64',candidate:'arm',deviceScaleFactor,
    scenarios:[{cases:results.map((result,i)=>({id:String(i),result}))}]});
  const standard = run(1,['pass','pass','excluded']);
  const scaled = run(2,['pass','fail','not-run']);
  assert.deepEqual(compareLayoutRuns(standard,scaled),
    {candidate:'arm',arch:'arm64',compared:2,changes:[{id:'1',at1x:'pass',at2x:'fail'}]});
  assert.throws(()=>compareLayoutRuns(standard,{...scaled,candidate:'stale'}));
});
