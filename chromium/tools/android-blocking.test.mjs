// The blocking check (tests/android/blocking.mjs) fails on each way a page can be wrong.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {blockingProblems} from '../tests/android/blocking.mjs';

const good = {requests: ['news.example/ads', 'lib.example/lib.js'], libLoaded: true, hidden: true};

test('a page that blocked the ad and loaded the rest passes', () => {
  assert.deepEqual(blockingProblems(good), []);
});

test('each failure is reported', () => {
  assert.equal(blockingProblems({...good, requests: [...good.requests, 'ad.doubleclick.net/tag.js']}).length, 1);
  assert.equal(blockingProblems({...good, requests: ['news.example/ads']}).length, 1);
  assert.equal(blockingProblems({...good, libLoaded: false}).length, 1);
  assert.equal(blockingProblems({...good, hidden: false}).length, 1);
});

test('every preference the shared blocker reads is registered on Android', () => {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const dir = path.join(root, 'blanc/services/blocker');
  const source = fs.readdirSync(dir).filter(f => /\.(cc|inc)$/.test(f)).map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
  const prefs = [...source.matchAll(/"(blanc\.[a-z_.]+)"/g)].map(m => m[1]);
  assert.ok(prefs.length >= 3);
  // Desktop registers these in its own patches; an unregistered preference crashes on first use.
  const patch = fs.readFileSync(path.join(root, 'patches/android/0106-android-blocker.patch'), 'utf8');
  for (const pref of new Set(prefs)) assert.ok(patch.includes(`"${pref}"`), `${pref} isn't registered in patch 0106`);
});
