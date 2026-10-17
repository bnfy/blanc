'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// /glance opens the Glance picker (the Change picker while Glance is open),
// with any text after the command as the picker's filter. The entry is
// lifted from overlay.js and run against a fake bridge.
const root = path.join(__dirname, '../..');
const overlay = fs.readFileSync(path.join(root, 'src/renderer/overlay.js'), 'utf8');

function glanceEntry(browserAPI) {
  const match = overlay.match(/\{ cmd: '\/glance',[^\n]*\},\n/);
  assert.ok(match, 'overlay.js has no single-line /glance command entry');
  const commandArgument = (input) => (input ?? '').replace(/^\/\S*\s*/, '').trim();
  return vm.runInNewContext(`(${match[0].trim().replace(/,$/, '')})`, {
    window: { browserAPI }, blancI18n: { t: (key) => key }, commandArgument,
  });
}

test('/glance opens the picker with the typed text as the filter', () => {
  const calls = [];
  const entry = glanceEntry({ openGlancePicker: (query) => calls.push(query) });
  entry.run('/glance lisbon');
  assert.deepEqual(calls, ['lisbon']);
  entry.run('/glance');
  assert.deepEqual(calls, ['lisbon', '']);
  assert.equal(entry.keepOverlay, true, 'the picker replaces the panel; the overlay stays up');
  assert.equal(entry.hint, 'slash.glance.hint');
});

test('/glance is registered everywhere a slash command lives', () => {
  const registry = JSON.parse(fs.readFileSync(path.join(root, 'copy/slash-commands.json'), 'utf8'));
  const entry = registry.commands.find((command) => command.command === '/glance');
  assert.deepEqual(entry, { command: '/glance', doc: { command: '/glance <text>' } });
  // Commands with an argument are listed with it and their doc text, as
  // /group <name> and /rename [name] are, on the Shortcuts page and in the
  // Help menu's reference list in main.
  for (const file of ['src/renderer/pages/shortcuts.js', 'src/main/main.js']) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    assert.match(source, /\['\/glance <text>', 'slash\.glance\.doc'\]/, `${file} lists /glance <text>`);
  }
  for (const file of fs.readdirSync(path.join(root, 'copy/messages')).filter((f) => f.endsWith('.json'))) {
    const catalog = JSON.parse(fs.readFileSync(path.join(root, 'copy/messages', file), 'utf8'));
    assert.ok(catalog['slash.glance.hint']?.message, `${file} lacks slash.glance.hint`);
    assert.ok(catalog['slash.glance.doc']?.message, `${file} lacks slash.glance.doc`);
  }
});
