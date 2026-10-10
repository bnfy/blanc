'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

let cli, catalog;
test.before(async () => {
  cli = await import('../../copy/lib/cli.mjs');
  catalog = await import('../../copy/lib/catalog.mjs');
});

function fixtureRoot(t, { de = {}, scope = {} } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-i18n-cli-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (rel, value) => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), typeof value === 'string' ? value : JSON.stringify(value, null, 2));
  };
  const en = {
    $note: 'fixture',
    'slash.new.hint': { message: 'Open a new tab', note: 'slash hint' },
    'demo.count': { message: '{count, plural, one {# tab} other {# tabs}}', note: 'count' },
  };
  write('copy/messages/en.json', en);
  write('copy/messages/de.json', { $meta: { locale: 'de', endonym: 'Deutsch', dir: 'ltr', status: 'hidden' }, ...de });
  write('copy/glossary.json', { fixed: [], fixedPatterns: [], terms: {}, sameAsSource: {} });
  write('copy/i18n-scope.json', { files: scope });
  write('copy/slash-commands.json', { sources: {}, commands: [{ command: '/new' }] });
  return { root, en };
}

test('build never advances a translation hash, so stale stays stale', (t) => {
  const { root } = fixtureRoot(t, { de: { 'slash.new.hint': { message: 'Neuen Tab öffnen', source: 'sha256:old' } } });
  const before = fs.readFileSync(path.join(root, 'copy/messages/de.json'), 'utf8');
  cli.runBuild(root);
  cli.runCheck(root);
  assert.equal(fs.readFileSync(path.join(root, 'copy/messages/de.json'), 'utf8'), before);
  assert.deepEqual(catalog.catalogReport(cli.loadCatalog(root)).locales.de.stale, ['slash.new.hint']);
});

test('ack advances only the named keys and refuses unknown or untranslated ones', (t) => {
  const { root, en } = fixtureRoot(t, { de: {
    'slash.new.hint': { message: 'Neuen Tab öffnen', source: 'sha256:old' },
    'demo.count': { message: '{count, plural, one {# Tab} other {# Tabs}}', source: 'sha256:old' },
  } });
  cli.runAck(root, 'de', ['slash.new.hint']);
  const de = JSON.parse(fs.readFileSync(path.join(root, 'copy/messages/de.json'), 'utf8'));
  assert.equal(de['slash.new.hint'].source, catalog.entryHash(en['slash.new.hint']));
  assert.equal(de['demo.count'].source, 'sha256:old');
  assert.throws(() => cli.runAck(root, 'de', ['nope.key']), /unknown key/);
  assert.throws(() => cli.runAck(root, 'de', []), /at least one key/);
  assert.throws(() => cli.runAck(root, 'fr', ['slash.new.hint']), /unknown locale/);
});

test('changing only an English note makes the translation stale', (t) => {
  const { root } = fixtureRoot(t, { de: { 'slash.new.hint': { message: 'Neuen Tab öffnen' } } });
  cli.runAck(root, 'de', ['slash.new.hint']);
  const enPath = path.join(root, 'copy/messages/en.json');
  const enJson = JSON.parse(fs.readFileSync(enPath, 'utf8'));
  enJson['slash.new.hint'].note = 'changed context';
  fs.writeFileSync(enPath, JSON.stringify(enJson));
  const loaded = cli.loadCatalog(root);
  assert.deepEqual(catalog.catalogReport(loaded).locales.de.stale, ['slash.new.hint']);
});

test('check fails on stale generated files and passes after build', (t) => {
  const { root } = fixtureRoot(t);
  assert.match(cli.runCheck(root).failures.join('\n'), /STALE/);
  cli.runBuild(root);
  assert.deepEqual(cli.runCheck(root).failures, []);
});

