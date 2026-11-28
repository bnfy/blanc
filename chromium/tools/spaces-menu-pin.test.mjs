// Spaces across profiles (bnfy/blanc#1642): the Spaces menu's files and
// messages come from #1642 at a pin of their own (blanc/spaces-menu.json),
// ahead of the Island renderer's release, and the host routes another
// profile's Space through the browser instead of switching this window.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {generate, FILES} from './island-renderer.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const ancestor = (older, newer) => {
  try { execFileSync('git', ['merge-base', '--is-ancestor', older, newer], {cwd: root, stdio: 'ignore'}); return true; }
  catch (error) { if (error.status === 1) return false; throw error; }
};
const menuFile = path.join(root, 'blanc/spaces-menu.json');
const menu = () => JSON.parse(fs.readFileSync(menuFile, 'utf8'));
const renderer = JSON.parse(read('blanc/island-renderer.json'));
const LANGUAGES = ['en', 'de', 'es', 'fr', 'it', 'pt-BR'];

test('pin: #1642\'s menu files come from their own commit, the rest from the renderer release', () => {
  assert.ok(fs.existsSync(menuFile), 'blanc/spaces-menu.json records the Spaces menu pin');
  const record = menu();
  // #1763's merge (#1734): the menu's move mode for a mini window.
  assert.equal(record.commit, '870c400deee96f1a25c2ba8bc0edb5227ae9c583');
  assert.deepEqual(record.files, ['workspace-ui.js', 'overlay.js']);
  assert.deepEqual(record.messages, ['ws.row.titleProfile', 'ws.row.titleProfileShown', 'ws.row.openInProfile',
    'ws.profile.unreadable', 'ws.editor.profile', 'ws.editor.profileDisabled', 'ws.editor.helpOtherProfile',
    'ws.switcher.profileLabel', 'ws.error.profileUnavailable',
    'mini.moveToSpace.label', 'mini.moveToSpace.title', 'mini.moveToSpace.menu', 'ws.moveMode.header', 'ws.error.miniUnmovable']);
  assert.ok(ancestor(record.commit, 'HEAD'), `${record.commit} is in this branch`);
  // Moving the renderer past #1642 makes this pin (and the three styles.css
  // edits that bring #1642's rules) redundant: delete them then.
  assert.ok(!ancestor(record.commit, renderer.commit),
    'the renderer release now carries #1642: delete blanc/spaces-menu.json and the styles.css edits for #1642');
  const pinned = generate(renderer.ref);
  const release = generate(renderer.ref, FILES, null);
  const fromMenu = generate(record.commit, record.files, record); // with the pin's own edits (MENU_EDITS)
  for (const file of FILES) {
    if (record.files.includes(file)) {
      assert.equal(pinned[file], fromMenu[file], `${file} comes from the menu pin`);
      assert.notEqual(pinned[file], release[file], `${file} differs at the menu pin`);
    } else if (file !== 'styles.css') {
      assert.equal(pinned[file], release[file], `${file} comes from the renderer release`);
    }
  }
});

test('strings: every message the menu files name resolves in all six languages', () => {
  const keys = new Set();
  for (const file of ['workspace-ui.js', 'overlay.js'])
    for (const match of read(`blanc/island/${file}`).matchAll(/\bt\('([A-Za-z0-9_.]+)'\s*[,)]/g)) keys.add(match[1]);
  // #1734's button beside Open in Blanc names its two in index.html.
  for (const match of read('blanc/island/index.html').matchAll(/data-i18n-(?:tooltip|aria-label)="(mini\.moveToSpace\.[a-z]+)"/g)) keys.add(match[1]);
  for (const key of menu().messages) assert.ok(keys.has(key), `${key} is used by the menu`);
  const source = read('blanc/island/strings.js');
  for (const language of LANGUAGES) {
    const context = {navigator: {languages: [language], language}, __blancUiLanguage: language, Intl};
    context.self = context;
    vm.runInNewContext(source, context);
    const {messages} = context.blancStrings;
    assert.deepEqual([...keys].filter(key => typeof messages[key] !== 'string'), [], language);
  }
});

