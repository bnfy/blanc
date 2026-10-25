'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { runSpaceMove, appendTabToCapture, emptiedCapture } = require('../../src/main/space-move');

// An adapter that logs every step and fails the ones it is told to.
function adapter(fail = {}) {
  const calls = [];
  const step = (name, value) => () => {
    calls.push(name);
    if (fail[name] === 'throw') throw new Error(`${name} failed`);
    return typeof fail[name] === 'function' ? fail[name]() : (fail[name] ?? value);
  };
  return {
    calls,
    check: step('check', { ok: true }),
    prepare: step('prepare', { ok: true, next: { urls: ['https://a.test/'] } }),
    discard: step('discard'),
    write: step('write', { ok: true }),
    transfer: step('transfer'),
    reconcile: step('reconcile', false),
    rewrite: step('rewrite', { ok: true }),
    finish: step('finish'),
  };
}

test('a clean move writes the record before transferring, and only then succeeds', () => {
  const a = adapter();
  assert.deepEqual(runSpaceMove(a), { ok: true });
  assert.deepEqual(a.calls, ['check', 'prepare', 'write', 'transfer', 'finish']);
});

test('a refused move touches nothing', () => {
  const a = adapter({ check: { ok: false, error: 'refused' } });
  assert.deepEqual(runSpaceMove(a), { ok: false, error: 'refused', moved: false });
  assert.deepEqual(a.calls, ['check']);
});

test('a failed write moves nothing and drops what prepare set aside', () => {
  const a = adapter({ write: { ok: false, error: 'storage-failed' } });
  assert.deepEqual(runSpaceMove(a), { ok: false, error: 'storage-failed', moved: false });
  assert.deepEqual(a.calls, ['check', 'prepare', 'write', 'discard']);
  // A write that throws is the same failure.
  const b = adapter({ write: 'throw' });
  assert.equal(runSpaceMove(b).error, 'storage-failed');
  assert.equal(b.calls.includes('transfer'), false);
});

test('a prepare that fails (or throws) is discarded before any write', () => {
  for (const prepare of [{ ok: false, error: 'not-found' }, 'throw']) {
    const a = adapter({ prepare });
    const result = runSpaceMove(a);
    assert.equal(result.ok, false);
    assert.equal(result.moved, false);
    assert.deepEqual(a.calls, ['check', 'prepare', 'discard']);
  }
});

test('a transfer that throws is reconciled and the record rewritten; never reported as success', () => {
  const a = adapter({ transfer: 'throw', reconcile: false });
  assert.deepEqual(runSpaceMove(a), { ok: false, error: 'move-failed', moved: false, recorded: true });
  assert.deepEqual(a.calls, ['check', 'prepare', 'write', 'transfer', 'reconcile', 'rewrite']);
  // The transfer reached the space before throwing: it moved, still not ok.
  const b = adapter({ transfer: 'throw', reconcile: true });
  assert.deepEqual(runSpaceMove(b), { ok: false, error: 'move-failed', moved: true, recorded: true });
});

test('when the transfer and the recovery write both fail, the result says the record was not corrected', () => {
  const a = adapter({ transfer: 'throw', rewrite: { ok: false, error: 'storage-failed' } });
  assert.deepEqual(runSpaceMove(a), { ok: false, error: 'move-failed', moved: false, recorded: false });
  const b = adapter({ transfer: 'throw', reconcile: 'throw', rewrite: 'throw' });
  assert.deepEqual(runSpaceMove(b), { ok: false, error: 'move-failed', moved: false, recorded: false });
});

test('housekeeping after a clean transfer cannot turn a saved move into a failure', () => {
  assert.deepEqual(runSpaceMove(adapter({ finish: 'throw' })), { ok: true });
});

const entry = { url: 'https://b.test/', pinned: true, meta: { title: 'B', favicon: null }, localFile: false, inheritsDocumentPolicy: false };