test('check fails a guarded file with hard-coded English and passes a pending one', (t) => {
  const { root } = fixtureRoot(t, { scope: {
    'src/renderer/guarded.js': { state: 'guarded', allow: [] },
    'src/renderer/pending.js': { state: 'pending', allow: [] },
  } });
  fs.mkdirSync(path.join(root, 'src/renderer'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src/renderer/guarded.js'), "el.textContent = 'Close tab';");
  fs.writeFileSync(path.join(root, 'src/renderer/pending.js'), "el.textContent = 'Close tab';");
  cli.runBuild(root);
  const { failures } = cli.runCheck(root);
  assert.equal(failures.filter((f) => f.includes('guarded.js')).length, 1);
  assert.equal(failures.filter((f) => f.includes('pending.js')).length, 0);
});

test('check fails when a scoped file does not exist (renames cannot silently pass)', (t) => {
  const { root } = fixtureRoot(t, { scope: { 'src/renderer/renamed.js': { state: 'guarded', allow: [] } } });
  cli.runBuild(root);
  assert.match(cli.runCheck(root).failures.join(), /renamed\.js.*missing/);
});

test('status lists missing and stale keys with English and note', (t) => {
  const { root } = fixtureRoot(t);
  const out = cli.runStatus(root, 'de');
  assert.match(out, /slash\.new\.hint/);
  assert.match(out, /Open a new tab/);
  assert.match(out, /slash hint/);
});

test('generated runtime files and locale registry have the expected shape', (t) => {
  const { root } = fixtureRoot(t);
  const files = cli.generate(root);
  const registry = JSON.parse(files['src/main/i18n-locales.json']);
  assert.deepEqual(registry.map((l) => [l.code, l.status]), [['en', 'selectable'], ['de', 'hidden'], ['en-XA', 'pseudo']]);
  const sandbox = { self: {} };
  vm.runInNewContext(files['src/renderer/pages/strings.de.js'], sandbox);
  assert.equal(sandbox.self.blancStrings.locale, 'de');
  assert.equal(sandbox.self.blancStrings.fallback['slash.new.hint'], 'Open a new tab');
  assert.equal(cli.slashKey('/close-group', 'hint'), 'slash.closeGroup.hint');
});

test('mobile output refuses exact plural branches instead of silently dropping them', async () => {
  const mobile = await import('../../copy/lib/mobile.mjs');
  const en = { 'a.count': { message: '{n, plural, =0 {no tabs} one {# tab} other {# tabs}}', note: 'n' } };
  const locales = { en: { 'a.count': en['a.count'].message } };
  assert.throws(() => mobile.xcstrings({ en, locales }), /=0/);
  assert.throws(() => mobile.androidStrings({ en, messages: locales.en }), /=0/);
});

test('mobile output keeps every plural category as a full string', async () => {
  const mobile = await import('../../copy/lib/mobile.mjs');
  const en = { 'a.count': { message: 'Close {count, plural, one {# tab} other {# tabs}}', note: 'n' } };
  const messages = { 'a.count': en['a.count'].message };
  const ios = JSON.parse(mobile.xcstrings({ en, locales: { en: messages } })).strings['a.count'].localizations.en.variations.plural;
  assert.deepEqual(Object.keys(ios).sort(), ['one', 'other']);
  assert.equal(ios.one.stringUnit.value, 'Close %1$lld tab');
  assert.match(mobile.androidStrings({ en, messages }), /<item quantity="other">Close %1\$d tabs<\/item>/);
});

test('Android output escapes backslashes before quotes and apostrophes', async () => {
  const mobile = await import('../../copy/lib/mobile.mjs');
  const en = { 'a.path': { message: 'Saved to C:\\Downloads, "done" isn\'t it', note: 'n' } };
  assert.match(mobile.androidStrings({ en, messages: { 'a.path': en['a.path'].message } }),
    /<string name="a_path">Saved to C:\\\\Downloads, \\"done\\" isn\\'t it<\/string>/);
});

test('the overlay slash table must follow the registry order and use each command its own catalog key', (t) => {
  const { root } = fixtureRoot(t);
  fs.writeFileSync(path.join(root, 'copy/slash-commands.json'), JSON.stringify({
    sources: { overlayKeys: 'src/renderer/overlay.js' },
    commands: [{ command: '/new' }, { command: '/close-group' }],
  }));
  const en = JSON.parse(fs.readFileSync(path.join(root, 'copy/messages/en.json'), 'utf8'));
  en['slash.closeGroup.hint'] = { message: 'Close every tab in this group', note: 'n' };
  fs.writeFileSync(path.join(root, 'copy/messages/en.json'), JSON.stringify(en));
  fs.mkdirSync(path.join(root, 'src/renderer'), { recursive: true });
  const write = (rows) => fs.writeFileSync(path.join(root, 'src/renderer/overlay.js'), rows.join('\n'));
  cli.runBuild(root);
  write(["    { cmd: '/new', hint: blancI18n.t('slash.new.hint'), run: () => {} },",
    "    { cmd: '/close-group', hint: blancI18n.t('slash.closeGroup.hint'), run: () => {} },"]);
  assert.deepEqual(cli.runCheck(root).failures.filter((f) => f.includes('overlay.js')), []);
  write(["    { cmd: '/close-group', hint: blancI18n.t('slash.closeGroup.hint'), run: () => {} },",
    "    { cmd: '/new', hint: blancI18n.t('slash.new.hint'), run: () => {} },"]);
  assert.ok(cli.runCheck(root).failures.some((f) => f.includes('overlay.js')), 'reordered table fails');
  write(["    { cmd: '/new', hint: blancI18n.t('slash.closeGroup.hint'), run: () => {} },",
    "    { cmd: '/close-group', hint: blancI18n.t('slash.closeGroup.hint'), run: () => {} },"]);
  assert.ok(cli.runCheck(root).failures.some((f) => f.includes('overlay.js')), 'wrong key fails');
});
