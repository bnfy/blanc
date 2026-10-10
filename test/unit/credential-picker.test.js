'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  credentialMenuLabels, menuText, pickCredential, PICKER_FOCUS_LOST,
} = require('../../src/main/credential-picker');

const ROWS = [
  { title: 'Example', vaultName: 'Personal', username: 'alice' },
  { title: 'Example', vaultName: 'Work', username: 'bob' },
];

// A native menu whose popup runs `behave(template, window)` and then closes,
// the way Electron calls the popup callback once the menu goes away.
function fakeMenu(behave) {
  return {
    buildFromTemplate: (template) => ({
      popup: ({ window, callback }) => { behave(template, window); callback(); },
    }),
  };
}

function fakeWindow(focused = true) {
  return { focused, isFocused() { return this.focused; } };
}

test('the picker resolves the chosen row', async () => {
  const Menu = fakeMenu((template) => template[1].click());
  assert.equal(await pickCredential({ Menu, window: fakeWindow(), rows: ROWS }), 1);
});

test('closing the picker while Blanc keeps focus is a cancel', async () => {
  const Menu = fakeMenu(() => {});
  assert.equal(await pickCredential({ Menu, window: fakeWindow(), rows: ROWS }), null);
});

// #693: on Linux, 1Password's approval dialog closing moves focus away from
// Blanc a moment after the picker opens, and the native menu closes with it.
// That close is not the user's answer.
test('a picker closed because Blanc lost focus reports focus lost, not a cancel', async () => {
  const Menu = fakeMenu((_template, window) => { window.focused = false; });
  assert.equal(await pickCredential({ Menu, window: fakeWindow(), rows: ROWS }), PICKER_FOCUS_LOST);
});

test('a choice made just as Blanc loses focus still counts', async () => {
  const Menu = fakeMenu((template, window) => { template[0].click(); window.focused = false; });
  assert.equal(await pickCredential({ Menu, window: fakeWindow(), rows: ROWS }), 0);
});

test('credential picker leads with username and keeps item and vault context on macOS', () => {
  assert.deepEqual(credentialMenuLabels({
    title: 'google.com',
    vaultName: 'Personal',
    username: 'alice@gmail.com',
  }, 'darwin'), {
    label: 'alice@gmail.com',
    sublabel: 'google.com · Personal',
    toolTip: 'alice@gmail.com — google.com · Personal',
  });
});

test('credential picker preserves the title and vault fallback without a username', () => {
  assert.deepEqual(credentialMenuLabels({
    title: 'google.com',
    vaultName: 'Personal',
  }, 'darwin'), {
    label: 'google.com',
    sublabel: 'Personal',
    toolTip: 'google.com — Personal',
  });
});

test('credential picker strips native-menu control characters', () => {
  assert.equal(menuText('alice\n\t@gmail.com', ''), 'alice @gmail.com');
});

test('credential picker strips Unicode direction and line controls', () => {
  assert.equal(
    menuText('alice\u202e@gmail.com\u2028Personal\u2066', ''),
    'alice @gmail.com Personal'
  );
});
