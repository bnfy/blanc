// The emulator check for Blanc's pages (tests/android/pages-phone.mjs) fails
// each way a page can be wrong on the phone.
import test from 'node:test';
import assert from 'node:assert/strict';
import {clockCenterProblems, clockProblems, pageProblems, relaunchProblems} from '../tests/android/pages-phone.mjs';

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

test('a fresh install\'s clock is the iPhone\'s first-run clock, solid as on every Android', () => {
  const iphone = {clock: {font: 'flex', style: 'solid', height: 300, weight: 450}, glassDrawn: false};
  assert.deepEqual(clockProblems(iphone), []);
  assert.deepEqual(clockProblems({...iphone, clock: {...iphone.clock, font: 'instrument', style: 'glass'}}),
    ['font is "instrument", not "flex"', 'style is "glass", not "solid"']);
  assert.deepEqual(clockProblems({...iphone, glassDrawn: true}), ['the glass is drawn']);
  assert.deepEqual(clockProblems(null), ['no clock data']);
});

test('the clock\'s figures must sit at the middle of the screen', () => {
  // The emulator's 640 px screen: figures from 158 to 482 px down it center at 320.
  assert.deepEqual(clockCenterProblems({screenHeight: 640, inkTop: 158, inkBottom: 482}), []);
  assert.deepEqual(clockCenterProblems({screenHeight: 640, inkTop: 162, inkBottom: 482}), []);
  assert.match(clockCenterProblems({screenHeight: 640, inkTop: 170, inkBottom: 494})[0], /12 px below the middle/);
  assert.match(clockCenterProblems({screenHeight: 640, inkTop: 150, inkBottom: 474})[0], /8 px above the middle/);
  assert.deepEqual(clockCenterProblems(null), ['no clock to measure']);
  assert.deepEqual(clockCenterProblems({timedOut: true}), ['the page did not answer within 20 s']);
});

test('the Start Page is the fork\'s, in Android\'s phone layout', () => {
  assert.deepEqual(pageProblems('newtab', 'de', {...good, url: 'chrome://blanc/newtab.html', platform: 'android'}), []);
  assert.deepEqual(pageProblems('newtab', 'de', {...good, url: 'chrome://blanc/newtab.html', platform: 'ios'}),
    ['not in the phone layout']);
});

test('every choice must survive the relaunch, and the clock stays solid', () => {
  const kept = {widgets: {favorites: true, devices: true, shortcutCount: 4}, clock: {font: 'inter', weight: 600, style: 'solid'},
    wallpaper: {source: 'color', color: {preset: 'sky'}}};
  assert.deepEqual(relaunchProblems(kept), []);
  assert.deepEqual(relaunchProblems(null), ['no Start Page data after the relaunch']);
  assert.deepEqual(relaunchProblems({...kept, widgets: {...kept.widgets, devices: false}}), ['widgets.devices is false, not true']);
  assert.deepEqual(relaunchProblems({...kept, clock: {...kept.clock, style: 'glass'}}), ['clock.style is "glass", not "solid"']);
  assert.deepEqual(relaunchProblems({...kept, wallpaper: {source: 'sunrise', color: {preset: 'sage'}}}),
    ['wallpaper is "sunrise", not "color"', 'wallpaper color is "sage", not "sky"']);
});
