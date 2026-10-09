'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

let lib;
test.before(async () => { lib = await import('../../copy/lib/catalog.mjs'); });

const glossary = {
  fixed: ['Blanc', '1Password'],
  fixedPatterns: ['(?<![\\w/:])/[a-z][a-z0-9-]*', '⌘'],
  terms: { 'Quiet Tabs': { de: { form: 'Ruhende Tabs', stem: 'uhend' } } },
  sameAsSource: { de: ['ok.same'] },
};
const en = (message, extra = {}) => ({ message, note: 'n', ...extra });
const fresh = (enEntry, message) => ({ message, source: lib.entryHash(enEntry) });
const problemsFor = (enEntry, message, key = 'k.x') =>
  lib.checkTranslation({ key, enEntry, trEntry: fresh(enEntry, message), glossary, locale: 'de' });

test('entryHash covers the message and the note', () => {
  const a = lib.entryHash(en('Open'));
  assert.match(a, /^sha256:[0-9a-f]{64}$/);
  assert.notEqual(a, lib.entryHash(en('Open', { note: 'other context' })));
  assert.notEqual(a, lib.entryHash(en('Open it')));
});

test('validateSource rejects bad keys, missing notes, unparseable messages and English over maxLength', () => {
  const problems = lib.validateSource({
    'Bad Key': en('x'),
    'a.noNote': { message: 'x' },
    'a.broken': en('{oops'),
    'a.long': en('Far too long', { maxLength: 3 }),
    'a.fine': en('Fine'),
  });
  assert.equal(problems.length, 4, problems.join('\n'));
});

test('a correct translation has no problems', () => {
  assert.deepEqual(problemsFor(en('Open {site} in Blanc'), '{site} in Blanc öffnen'), []);
});

test('dropped placeholder fails', () => {
  assert.match(problemsFor(en('Open {site}'), 'Öffnen').join(), /placeholders/);
});

test('missing other branch fails (parse error)', () => {
  assert.match(problemsFor(en('{n, plural, one {# tab} other {# tabs}}'), '{n, plural, one {# Tab}}').join(), /other/);
});

test('different exact branches fail', () => {
  assert.match(problemsFor(en('{n, plural, =0 {none} other {# tabs}}'), '{n, plural, other {# Tabs}}').join(), /exact/);
});

test('tag mismatch fails', () => {
  assert.match(problemsFor(en('Turn on <0>Fill</0>'), 'Aktiviere Ausfüllen').join(), /tags/);
});

test('missing fixed term fails', () => {
  assert.match(problemsFor(en('Fill from 1Password'), 'Aus dem Passwortmanager ausfüllen').join(), /1Password/);
});

test('missing fixed pattern (slash command) fails, but a URL path does not count', () => {
  assert.match(problemsFor(en('Type /sleep'), 'Tippe /ruhe').join(), /\/sleep/);
  assert.deepEqual(problemsFor(en('Open blanc://settings'), 'blanc://settings öffnen'), []);
});

test('missing glossary stem fails (case-insensitive term match in English)', () => {
  assert.match(problemsFor(en('Turn off quiet tabs'), 'Schlafende Tabs ausschalten').join(), /uhend/);
  assert.deepEqual(problemsFor(en('Turn off quiet tabs'), 'Ruhende Tabs ausschalten'), []);
});

test('maxLength overflow fails, placeholders count as zero', () => {
  assert.match(problemsFor(en('Close', { maxLength: 6 }), 'Schließen').join(), /maxLength/);
  assert.deepEqual(problemsFor(en('{a}', { maxLength: 1 }), '{a}'), []);
});

test('identical to English fails unless exempt', () => {
  assert.match(problemsFor(en('Download'), 'Download').join(), /identical/);
  assert.deepEqual(problemsFor(en('{site} · ⌘'), '{site} · ⌘'), []);
  assert.deepEqual(problemsFor(en('Blanc'), 'Blanc'), []);
  assert.deepEqual(problemsFor(en('System'), 'System', 'ok.same'), []);
});

test('catalogReport classifies missing, stale, invalid and orphan entries', () => {
  const enCat = { 'a.one': en('One'), 'a.two': en('Two'), 'a.three': en('Three {x}'), 'a.four': en('Four') };
  const report = lib.catalogReport({
    en: enCat,
    glossary,
    translations: { de: {
      $meta: { locale: 'de', endonym: 'Deutsch', dir: 'ltr', status: 'hidden' },
      'a.one': fresh(enCat['a.one'], 'Eins'),
      'a.two': { message: 'Zwei', source: 'sha256:old' },
      'a.three': fresh(enCat['a.three'], 'Drei'),
      'a.gone': { message: 'Weg', source: 'sha256:x' },
      'a.four': { message: 'Vier' },
    } },
  });
  const de = report.locales.de;
  assert.deepEqual(de.missing, ['a.four']);
  assert.deepEqual(de.stale, ['a.two']);
  assert.equal(de.invalid.length, 1);
  assert.deepEqual(de.orphans, ['a.gone']);
  assert.equal(de.covered, 1);
  assert.equal(de.total, 4);
});

test('hidden locales only warn on missing/stale; selectable locales fail; invalid and orphans always fail', () => {
  const base = { sourceProblems: [], locales: { de: { status: 'hidden', total: 2, covered: 1, missing: ['a'], stale: [], invalid: [], orphans: [] } } };
  assert.deepEqual(lib.reportFailures(base).failures, []);
  assert.equal(lib.reportFailures(base).warnings.length, 1);
  base.locales.de.status = 'selectable';
  assert.match(lib.reportFailures(base).failures.join(), /below 100%/);
  base.locales.de = { status: 'hidden', total: 1, covered: 0, missing: [], stale: [], invalid: ['a.x: bad'], orphans: ['a.y'] };
  assert.equal(lib.reportFailures(base).failures.length, 2);
});

test('pseudoLocalize accents, expands and brackets text and every tag, keeping syntax intact', () => {
  const out = lib.pseudoLocalize('Open <0>{count, plural, one {# tab} other {# tabs}}</0>');
  assert.match(out, /^⟦Öþéñ /);
  assert.match(out, /<0>⟦\{count, plural, one \{# ţáƀ\} other \{# ţáƀš\}\}⟧<\/0>/);
  assert.match(out, /~+⟧$/);
});

test('runtimeCatalog uses current and stale translations, and falls back to English for missing ones', () => {
  const enCat = { 'a.one': en('One'), 'a.two': en('Two') };
  const runtime = lib.runtimeCatalog({ locale: 'de', dir: 'ltr', en: enCat, tr: {
    $meta: {}, 'a.one': { message: 'Eins', source: 'sha256:stale' },
  } });
  assert.deepEqual(runtime, { locale: 'de', dir: 'ltr', messages: { 'a.one': 'Eins' }, fallback: { 'a.two': 'Two' } });
});
