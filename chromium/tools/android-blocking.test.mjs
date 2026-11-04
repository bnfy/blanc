// The blocking check (tests/android/blocking.mjs) fails on each way a page can be wrong.
import test from 'node:test';
import assert from 'node:assert/strict';
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
