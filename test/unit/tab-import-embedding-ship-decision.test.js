'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..', '..');
const decision = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'tab-import/embedding-ship-decision.json'), 'utf8'),
);
const benchmark = fs.readFileSync(
  path.join(ROOT, 'docs/superpowers/specs/2026-08-23-tab-import-embedding-benchmark.md'),
  'utf8',
);

test('embedding ship decision locks folder-only until packaging gate passes', () => {
  assert.equal(decision.version, 1);
  assert.equal(decision.shipOnDeviceEmbeddings, false);
  assert.match(decision.reason, /30\.04 MiB/);
  assert.equal(
    decision.selectedCandidate.onnxSha256,
    '883a0fa38c9a52de26265c3d34b611360cc5b871328af80372245ae9c9a9b0a3',
  );
});

test('benchmark report documents deferred worker tasks', () => {
  assert.match(benchmark, /Tasks 16–17/);
  assert.match(benchmark, /paraphrase-MiniLM-L3-v2/);
  assert.match(benchmark, /30\.04 MiB/);
});
