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
