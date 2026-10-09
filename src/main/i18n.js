'use strict';
// Interface language for the main process. Pure: no require('electron') — main.js
// injects the OS and settings accessors. The resolved language is frozen at
// init() for the life of the process, which is what makes relaunch-to-apply
// sound: nothing re-resolves it.
const { createTranslator } = require('../renderer/pages/i18n');

const LOCALE_TAG = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;

function selectableCodes(locales, statusOverrides = {}) {
  return locales
    .filter((l) => (statusOverrides[l.code] ?? l.status) === 'selectable')
    .map((l) => l.code);
}

function resolveLocale({ setting, preferred = [], selectable }) {
  if (selectable.includes(setting)) return { locale: setting, source: 'setting' };
  if (setting === 'system') {
    for (const tag of preferred) {
      const primary = String(tag).toLowerCase().split(/[-_]/)[0];
      if (selectable.includes(primary)) return { locale: primary, source: 'system' };
    }
    return { locale: 'en', source: 'system' };
  }
  return { locale: 'en', source: 'unavailable' };
}

function formattingLocale(locale, systemLocale) {
  if (locale === 'en-XA') return 'en';
  const region = /^[A-Za-z]{2,3}(?:[-_][A-Za-z]{4})?[-_]([A-Za-z]{2}|\d{3})(?![A-Za-z0-9])/
    .exec(String(systemLocale ?? ''))?.[1];
  const candidate = region ? `${locale}-${region.toUpperCase()}` : locale;
  try { return Intl.getCanonicalLocales(candidate)[0]; } catch { return locale; }
}

function testOverrides({ isPackaged, env }) {
  if (isPackaged || env.BLANC_TEST !== '1') return { status: {} };
  const out = { status: {} };
  if (env.BLANC_TEST_SYSTEM_LANGUAGES) {
    out.preferred = env.BLANC_TEST_SYSTEM_LANGUAGES.split(',').map((s) => s.trim()).filter(Boolean);
  }
  for (const pair of String(env.BLANC_TEST_LOCALE_STATUS ?? '').split(',')) {
    const [code, status] = pair.split('=').map((s) => s?.trim());
    if (code && status) out.status[code] = status;
  }
  return out;
}

function stringsScriptFor({ source, formatLocale, strict }) {
  if (!LOCALE_TAG.test(formatLocale)) throw new Error(`invalid formatting locale ${formatLocale}`);
  return `${source}\nself.blancStrings.formatLocale=${JSON.stringify(formatLocale)};self.blancStrings.strict=${strict === true};\n`;
}

function createMainI18n({
  locales, settings, getPreferredSystemLanguages, getSystemLocale, restartApp,
  overrides = { status: {} }, loadStrings, loadStringsSource, strict = false,
}) {
  let state = null;
  let translator = null;
  const selectable = () => selectableCodes(locales, overrides.status);
  const preferred = () => overrides.preferred ?? getPreferredSystemLanguages();
  const localeEntry = (code) => locales.find((l) => l.code === code);

  function init() {
    if (state) return state;
    const resolved = resolveLocale({ setting: settings.getSettings().uiLanguage, preferred: preferred(), selectable: selectable() });
    state = Object.freeze({
      locale: resolved.locale,
      formatLocale: formattingLocale(resolved.locale, getSystemLocale()),
      dir: localeEntry(resolved.locale)?.dir ?? 'ltr',
      source: resolved.source,
    });
    const data = loadStrings(state.locale);
    translator = createTranslator({
      locale: state.locale, formatLocale: state.formatLocale, messages: data.messages, fallback: data.fallback,
      onMissing: (key) => { if (strict) throw new Error(`missing interface string: ${key}`); console.warn(`missing interface string: ${key}`); },
    });
    return state;
  }

  const requireState = () => state ?? init();

  return {
    init,
    state: () => requireState(),
    t: (key, params) => { requireState(); return translator(key, params); },
    parts: (key, params) => { requireState(); return translator.parts(key, params); },
    languagesInfo() {
      const current = requireState();
      return {
        active: current.locale,
        system: resolveLocale({ setting: 'system', preferred: preferred(), selectable: selectable() }).locale,
        options: selectable().map((code) => ({ code, endonym: localeEntry(code).endonym })),
      };
    },
    changeUiLanguage(code, { restart } = {}) {
      if (typeof restart !== 'boolean') return false;
      const allowed = selectable();
      if (code !== 'system' && !allowed.includes(code)) return false;
      if (!settings.setUiLanguage(code, allowed)) return false;
      const next = resolveLocale({ setting: code, preferred: preferred(), selectable: allowed }).locale;
      if (restart && next !== requireState().locale) return restartApp();
      return true;
    },
    stringsScript() {
      const current = requireState();
      return stringsScriptFor({ source: loadStringsSource(current.locale), formatLocale: current.formatLocale, strict });
    },
  };
}

module.exports = { resolveLocale, formattingLocale, selectableCodes, testOverrides, stringsScriptFor, createMainI18n };