test('styles: #1642\'s rules are in the generated styles.css', () => {
  const css = read('blanc/island/styles.css');
  for (const rule of ['.ws-profile-heading', '.ws-select', '.ws-row:not(.ws-row-elsewhere):hover .ws-row-count'])
    assert.ok(css.includes(rule), rule);
  assert.ok(!css.includes('.ws-row:hover .ws-row-count'), 'the old count selector is replaced');
});

// The body of a named function in host.js, by brace matching.
const host = read('blanc/island/host.js');
function body(name) {
  const start = host.search(new RegExp(`(?:async )?function ${name}\\(`));
  assert.ok(start >= 0, `${name} is in host.js`);
  let depth = 0;
  for (let i = host.indexOf('{', host.indexOf(')', start)); i < host.length; i++) {
    if (host[i] === '{') depth++;
    else if (host[i] === '}' && --depth === 0) return host.slice(start, i + 1);
  }
  throw Error(`${name} has no end`);
}

test('host routing: another profile goes to the browser before any switch guard', () => {
  for (const name of ['openSpace', 'createBlankSpace']) {
    const text = body(name);
    const target = text.indexOf('otherProfileTarget(');
    assert.ok(target >= 0, `${name} asks otherProfileTarget`);
    // createBlankSpace reaches the guard through createSpaceHere.
    const guard = [text.indexOf('switchGuard('), text.indexOf('createSpaceHere(')].filter(at => at >= 0);
    assert.ok(guard.length, `${name} reaches switchGuard`);
    assert.ok(target < Math.min(...guard), `${name} routes before switchGuard`);
  }
  // inOtherProfile is request() under a 30-second give-up.
  assert.match(body('inOtherProfile'), /request\(method, args\)/);
  assert.match(body('inOtherProfile'), /30000/);
  assert.match(body('openSpace'), /inOtherProfile\('spaceOpenInProfile', \[target, id\]\)/);
  assert.match(body('createBlankSpace'), /inOtherProfile\('spaceCreateInProfile', \[target, name, color, symbol\]\)/);
  assert.ok(!body('saveSpaceAs').includes('profileId'), 'Save as never reads profileId');
  // The window that came forward stays in front: the menu's own close never
  // hands focus back to this window's page.
  assert.match(body('close'), /focusLeftWindow/);
  assert.match(body('show'), /focusLeftWindow = false/);
  assert.match(body('settleElsewhere'), /focusLeftWindow = true/);
  // Another profile's row has no right-click menu, Chromium's included.
  assert.match(host, /closest\?\.\('\.ws-row-elsewhere'\)\) \{ event\.preventDefault\(\); return; \}/);
  assert.match(body('refreshNow'), /lastWindowActive === false && snapshot\.windowActive === true\) focusLeftWindow = false/);
  // Same-profile Show window settles only when native brought one forward.
  assert.match(body('openSpace'), /const focused = await request\('spaceFocus', \[id\]\)/);
  assert.match(body('openSpace'), /if \(focused === true\) \{\s*const shown = [^;]+;\s*await settleElsewhere\(shown\);\s*return spaceResult\(shown\);\s*\}/);
  // When none came forward, the list is read again and the usual open goes on.
  const afterFocus = body('openSpace').split("request('spaceFocus', [id])")[1];
  assert.match(afterFocus, /list = await spaceList\(\);[\s\S]*switchGuard\(id, options\)/);
  // ...unless another window still holds it after the re-read.
  assert.match(afterFocus, /list = await spaceList\(\);[\s\S]*if \(list\.elsewhere\.has\(id\)\) return \{ ok: false, error: 'activation-failed' \};[\s\S]*switchGuard\(id, options\)/);
  // A create in another profile is answered by its window.
  assert.match(body('openPendingSpace'), /kind === 'create'/);
  assert.match(body('openPendingSpace'), /createSpaceHere\(/);
  assert.match(body('createBlankSpace'), /createSpaceHere\(/);
  assert.match(body('createSpaceHere'), /switchGuard\(/);
  assert.ok(!body('openPendingSpace').includes('switchGuard'), 'the window made for a Space never asks the guard');
});

test('host projection lists other profiles from one native call', () => {
  const text = host.slice(host.indexOf('const spaceProjection'), host.indexOf('const spacesPayload'));
  assert.match(text, /otherProfiles/);
  assert.match(text, /profileName/);
  assert.match(host, /request\('spaceOtherProfiles'\)/);
});
