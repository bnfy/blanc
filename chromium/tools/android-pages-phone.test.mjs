// The emulator check for Blanc's pages (tests/android/pages-phone.mjs) fails
// each way a page can be wrong on the phone.
import test from 'node:test';
import assert from 'node:assert/strict';
import {pageProblems} from '../tests/android/pages-phone.mjs';

const good = {url: 'chrome://blanc/history.html', bridge: true, platform: 'ios', lang: 'de', scrollWidth: 412, innerWidth: 412, errors: []};

test('a page in the phone layout, in its language, that fits, passes', () => {
  assert.deepEqual(pageProblems('history', 'de', good), []);
});

test('each way a page goes wrong is reported', () => {
  assert.deepEqual(pageProblems('history', 'de', null), ['did not load']);
  assert.match(pageProblems('history', 'de', {...good, url: 'chrome-native://newtab/'})[0], /opened/);
  assert.deepEqual(pageProblems('history', 'de', {...good, bridge: false}), ['no window.bowserPages']);
  assert.deepEqual(pageProblems('history', 'de', {...good, platform: null}), ['not in the phone layout']);
  assert.match(pageProblems('history', 'de', {...good, lang: 'en'})[0], /in en, not de/);
  assert.match(pageProblems('history', 'de', {...good, scrollWidth: 500})[0], /scrolls sideways/);
  assert.match(pageProblems('history', 'de', {...good, errors: ['TypeError: x']})[0], /script error/);
});

test('a page\'s own query doesn\'t count against it', () => {
  assert.deepEqual(pageProblems('mahjong', 'de', {...good, url: 'chrome://blanc/mahjong.html?game=1'}), []);
});

test('the error and Mahjong pages have no phone stylesheet to check', () => {
  assert.deepEqual(pageProblems('mahjong', 'de', {...good, url: 'chrome://blanc/mahjong.html', platform: null}), []);
});
