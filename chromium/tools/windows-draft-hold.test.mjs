// One exclusive hold on the Windows candidate draft (docs/superpowers/plans/
// 2026-11-21-windows-nightly.md, Task 3).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {HOLD_ASSET, assertDraft, acquireHold, readHold, uploadUnderHold, releaseHold, breakHold} from '../windows/draft-hold.mjs';

// A fake GitHub draft: assets by name, each with a numeric API URL; uploads
// without --clobber fail on an existing name, as GitHub's do.
function fakeDraft({isDraft = true} = {}) {
  const state = {isDraft, assets: new Map(), next: 1, calls: []};
  const exec = (command, args) => {
    state.calls.push([command, ...args]);
    if (command !== 'gh') return {status: 1, stdout: '', stderr: 'unexpected'};
    if (args[0] === 'release' && args[1] === 'view') {
      if (args.includes('isDraft')) return {status: 0, stdout: String(state.isDraft), stderr: ''};
      return {status: 0, stdout: JSON.stringify({assets: [...state.assets.values()].map(a => ({name: a.name, apiUrl: a.apiUrl}))}), stderr: ''};
    }
    if (args[0] === 'release' && args[1] === 'upload') {
      const file = args[3], name = path.basename(file), clobber = args.includes('--clobber');
      if (state.assets.has(name) && !clobber) return {status: 1, stdout: '', stderr: 'already exists'};
      const apiUrl = `https://api.github.com/repos/bnfy/blanc/releases/assets/${state.next++}`;
      state.assets.set(name, {name, apiUrl, body: fs.readFileSync(file, 'utf8')});
      return {status: 0, stdout: '', stderr: ''};
    }
    if (args[0] === 'api') {
      const url = args.find(a => a.startsWith('https://'));
      const asset = [...state.assets.values()].find(a => a.apiUrl === url);
      if (args.includes('DELETE')) {
        if (!asset) return {status: 1, stdout: '', stderr: 'not found'};
        state.assets.delete(asset.name);
        return {status: 0, stdout: '', stderr: ''};
      }
      return asset ? {status: 0, stdout: asset.body, stderr: ''} : {status: 1, stdout: '', stderr: 'not found'};
    }
    return {status: 1, stdout: '', stderr: 'unexpected gh call'};
  };
  return {state, io: {exec}};
}

test('one hold at a time: a second acquisition fails and deletes nothing', () => {
  const {state, io} = fakeDraft();
  const first = acquireHold(io, 'nightly', 'night 1');
  assert.match(first.owner, /^[0-9a-f]{32}$/);
  assert.throws(() => acquireHold(io, 'release', 'prep'), /held/);
  assert.equal(readHold(io).body.owner, first.owner);
  assert.ok(!state.calls.some(call => call.includes('DELETE')));
});

test('racing acquisitions leave exactly one owner', () => {
  const {io} = fakeDraft();
  const results = [];
  for (const kind of ['nightly', 'release']) {
    try { results.push(acquireHold(io, kind, 'race').owner); } catch { results.push(null); }
  }
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal(readHold(io).body.owner, results.find(Boolean));
});

test('releasing deletes only one\'s own hold, so a successor\'s survives', () => {
  const {io} = fakeDraft();
  const mine = acquireHold(io, 'nightly', 'n');
  assert.equal(releaseHold(io, 'someone-else'), false);
  assert.ok(readHold(io));
  assert.equal(releaseHold(io, mine.owner), true);
  assert.equal(readHold(io), null);
  const successor = acquireHold(io, 'release', 'r');
  assert.equal(releaseHold(io, mine.owner), false, 'a stale owner cannot release the successor');
  assert.equal(readHold(io).body.owner, successor.owner);
});

test('uploads need a draft and the uploader\'s own hold', () => {
  const {state, io} = fakeDraft();
  const temp = fs.mkdtempSync(path.join(fs.realpathSync('/tmp'), 'hold-test-'));
  const zip = path.join(temp, 'anything.zip');
  fs.writeFileSync(zip, 'bytes');
  const {owner} = acquireHold(io, 'nightly', 'n');
  uploadUnderHold(io, owner, zip, 'blanc-windows-prototype.zip');
  assert.ok(state.assets.has('blanc-windows-prototype.zip'));
  assert.throws(() => uploadUnderHold(io, 'other', zip, 'blanc-windows-candidate.zip'), /held by another/);
  state.isDraft = false;
  assert.throws(() => uploadUnderHold(io, owner, zip, 'blanc-windows-candidate.zip'), /draft/);
  assert.throws(() => assertDraft(io), /draft/);
  fs.rmSync(temp, {recursive: true});
});

test('breaking a nightly hold refuses while that night is alive, and a release hold needs its work folder', () => {
  const {io} = fakeDraft();
  acquireHold(io, 'nightly', 'n');
  assert.throws(() => breakHold(io, {nightAlive: () => true}), /night is still running/);
  assert.equal(breakHold(io, {nightAlive: () => false}).kind, 'nightly');
  assert.equal(readHold(io), null);
  acquireHold(io, 'release', 'r');
  assert.throws(() => breakHold(io, {nightAlive: () => false}), /work folder/);
});

test('ship-candidate.sh uploads only through the hold', () => {
  const script = fs.readFileSync(fileURLToPath(new URL('../windows/ship-candidate.sh', import.meta.url)), 'utf8');
  assert.match(script, /BLANC_DRAFT_HOLD_OWNER/);
  assert.match(script, /draft-hold\.mjs" upload/);
  assert.doesNotMatch(script, /gh release upload/);
  assert.equal(HOLD_ASSET, 'draft-hold.json');
});
