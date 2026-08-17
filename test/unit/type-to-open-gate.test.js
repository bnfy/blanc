'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '../..');
const source = fs.readFileSync(
  path.join(ROOT, 'src/renderer/pages/type-to-open.js'),
  'utf8',
);

// The module is a classic script that assigns to globalThis (both documents
// load it with a plain <script> under `script-src 'self'`), so a fresh vm
// context is the whole harness — no DOM, no bundler.
const context = {};
vm.runInNewContext(source, context);
const { isTypeToOpenKey } = context.blancTypeToOpen;

/** Build a KeyboardEvent-shaped object. `altGraph` drives getModifierState. */
function key(k, { altGraph = false, ...flags } = {}) {
  return {
    key: k,
    isComposing: false,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    ...flags,
    getModifierState: (name) => (name === 'AltGraph' ? altGraph : false),
  };
}

test('plain printable characters open the island', () => {
  assert.equal(isTypeToOpenKey(key('g'), false), true);
  assert.equal(isTypeToOpenKey(key('G', { shiftKey: true }), false), true);
  assert.equal(isTypeToOpenKey(key('7'), false), true);
  // The chip teaches "/" and the character has to do what the chip does.
  assert.equal(isTypeToOpenKey(key('/'), false), true);
});

test('non-text keys and whitespace are rejected', () => {
  assert.equal(isTypeToOpenKey(key('Enter'), false), false);
  assert.equal(isTypeToOpenKey(key('Tab'), false), false);
  assert.equal(isTypeToOpenKey(key('ArrowLeft'), false), false);
  assert.equal(isTypeToOpenKey(key('Dead'), false), false);
  assert.equal(isTypeToOpenKey(key(' '), false), false);
  assert.equal(isTypeToOpenKey(key('g', { isComposing: true }), false), false);
});

test('command-intent modifiers are rejected', () => {
  assert.equal(isTypeToOpenKey(key('t', { metaKey: true }), true), false);
  assert.equal(isTypeToOpenKey(key('t', { metaKey: true }), false), false);
  assert.equal(isTypeToOpenKey(key('r', { ctrlKey: true }), false), false);
  assert.equal(isTypeToOpenKey(key('r', { ctrlKey: true }), true), false);
});

// AltGr reports ctrlKey AND altKey on Windows and Linux. A blanket
// `ctrlKey || altKey` rejection drops the entire AltGr layer — "@" on a
// German layout, "ą" on Polish. This test fails against that implementation.
test('the AltGr layer is accepted', () => {
  assert.equal(isTypeToOpenKey(key('@', { ctrlKey: true, altKey: true, altGraph: true }), false), true);
  assert.equal(isTypeToOpenKey(key('ą', { ctrlKey: true, altKey: true, altGraph: true }), false), true);
});

// Bare Option on macOS is text entry, not a shortcut: every Alt accelerator
// Blanc registers is CmdOrCtrl+Alt+… (main.js:4294, :4333-4336), already
// covered by metaKey. Off macOS, bare Alt IS command intent. The gate is
// platform-dependent, so both branches are asserted rather than whichever
// one the host happens to be.
test('bare Alt is text on macOS and a command elsewhere', () => {
  assert.equal(isTypeToOpenKey(key('ø', { altKey: true }), true), true);
  assert.equal(isTypeToOpenKey(key('∑', { altKey: true }), true), true);
  assert.equal(isTypeToOpenKey(key('f', { altKey: true }), false), false);
});

// event.key for an astral character is length 2 in UTF-16. Counting code
// points keeps this gate in agreement with the main-side validator, which
// accepts one astral character.
test('one astral code point counts as one character', () => {
  assert.equal(isTypeToOpenKey(key('\u{1F600}'), false), true);
  assert.equal(isTypeToOpenKey(key('ab'), false), false);
});

// The chrome document can only load what chrome-protocol.js allows. Without
// this entry the <script> tag in index.html 404s and the pill's keyboard
// path silently does nothing.
test('the chrome scheme serves the shared gate', () => {
  const protocolSource = fs.readFileSync(
    path.join(ROOT, 'src/main/chrome-protocol.js'),
    'utf8',
  );
  assert.match(protocolSource, /'\/pages\/type-to-open\.js'/);
});
