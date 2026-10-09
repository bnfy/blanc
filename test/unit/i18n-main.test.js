'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  resolveLocale, formattingLocale, selectableCodes, testOverrides, stringsScriptFor, createMainI18n,
} = require('../../src/main/i18n');

const LOCALES = [
  { code: 'en', endonym: 'English', dir: 'ltr', status: 'selectable' },
  { code: 'de', endonym: 'Deutsch', dir: 'ltr', status: 'selectable' },
  { code: 'en-XA', endonym: 'Pseudo', dir: 'ltr', status: 'pseudo' },
];

test('an explicit selectable setting wins', () => {
  assert.deepEqual(resolveLocale({ setting: 'de', preferred: ['en-US'], selectable: ['en', 'de'] }), { locale: 'de', source: 'setting' });
});

test('system follows the first preferred language with a selectable primary subtag', () => {
  const selectable = ['en', 'de'];
  assert.equal(resolveLocale({ setting: 'system', preferred: ['de-AT'], selectable }).locale, 'de');
  assert.equal(resolveLocale({ setting: 'system', preferred: ['de_CH'], selectable }).locale, 'de');
  assert.equal(resolveLocale({ setting: 'system', preferred: ['fr-FR', 'de'], selectable }).locale, 'de');
  assert.deepEqual(resolveLocale({ setting: 'system', preferred: [], selectable }), { locale: 'en', source: 'system' });
});

test('a stored unavailable language renders English, never the OS language', () => {
  assert.deepEqual(
    resolveLocale({ setting: 'fr', preferred: ['de-DE'], selectable: ['en', 'de'] }),
    { locale: 'en', source: 'unavailable' },
  );
});

test('formatting locale combines UI language with the OS region', () => {
  assert.equal(formattingLocale('de', 'de-AT'), 'de-AT');
  assert.equal(formattingLocale('en', 'en-GB'), 'en-GB');
  assert.equal(formattingLocale('en', 'de-DE'), 'en-DE');
  assert.equal(formattingLocale('de', ''), 'de');
  assert.equal(formattingLocale('de', 'en_US.UTF-8'), 'de-US');
  assert.equal(formattingLocale('en-XA', 'de-DE'), 'en');
});

test('selectable codes honour status overrides', () => {
  const hidden = LOCALES.map((l) => (l.code === 'de' ? { ...l, status: 'hidden' } : l));
  assert.deepEqual(selectableCodes(hidden, {}), ['en']);
  assert.deepEqual(selectableCodes(hidden, { de: 'selectable', 'en-XA': 'selectable' }), ['en', 'de', 'en-XA']);
});

test('test overrides apply only to unpackaged BLANC_TEST=1 runs', () => {
  const env = { BLANC_TEST: '1', BLANC_TEST_SYSTEM_LANGUAGES: 'de-DE, fr', BLANC_TEST_LOCALE_STATUS: 'de=selectable,en-XA=selectable' };
  assert.deepEqual(testOverrides({ isPackaged: false, env }), { preferred: ['de-DE', 'fr'], status: { de: 'selectable', 'en-XA': 'selectable' } });
  assert.deepEqual(testOverrides({ isPackaged: true, env }), { status: {} });
  assert.deepEqual(testOverrides({ isPackaged: false, env: { ...env, BLANC_TEST: 'true' } }), { status: {} });
});

test('strings script appends a validated formatting locale and strict flag', () => {
  const script = stringsScriptFor({ source: 'X;', formatLocale: 'de-AT', strict: true });
  assert.equal(script, 'X;\nself.blancStrings.formatLocale="de-AT";self.blancStrings.strict=true;\n');
  assert.throws(() => stringsScriptFor({ source: 'X;', formatLocale: '"};alert(1)//', strict: false }), /invalid/);
});

function service({ setting = 'system', preferred = ['de-DE'], status = {}, flushOk = true } = {}) {
  const calls = { restarts: 0, writes: [] };
  const stored = { uiLanguage: setting };
  const settings = {
    getSettings: () => ({ ...stored }),
    setUiLanguage: (code, selectable) => {
      calls.writes.push([code, selectable]);
      if (!flushOk) return false;
      stored.uiLanguage = code;
      return true;
    },
  };
  const i18n = createMainI18n({
    locales: LOCALES, settings,
    getPreferredSystemLanguages: () => preferred,
    getSystemLocale: () => 'de-DE',
    restartApp: () => { calls.restarts += 1; return Promise.resolve(true); },
    overrides: { status },
    loadStrings: (code) => ({ locale: code, dir: 'ltr', messages: { 'a.b': code === 'de' ? 'Hallo' : 'Hello' }, fallback: {} }),
  });
  i18n.init();
  return { i18n, calls, stored };
}

test('init resolves once and freezes the state', () => {
  const { i18n, stored } = service();
  assert.deepEqual(i18n.state(), { locale: 'de', formatLocale: 'de-DE', dir: 'ltr', source: 'system' });
  stored.uiLanguage = 'en';
  assert.equal(i18n.state().locale, 'de');
  assert.equal(i18n.t('a.b'), 'Hallo');
});

test('languagesInfo reports the active, system-resolved and selectable languages', () => {
  const { i18n } = service({ setting: 'en' });
  assert.deepEqual(i18n.languagesInfo(), {
    active: 'en', system: 'de',
    options: [{ code: 'en', endonym: 'English' }, { code: 'de', endonym: 'Deutsch' }],
  });
});

test('changeUiLanguage validates, writes through setUiLanguage, and restarts only when asked and needed', async () => {
  const { i18n, calls } = service({ setting: 'system' });
  assert.equal(i18n.changeUiLanguage('fr', { restart: true }), false);
  assert.equal(i18n.changeUiLanguage('de', { restart: 'yes' }), false);
  assert.equal(calls.writes.length, 0);
  assert.equal(i18n.changeUiLanguage('de', { restart: true }), true, 'de resolves to the active language: no restart');
  assert.equal(calls.restarts, 0);
  assert.equal(i18n.changeUiLanguage('en', { restart: false }), true);
  assert.equal(calls.restarts, 0);
  assert.equal(await i18n.changeUiLanguage('en', { restart: true }), true);
  assert.equal(calls.restarts, 1);
});

test('a failed write returns false and never restarts', () => {
  const { i18n, calls } = service({ flushOk: false });
  assert.equal(i18n.changeUiLanguage('en', { restart: true }), false);
  assert.equal(calls.restarts, 0);
});
