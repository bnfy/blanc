import test from 'node:test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { renderProgress } from './progress.mjs';
const tracker = () => ({ shippingCommit: 'shipping', scenarioIds: ['F1-1', 'F1-2', 'F1-3'], scenarioCases: {'F1-1':['case1'],'F1-2':['case2'],'F1-3':['case3']}, currentCandidates: { macos: { id: 'new' } }, baselines: {}, rows: [
  { id: 'F1', platformProgress: { macos: { stage: 'legacy-integrated-partial' }, windows: { stage: 'not-started' }, linux: { stage: 'not-started' }, android: { stage: 'not-started' } }, platformVerification: {} },
] });
test('unrun baselines are not reported as zero passing and platforms stay separate', () => {
  const text = renderProgress(tracker());
  assert.match(text, /\| macOS \| Not run \(3 cases\) \|/);
  assert.match(text, /\| Integrated, partial \(legacy\) \| 1 \| 0 \| 0 \|/);
  assert.match(text, /\| Not started \/ unassessed \| 0 \| 1 \| 1 \|/);
});
test('candidate changes invalidate previous baseline credit', () => {
  const t = tracker(); t.baselines.macos = 'old.json';
  const text = renderProgress(t, () => ({ candidate: 'old', platform: 'macos', shippingCommit: 'shipping', scenarios: [] }));
  assert.match(text, /previous baseline is stale/);
  assert.doesNotMatch(text, /0\/0 pass/);
});
test('only mapped current-candidate results contribute, with explicit exclusions', () => {
  const t = tracker(); t.baselines.macos = 'current.json';
  const text = renderProgress(t, () => ({ candidate: 'new', platform: 'macos', shippingCommit: 'shipping', scenarios: [
    { id: 'F1-1', featureRows: ['F1'], result: 'pass', cases:[{id:'case1',result:'pass'}] },
    { id: 'F1-2', featureRows: ['F1'], result: 'fail', cases:[{id:'case2',result:'fail'}] },
    { id: 'F1-3', featureRows: ['F1'], result: 'excluded', exclusionReason: 'mobile only', cases:[{id:'case3',result:'excluded'}] },
  ] }));
  assert.match(text, /1\/3 executable cases pass; 1 failed; 0 undefined\/not run; 1 excluded/);
});
test('an unmapped pass is rejected', () => {
  const t = tracker(); t.baselines.macos = 'current.json';
  assert.throws(() => renderProgress(t, () => ({ candidate: 'new', platform: 'macos', shippingCommit: 'shipping', scenarios: [{ id: 'unknown', featureRows: [], result: 'pass' }] })), /Unmapped/);
});
test('verified feature state requires evidence', () => {
  const t = tracker(); t.rows[0].platformProgress.macos.stage = 'verified';
  assert.throws(() => renderProgress(t), /Missing verification/);
});

test('an incomplete baseline cannot shrink the denominator', () => {
  const t = tracker(); t.baselines.macos = 'current.json';
  assert.throws(() => renderProgress(t, () => ({ candidate: 'new', platform: 'macos', shippingCommit: 'shipping', scenarios: [{ id: 'F1-1', featureRows: ['F1'], result: 'pass', cases:[{id:'case1',result:'pass'}] }] })), /full shipping scenario inventory/);
});

test('a declaration cannot pass by omitting a failing outline example', () => {
  const t=tracker(); t.baselines.macos='current.json'; t.scenarioCases['F1-1']=['case1','case1b'];
  assert.throws(()=>renderProgress(t,()=>({candidate:'new',platform:'macos',shippingCommit:'shipping',scenarios:[{id:'F1-1',featureRows:['F1'],result:'pass',cases:[{id:'case1',result:'pass'}]}]})),/example coverage/);
});

test('feature verification from a prior candidate is displayed as requiring recheck', () => {
  const t=tracker();t.rows[0].platformProgress.macos.stage='verified';t.rows[0].platformVerification.macos={candidate:'old',shippingCommit:'shipping'};
  const text=renderProgress(t);assert.match(text,/\| Verification needs recheck \| 1 \| 0 \| 0 \|/);assert.match(text,/\| Verified \| 0 \| 0 \| 0 \|/);
});

test('Bar A counts executable examples rather than declaration aggregates',()=>{
 const t=tracker();t.baselines.macos='current.json';t.scenarioCases['F1-1']=['case1','case1b'];
 const text=renderProgress(t,()=>({candidate:'new',platform:'macos',shippingCommit:'shipping',scenarios:[
  {id:'F1-1',featureRows:['F1'],result:'fail',cases:[{id:'case1',result:'pass'},{id:'case1b',result:'fail'}]},
  {id:'F1-2',featureRows:['F1'],result:'undefined',cases:[{id:'case2',result:'undefined'}]},
  {id:'F1-3',featureRows:['F1'],result:'excluded',exclusionReason:'mobile only',cases:[{id:'case3',result:'excluded',exclusionReason:'mobile only'}]},
 ]}));assert.match(text,/1\/4 executable cases pass/);assert.match(text,/4 executable cases from 3 declarations/);
});

