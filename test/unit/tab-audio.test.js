'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  effectiveTabMuted,
  noteMediaStarted,
  revealTabAudio,
} = require('../../src/main/tab-audio');

test('first media start in a background tab is guarded until that tab is revealed', () => {
  const tab = { muted: false, usedMedia: false, backgroundAutoplayMuted: false };
  assert.equal(noteMediaStarted(tab, false), true);
  assert.equal(tab.usedMedia, true);
  assert.equal(effectiveTabMuted(tab), true);
  assert.equal(revealTabAudio(tab), true);
  assert.equal(effectiveTabMuted(tab), false);
});

test('media started in the foreground keeps playing after a tab switch', () => {
  const tab = { muted: false, usedMedia: false, backgroundAutoplayMuted: false };
  assert.equal(noteMediaStarted(tab, true), false);
  assert.equal(effectiveTabMuted(tab), false);
  assert.equal(noteMediaStarted(tab, false), false, 'the user already visited a playing tab');
  assert.equal(effectiveTabMuted(tab), false);
});

test('background autoplay guard never overrides an explicit user mute', () => {
  const tab = { muted: true, usedMedia: false, backgroundAutoplayMuted: false };
  assert.equal(noteMediaStarted(tab, false), false);
  assert.equal(effectiveTabMuted(tab), true);
  assert.equal(revealTabAudio(tab), false);
  assert.equal(effectiveTabMuted(tab), true);
});

test('the temporary guard is derived into audible state but never projected as mutable state', () => {
  const source = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '../../src/main/main.js'),
    'utf8'
  );
  const serializeBody = source.slice(
    source.indexOf('function serializeTabs()'),
    source.indexOf('\nfunction activeShieldPopover')
  );
  assert.match(serializeBody, /audible: tab\.audible && !\(tab\.muted \|\| tab\.backgroundAutoplayMuted\)/);
  assert.doesNotMatch(serializeBody, /backgroundAutoplayMuted\s*:/);
});
