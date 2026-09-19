'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('main owns one allowlisted resolver for Settings sections', () => {
  const main = read('src/main/main.js');
  assert.match(main, /const SETTINGS_SECTION_FRAGMENTS = Object\.freeze\(\{\s*blocking: '#group-privacy',\s*patron: '#group-patron',\s*sync: '#group-sync',?\s*\}\);/);
  assert.match(main, /function openSettingsSection\(section\) \{[\s\S]*?openInternalPage\(`blanc:\/\/settings\/\$\{fragment\}`\);/);
  assert.doesNotMatch(main, /const sectionMap = /, 'the handler-local map must be gone');
  const handler = main.match(/chromeHandle\('tabs:open-page', \(_e, name, section\) => \{([\s\S]*?)\n  \}\);/)?.[1] ?? '';
  assert.match(handler, /if \(name === 'settings'\) return openSettingsSection\(section\);/);
  assert.doesNotMatch(handler, /#group-/, 'no fragment literal in the handler');
});

test('/sync exists in all four command copies with the same hint', () => {
  const hint = 'Set up or manage sync';
  const copy = JSON.parse(read('copy/slash-commands.json'));
  const idx = copy.commands.findIndex((c) => c.command === '/sync');
  assert.ok(idx > 0);
  assert.equal(copy.commands[idx].hint, hint);
  assert.equal(copy.commands[idx - 1].command, '/settings');
  assert.match(read('src/renderer/overlay.js'), new RegExp(`\\{ cmd: '/sync', hint: '${hint}', run: \\(\\) => window\\.browserAPI\\.openPage\\('settings', 'sync'\\) \\}`));
  assert.match(read('src/renderer/pages/shortcuts.js'), new RegExp(`\\['/sync', '${hint}'\\]`));
  assert.match(read('src/main/main.js'), new RegExp(`\\['/sync', '${hint}'\\]`));
});
