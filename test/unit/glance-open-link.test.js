'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { linkMenuItems, openLinkInGlance } = require('../../src/main/glance-open-link');
const { englishT } = require('../support/english-t');

test('a link offers Open Link in Glance after Open Link in New Tab; images offer nothing here', () => {
  const calls = [];
  const actions = {
    openBackgroundTab: (url) => calls.push(['background', url]),
    openInGlance: (url) => calls.push(['glance', url]),
    copyLink: (url) => calls.push(['copy', url]),
  };
  const items = linkMenuItems({ linkURL: 'https://a.test/x' }, actions, englishT);
  assert.deepEqual(items.map((item) => item.label), ['Open Link in New Tab', 'Open Link in Glance', 'Copy Link Address']);
  items[1].click();
  assert.deepEqual(calls, [['glance', 'https://a.test/x']]);
  assert.deepEqual(linkMenuItems({ mediaType: 'image', srcURL: 'https://a.test/i.png' }, actions, englishT), []);
  assert.deepEqual(linkMenuItems({}, actions, englishT), []);
});

function harness({ handedOff = false, forbidden = false } = {}) {
  const calls = [];
  const deps = {
    handOffToOs: (url) => { calls.push(['handOff', url]); return handedOff; },
    isForbiddenTopLevelUrl: (url) => { calls.push(['forbidden', url]); return forbidden; },
    createTab: (url, options) => { calls.push(['create', url, options]); return 'new-id'; },
    setGlanceTab: async (id) => { calls.push(['glance', id]); return true; },
  };
  return { calls, deps };
}
const opener = { id: 'ref', private: true, groupId: 'g1' };

test('Open Link in Glance creates the tab in the opener\'s profile, private flag and group and makes it the reference', async () => {
  const { calls, deps } = harness();
  assert.equal(await openLinkInGlance(opener, 'https://a.test/x', deps), true);
  assert.deepEqual(calls, [
    ['handOff', 'https://a.test/x'],
    ['forbidden', 'https://a.test/x'],
    ['create', 'https://a.test/x', { private: true, groupId: 'g1' }],
    ['glance', 'new-id'],
  ]);
});

test('a mailto: link is handed to the OS and opens nothing in Glance', async () => {
  const { calls, deps } = harness({ handedOff: true });
  assert.equal(await openLinkInGlance(opener, 'mailto:a@b.test', deps), false);
  assert.deepEqual(calls, [['handOff', 'mailto:a@b.test']]);
});

test('a forbidden top-level URL opens nothing in Glance', async () => {
  const { calls, deps } = harness({ forbidden: true });
  assert.equal(await openLinkInGlance(opener, 'blanc://settings/', deps), false);
  assert.deepEqual(calls.map((c) => c[0]), ['handOff', 'forbidden']);
});
