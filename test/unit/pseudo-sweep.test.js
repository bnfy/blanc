'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyTextEntries } = require('../desktop/support/pseudo-sweep');

test('allow patterns cover fixed terms such as slash command names, nothing more', () => {
  const allowPatterns = [/^\/[a-z0-9][a-z0-9-]*$/];
  assert.deepEqual(classifyTextEntries([
    { text: '/favorites', ignored: false },
    { text: '/1password', ignored: false },
    { text: '/close-group', ignored: false },
    { text: '/favorites opens favorites', ignored: false },
  ], { allowPatterns }), ['/favorites opens favorites']);
});

test('pseudo-marked, symbol-only, ignored and allowlisted text passes; plain English fails', () => {
  assert.deepEqual(classifyTextEntries([
    { text: '⟦Öþéñ ţáƀ~~⟧', ignored: false },
    { text: '⟦Ţüŕñ öñ ', ignored: false },
    { text: ' îñ Šéţţîñĝš~~⟧', ignored: false },
    { text: '✕', ignored: false },
    { text: '12', ignored: false },
    { text: 'example.com', ignored: true },
    { text: 'Blanc', ignored: false },
    { text: 'Close tab', ignored: false },
  ], { allow: ['Blanc'] }), ['Close tab']);
});
