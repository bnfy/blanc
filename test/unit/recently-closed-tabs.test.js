const assert = require('node:assert/strict');
const test = require('node:test');

const {
  MAX_RECENTLY_CLOSED,
  addRecentlyClosed,
  takeRecentlyClosed,
} = require('../../src/main/recently-closed-tabs');

test('recently closed tabs preserve recoverable local tab state in LIFO order', () => {
  const group = { id: 'work', name: 'work', collapsed: true };
  const first = addRecentlyClosed([], {
    url: 'https://one.example/', pinned: true, muted: true,
  }, { group, index: 2 });
  const stack = addRecentlyClosed(first, { url: 'https://two.example/' }, { index: 0 });
  const taken = takeRecentlyClosed(stack);

  assert.deepEqual(taken.record, {
    url: 'https://two.example/', pinned: false, muted: false, index: 0, group: null,
  });
  assert.deepEqual(taken.entries, [{
    url: 'https://one.example/', pinned: true, muted: true, index: 2,
    group: { id: 'work', name: 'work', collapsed: true },
  }]);
  assert.notStrictEqual(taken.entries[0].group, group, 'group state is copied, not shared');
});

test('private and blank-start tabs leave no recovery record', () => {
  const entries = [{ url: 'https://kept.example/' }];
  assert.equal(addRecentlyClosed(entries, { url: 'https://secret.example/', private: true }), entries);
  assert.equal(addRecentlyClosed(entries, { url: 'blanc://newtab/' }), entries);
});

test('the in-memory recovery stack remains bounded', () => {
  let entries = [];
  for (let index = 0; index <= MAX_RECENTLY_CLOSED; index += 1) {
    entries = addRecentlyClosed(entries, { url: `https://${index}.example/` }, { index });
  }
  assert.equal(entries.length, MAX_RECENTLY_CLOSED);
  assert.equal(entries[0].url, 'https://1.example/');
});