test('matching a short candidate name cannot credit different artifact bytes',()=>{
 const t=tracker();t.currentCandidates.macos.frameworkSha256='expected';t.baselines.macos='current.json';
 const text=renderProgress(t,()=>({candidate:'new',candidateIdentity:{frameworkSha256:'different'},platform:'macos',shippingCommit:'shipping',scenarios:[]}));assert.match(text,/previous baseline is stale/);
});
test('S1 rows get their own line and development subsets never count', () => {
  const t = tracker(); t.baselines.macos = 'current.json'; t.rows[0].slice = 'S1';
  const baseline = { candidate: 'new', platform: 'macos', shippingCommit: 'shipping', scenarios: [
    { id: 'F1-1', featureRows: ['F1'], result: 'pass', cases:[{id:'case1',result:'pass'}] },
    { id: 'F1-2', featureRows: ['F1'], result: 'fail', cases:[{id:'case2',result:'fail'}] },
    { id: 'F1-3', featureRows: ['F1'], result: 'undefined', cases:[{id:'case3',result:'undefined'}] },
  ] };
  assert.match(renderProgress(t, () => baseline), /S1 rows: 1\/3 pass; 1 failed; 1 undefined; 0 excluded/);
  assert.throws(() => renderProgress(t, () => ({ ...baseline, developmentSubset: 'F1' })), /development subset/);
});
test('every tracker row carries an android platform', () => {
  const real = JSON.parse(fs.readFileSync(new URL('../tracker.json', import.meta.url)));
  for (const row of real.rows) {
    assert.ok(row.platformProgress.android?.stage, `${row.id} has no android stage`);
    assert.ok('android' in row.platformVerification, `${row.id} has no android verification slot`);
    assert.deepEqual(Object.keys(row.platformProgress), ['macos', 'windows', 'linux', 'android']);
  }
});
test('bar B gives android its own column and leaves desktop columns alone', () => {
  const t = tracker(); t.rows[0].platformProgress.android.stage = 'implemented';
  const text = renderProgress(t);
  assert.match(text, /\| State \| macOS \| Windows \| Linux \| Android \|/);
  assert.match(text, /\| Implemented \| 0 \| 0 \| 0 \| 1 \|/);
  assert.match(text, /\| Integrated, partial \(legacy\) \| 1 \| 0 \| 0 \| 0 \|/);
  assert.match(text, /Android: none\./);
});
test('bar A stays desktop-only until android has its own case set', () => {
  const text = renderProgress(tracker());
  assert.doesNotMatch(text, /\| Android \| Not run/);
  assert.match(text, /Android's Bar A/);
});
test('a row without an android stage is refused', () => {
  const t = tracker(); delete t.rows[0].platformProgress.android;
  assert.throws(() => renderProgress(t), /android stage for F1/);
});

import { windowsCandidate, trackerText } from './progress.mjs';
test('a Windows candidate is recorded from its packaging record, and only when its id matches its chrome.dll', () => {
  const dll = 'ab'.repeat(32), exe = 'cd'.repeat(32);
  const record = { id: 'windows-x64-abababababababab', exeSha256: exe, dllSha256: dll, version: '158.0.8127.2', treeCommit: 'f'.repeat(40), zipSha256: 'x', files: 3 };
  assert.deepEqual(windowsCandidate(record), { id: record.id, exeSha256: exe, dllSha256: dll, version: '158.0.8127.2', treeCommit: 'f'.repeat(40),
    qualification: 'cross-compiled candidate; runtime acceptance pending' });
  assert.throws(() => windowsCandidate({ ...record, id: 'windows-x64-0000000000000000' }), /does not match/);
  assert.throws(() => windowsCandidate({ ...record, id: 'macos-abababababababab' }), /does not match/);
  for (const key of ['id', 'exeSha256', 'dllSha256', 'version', 'treeCommit']) assert.throws(() => windowsCandidate({ ...record, [key]: undefined }), new RegExp(key));
  assert.throws(() => windowsCandidate(null));
});
test('the tracker is written ASCII-only, byte for byte as it is kept', () => {
  assert.equal(trackerText({ a: 'F2-1\u20134 \u2318 \ud83d\ude00', b: [1] }), '{\n  "a": "F2-1\\u20134 \\u2318 \\ud83d\\ude00",\n  "b": [\n    1\n  ]\n}\n');
  const file = new URL('../tracker.json', import.meta.url);
  assert.equal(trackerText(JSON.parse(fs.readFileSync(file, 'utf8'))), fs.readFileSync(file, 'utf8'));
});

test('Linux tracker records require an ID derived from chrome', async () => {
  const { linuxCandidate } = await import('./progress.mjs');
  const record = { id: 'linux-x64-abababababababab', exeSha256: 'ab'.repeat(32), version: '158.0.8127.2', treeCommit: 'f'.repeat(40) };
  const tracked = linuxCandidate({ ...record, files: 17 });
  for (const [key, value] of Object.entries(record)) assert.equal(tracked[key], value);
  assert.equal(tracked.files, undefined);
  for (const id of ['windows-x64-abababababababab', 'linux-x64-0000000000000000']) {
    assert.throws(() => linuxCandidate({ ...record, id }), /does not match/);
  }
  for (const key of Object.keys(record)) assert.throws(() => linuxCandidate({ ...record, [key]: undefined }));
});

test('a stale Linux executable hash invalidates baseline credit', () => {
  const t = tracker();
  t.currentCandidates.linux = { id: 'linux-x64-abababababababab', exeSha256: 'ab'.repeat(32) };
  t.baselines.linux = 'linux.json';
  const baseline = { platform: 'linux', shippingCommit: t.shippingCommit, candidate: t.currentCandidates.linux.id,
    candidateIdentity: { id: t.currentCandidates.linux.id, executableSha256: 'ab'.repeat(8) + 'cd'.repeat(24), singleBinary: true }, scenarios: [] };
  assert.match(renderProgress(t, () => baseline), /Linux x64 \| Not run for current candidate \(previous baseline is stale\)/);
});

const linuxCandidates = {
  x64: {id:'linux-x64-' + 'a'.repeat(16), exeSha256:'a'.repeat(64)},
  arm64: {id:'linux-arm64-' + 'b'.repeat(16), exeSha256:'b'.repeat(64)},
};

test('Linux verification needs a current receipt for each architecture', () => {
  for (const [stage,label] of [['verified','Verified'],['release-ready','Release-ready']]) {
    const t = tracker(), row = t.rows[0];
    t.currentCandidates.linux = {...linuxCandidates};
    row.platformProgress.linux.stage = stage;
    const verification = row.platformVerification;
    const receipt = arch => ({candidate:linuxCandidates[arch].id, shippingCommit:t.shippingCommit});
    const counted = text => text.includes(`| ${label} | 0 | 0 | 1 |`);
    verification.linux = receipt('x64');  // legacy single receipt
    assert.equal(counted(renderProgress(t)), false);
    verification.linux = {x64:receipt('x64')};
    assert.equal(counted(renderProgress(t)), false);
    verification.linux.arm64 = receipt('x64');
    assert.equal(counted(renderProgress(t)), false);
    verification.linux = {x64:receipt('x64'), arm64:receipt('arm64')};
    assert.equal(counted(renderProgress(t)), true);
    verification.linux.arm64.shippingCommit = 'old';
    assert.equal(counted(renderProgress(t)), false);
    verification.linux.arm64 = receipt('arm64');
    t.currentCandidates.linux.arm64 = {id:'linux-arm64-new'};
    const changed = renderProgress(t);
    assert.equal(counted(changed), false);
    assert.match(changed, /\| Verification needs recheck \| 0 \| 0 \| 1 \|/);
    assert.match(changed, /\| Requirement \| Linux x64 receipt \| Linux arm64 receipt \|/);
    assert.ok(changed.includes(`| F1 | ${linuxCandidates.x64.id} (current) | ${linuxCandidates.arm64.id} (stale) |`));
    delete t.currentCandidates.linux.arm64;
    assert.equal(counted(renderProgress(t)), false);
  }
});

test('an unverified Linux row can start with empty architecture receipt slots', () => {
  const t = tracker();
  t.rows[0].platformVerification.linux = {x64:null, arm64:null};
  assert.doesNotMatch(renderProgress(t), /Linux x64 receipt/);
});

test('each Linux baseline is credited only in its architecture and against its own executable', () => {
  const t = tracker();
  t.currentCandidates.linux = linuxCandidates;
  t.baselines.linux = {x64:'x.json',arm64:'arm.json'};
  const baseline = arch => ({arch,platform:'linux',candidate:linuxCandidates[arch].id,
    shippingCommit:t.shippingCommit,archiveExecutableSha256:linuxCandidates[arch].exeSha256,
    scenarios:t.scenarioIds.map(id=>({id,featureRows:['F1'],result:'pass',cases:[{id:t.scenarioCases[id][0],result:'pass'}]}))});
  const reports = {'x.json':baseline('x64'), 'arm.json':baseline('arm64')};
  const render = () => renderProgress(t, ref=>reports[ref]);
  for (const arch of ['x64','arm64']) assert.ok(render().includes(`| Linux ${arch} | 3/3 executable cases pass`));
  reports['arm.json'].arch = 'x64';
  assert.match(render(), /Linux arm64 \| Not run for current candidate/);
  reports['arm.json'] = reports['x.json'];
  assert.match(render(), /Linux arm64 \| Not run for current candidate/);
  assert.match(render(), /Linux x64 \| 3\/3 executable cases pass/);
  t.baselines.linux = 'x.json'; // L0 had a single x64 report and no arch field.
  delete reports['x.json'].arch;
  assert.match(render(), /Linux x64 \| 3\/3 executable cases pass/);
  assert.match(render(), /Linux arm64 \| Not run \(3 cases\)/);
});
