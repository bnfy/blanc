'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { credentialMenuLabels, menuText } = require('../../src/main/credential-picker');

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
