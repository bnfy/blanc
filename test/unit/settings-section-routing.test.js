'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('main owns one allowlisted resolver for Settings sections', () => {
  const main = read('src/main/main.js');
  assert.match(main, /const SETTINGS_SECTION_FRAGMENTS = Object\.freeze\(\{\s*blocking: '#group-privacy',\s*patron: '#group-patron',\s*sync: '#group-sync',\s*onepassword: '#onePasswordSettings',?\s*\}\);/);
  assert.match(main, /function openSettingsSection\(section\) \{[\s\S]*?openInternalPage\(`blanc:\/\/settings\/\$\{fragment\}`\);/);
  assert.doesNotMatch(main, /const sectionMap = /, 'the handler-local map must be gone');
  const handler = main.match(/chromeHandle\('tabs:open-page', \(_e, name, section\) => \{([\s\S]*?)\n  \}\);/)?.[1] ?? '';
  assert.match(handler, /if \(name === 'settings'\) return openSettingsSection\(section\);/);
  assert.doesNotMatch(handler, /#group-/, 'no fragment literal in the handler');
});

// The 1Password setup prompt's Open Settings used to land at General, leaving
// the user to find the 1Password card (Windows/Linux checklist, 2026-10-10).
test('the 1Password setup prompt opens Settings at the 1Password card', () => {
  const main = read('src/main/main.js');
  const wiring = main.match(/createCredentialFillController\(\{([\s\S]*?)\n {4}\}\);/)?.[1] ?? '';
  assert.ok(wiring, 'the fill controller wiring was found');
  assert.match(wiring, /openSettings: \(\) => openSettingsSection\('onepassword'\),/);
  assert.match(read('src/renderer/pages/settings.html'), /id="onePasswordSettings"/);
  // The card clears the sheet's sticky band like a group does.
  assert.match(read('src/renderer/pages/pages.css'), /\.settings-group,\s*#onePasswordSettings \{ scroll-margin-top: 95px; \}/);
});

// Settings reveals the card from script after the browser's own fragment
// scroll has given up, so the page scrolls to it itself, and only after
// folding the long hints above it, which would otherwise move it under the
// sticky band.
test('Settings scrolls to a card fragment last, after folding hints', () => {
  const js = read('src/renderer/pages/settings.js');
  const fold = js.indexOf('(function foldLongHints()');
  const scroll = js.indexOf('anchoredCard.scrollIntoView(');
  assert.ok(fold > 0 && scroll > 0, 'both the hint folding and the card scroll were found');
  assert.ok(scroll > fold, 'the card scroll runs after hints are folded');
  assert.match(js, /const anchoredCard = location\.hash && !location\.hash\.startsWith\('#group-'\)/);
  assert.match(js, /if \(anchoredCard && !anchoredCard\.hidden\) anchoredCard\.scrollIntoView\(\{ block: 'start' \}\);/);
});

test('/sync exists in all four command copies with the same hint', () => {
  const hint = 'Set up or manage sync';
  const copy = JSON.parse(read('copy/slash-commands.json'));
  const idx = copy.commands.findIndex((c) => c.command === '/sync');
  assert.ok(idx > 0);
  // Hint text lives in the interface catalog; the registry keeps order and names.
  assert.equal(JSON.parse(read('copy/messages/en.json'))['slash.sync.hint'].message, hint);
  assert.equal(copy.commands[idx - 1].command, '/settings');
  // overlay.js reads the hint from the interface catalog (F44).
  assert.match(read('src/renderer/overlay.js'), /\{ cmd: '\/sync', hint: blancI18n\.t\('slash\.sync\.hint'\), run: \(\) => window\.browserAPI\.openPage\('settings', 'sync'\) \}/);
  // shortcuts.js pairs the command with its catalog key too (F44).
  assert.match(read('src/renderer/pages/shortcuts.js'), /\['\/sync', 'slash\.sync\.hint'\]/);
  // main.js pairs the command with its catalog key (F44).
  assert.match(read('src/main/main.js'), /\['\/sync', 'slash\.sync\.hint'\]/);
});
