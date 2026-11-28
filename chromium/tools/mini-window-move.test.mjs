// Mini window: Move to Space (#1734, plan Part B): the fork's Island carries
// shipping's Spaces button and the Spaces menu's move mode from #1763's merge.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const KEYS = ['mini.moveToSpace.label', 'mini.moveToSpace.title', 'mini.moveToSpace.menu', 'ws.moveMode.header', 'ws.error.miniUnmovable'];

test('the Spaces menu pin is #1763\'s merge and brings its messages', () => {
  const pin = JSON.parse(read('blanc/spaces-menu.json'));
  assert.equal(pin.commit, '870c400deee96f1a25c2ba8bc0edb5227ae9c583');
  for (const key of KEYS) assert.ok(pin.messages.includes(key), key);
  assert.match(pin.note, /#1734/);
});

test('the Island has the mini window\'s Spaces button and the menu its move mode', () => {
  assert.match(read('blanc/island/index.html'), /<button id="pillMiniSpaces" class="mini-spaces" type="button"[^>]*hidden>/);
  const renderer = read('blanc/island/renderer.js');
  assert.match(renderer, /pillMiniSpaces\.hidden = !miniWindow;/);
  assert.match(renderer, /pillMiniSpaces\.disabled = !state\.miniWindowCanMove;/);
  assert.match(renderer, /const anchor = !pillMiniSpaces\.hidden \? pillMiniSpaces : pillSpace\.hidden \? islandPill : pillSpace;/);
  assert.match(renderer, /pillMiniSpaces\.setAttribute\('aria-expanded', String\(mode === 'spaces'\)\);/);
  assert.match(renderer, /window\.browserAPI\.openSpacesMenu\(\{ \.\.\.spacesAnchor\(\), closing \}\);\n  \}\);\n\n  for \(const chip of/);
  const css = read('blanc/island/styles.css');
  assert.match(css, /#pillMiniOpen,\n#pillMiniSpaces,\n:root\[data-platform="linux"\] #pillRestartToUpdate \{/);
  assert.match(css, /#pillMiniSpaces:disabled \{ opacity: 0\.45; cursor: default; \}/);
  assert.match(read('blanc/island/workspace-ui.js'), /setMoveMode\(on, \{ tabCount = 0 \} = \{\}\)/);
  assert.match(read('blanc/island/overlay.js'), /workspaceUI\.setMoveMode\(payload\.miniWindow === true, \{ tabCount: movingTabCount\(payload\) \}\);/);
});