test('appendTabToCapture adds one ungrouped entry and keeps every column zipped', () => {
  const capture = {
    urls: ['https://a.test/'], groupIds: ['g1'], pinned: [false], meta: [{ title: 'A', favicon: null }],
    groups: [{ id: 'g1', name: 'Read' }], splits: [], splitIds: [null],
    documentPolicy: 1, inheritsDocumentPolicy: [true], activeIndex: 0, sectionOrder: true,
  };
  const next = appendTabToCapture(capture, entry);
  assert.deepEqual(next.urls, ['https://a.test/', 'https://b.test/']);
  assert.deepEqual(next.groupIds, ['g1', null]);
  assert.deepEqual(next.pinned, [false, true]);
  assert.deepEqual(next.meta.map((m) => m.title), ['A', 'B']);
  assert.deepEqual(next.splitIds, [null, null]);
  assert.deepEqual(next.inheritsDocumentPolicy, [true, false]);
  assert.deepEqual(next.groups, capture.groups);
  assert.equal(next.activeIndex, 0);
  assert.equal('localFiles' in next, false);
  assert.deepEqual(capture.urls, ['https://a.test/'], 'the base capture is not modified');
});

test('appendTabToCapture starts the local-file column only when it is needed', () => {
  const capture = { urls: ['https://a.test/'], groupIds: [null], pinned: [false], meta: [{}] };
  assert.deepEqual(appendTabToCapture(capture, { ...entry, localFile: true }).localFiles, [false, true]);
  assert.deepEqual(appendTabToCapture({ ...capture, localFiles: [true] }, entry).localFiles, [true, false]);
});

test('emptiedCapture drops the stand-in start page and everything tied to tab positions', () => {
  const base = {
    urls: ['blanc://newtab/'], groupIds: [null], pinned: [false], meta: [{}], groups: [], activeIndex: 0,
    closedSlot: 1, closedIndex: 1, localFiles: [false], documentPolicy: 1, inheritsDocumentPolicy: [false], sectionOrder: true,
  };
  const next = appendTabToCapture(emptiedCapture(base), entry);
  assert.deepEqual(next.urls, ['https://b.test/']);
  assert.deepEqual(next.inheritsDocumentPolicy, [false]);
  for (const key of ['closedSlot', 'closedIndex', 'localFiles']) assert.equal(key in next, false, key);
  assert.equal(next.documentPolicy, 1);
});


test('failed reconciliation preserves the write-ahead record without attempting a rewrite', () => {
  const a = adapter({ transfer: 'throw', reconcile: 'throw' });
  assert.deepEqual(runSpaceMove(a), { ok: false, error: 'move-failed', moved: false, recorded: false });
  assert.deepEqual(a.calls, ['check', 'prepare', 'write', 'transfer', 'reconcile']);
});

test('a fresh process recovers the saved tab after transfer and reconciliation both fail', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const { spawnSync } = require('node:child_process');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-move-restart-'));
  const file = path.join(dir, 'target.json');
  try {
    fs.writeFileSync(file, JSON.stringify({ urls: [] }));
    const run = spawnSync(process.execPath, ['-e', `
      const fs = require('node:fs');
      const { runSpaceMove } = require(process.argv[1]);
      const file = process.argv[2];
      const result = runSpaceMove({
        check: () => ({ ok: true }),
        prepare: () => ({ ok: true, next: { urls: ['https://recover.test/'] } }),
        discard() {},
        write(next) {
          const fd = fs.openSync(file, 'w');
          fs.writeFileSync(fd, JSON.stringify(next));
          fs.fsyncSync(fd);
          fs.closeSync(fd);
          return { ok: true };
        },
        transfer() { throw new Error('transfer fault'); },
        reconcile() { throw new Error('reconciliation fault'); },
        rewrite() {
          fs.writeFileSync(file, JSON.stringify({ urls: [] }));
          return { ok: true };
        },
        finish() {},
      });
      if (result.ok || result.recorded) process.exit(2);
      process.kill(process.pid, 'SIGKILL');
    `, require.resolve('../../src/main/space-move'), file], { encoding: 'utf8' });
    assert.equal(run.signal, 'SIGKILL', run.stderr);
    // A separate process reads only durable bytes, with no module cache or
    // in-memory tab state from the failed transfer.
    const restarted = spawnSync(process.execPath, ['-e',
      "process.stdout.write(require('node:fs').readFileSync(process.argv[1], 'utf8'))", file], { encoding: 'utf8' });
    assert.equal(restarted.status, 0, restarted.stderr);
    assert.deepEqual(JSON.parse(restarted.stdout).urls, ['https://recover.test/']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
