'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { effectiveTabMuted, shownMuted } = require('../../src/main/tab-audio');
const { hostOf, siteMuteKey, createSiteMutes } = require('../../src/main/site-mute');

// Mute Site (spec 2026-10-17-tab-menu-additions-design.md §4): until Blanc
// quits, by exact host, separate for private tabs.
test('a site mute mutes the tab unless that tab was unmuted on its own', () => {
  assert.equal(effectiveTabMuted({ siteMuted: true }), true);
  assert.equal(shownMuted({ siteMuted: true }), true);
  assert.equal(effectiveTabMuted({ siteMuted: true, siteUnmuted: true }), false);
  assert.equal(shownMuted({ siteMuted: true, siteUnmuted: true }), false);
  assert.equal(shownMuted({ backgroundAutoplayMuted: true }), false, 'the autoplay guard is not shown as a mute');
});

test('hostOf keys on the exact web host only', () => {
  assert.equal(hostOf('https://www.youtube.com/watch?v=1'), 'www.youtube.com');
  assert.equal(hostOf('https://music.youtube.com/'), 'music.youtube.com');
  assert.equal(hostOf('blanc://newtab/'), null);
  assert.equal(hostOf('file:///tmp/a.html'), null);
  assert.equal(hostOf('not a url'), null);
});

test('private and normal tabs keep separate site mutes', () => {
  const mutes = createSiteMutes();
  const normal = siteMuteKey({ profileId: 'p', private: false });
  const priv = siteMuteKey({ profileId: 'p', private: true });
  assert.equal(mutes.toggle(priv, 'a.test'), true);
  assert.equal(mutes.has(priv, 'a.test'), true);
  assert.equal(mutes.has(normal, 'a.test'), false);
  assert.equal(mutes.toggle(priv, 'a.test'), false);
  assert.equal(mutes.has(priv, 'a.test'), false);
});

// The main-process glue, lifted (main.js cannot be required under node --test).
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const tabAudio = require('../../src/main/tab-audio');
const siteMute = require('../../src/main/site-mute');
const mainSource = fs.readFileSync(path.join(__dirname, '../../src/main/main.js'), 'utf8');
const lift = (name) => mainSource.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}`))?.[0];

function harness(tabList) {
  const tabs = new Map(tabList.map((tab) => [tab.id, { profileId: 'p', private: false, muted: false, ...tab }]));
  const audio = new Map();
  const sandbox = {
    tabs, ...tabAudio, ...siteMute, siteMutes: siteMute.createSiteMutes(),
    liveContents: (tab) => ({ setAudioMuted: (value) => audio.set(tab.id, value) }),
    broadcastTabs: () => {}, scheduleMenuRebuild: () => {},
  };
  const names = ['toggleSiteMute', 'refreshSiteMute', 'toggleTabMuted'];
  vm.runInNewContext(`${names.map(lift).join('\n')}\nthis.fns = { ${names.join(', ')} };`, sandbox);
  return { ...sandbox.fns, tabs, audio };
}

test('Mute Site mutes every tab on the host and Unmute Site clears them', () => {
  const h = harness([{ id: 'a', url: 'https://v.test/1' }, { id: 'b', url: 'https://v.test/2' }, { id: 'c', url: 'https://w.test/' }]);
  assert.equal(h.toggleSiteMute('a'), true);
  assert.deepEqual([h.audio.get('a'), h.audio.get('b'), h.audio.get('c')], [true, true, undefined]);
  assert.equal(h.toggleSiteMute('b'), false);
  assert.deepEqual([h.audio.get('a'), h.audio.get('b')], [false, false]);
});

test('per-tab unmute overrides the site until the host changes', () => {
  const h = harness([{ id: 'a', url: 'https://v.test/1' }, { id: 'b', url: 'https://v.test/2' }]);
  h.toggleSiteMute('a');
  assert.equal(h.toggleTabMuted('a'), false, 'Unmute Tab on a site-muted tab');
  assert.equal(h.audio.get('a'), false);
  assert.equal(h.audio.get('b'), true, 'the other tab on the site stays muted');
  h.tabs.get('a').url = 'https://w.test/';
  h.refreshSiteMute(h.tabs.get('a'), 'https://w.test/');
  h.tabs.get('a').url = 'https://v.test/3';
  h.refreshSiteMute(h.tabs.get('a'), 'https://v.test/3');
  assert.equal(h.audio.get('a'), true, 'back on the muted host, the one-tab unmute is gone');
});
