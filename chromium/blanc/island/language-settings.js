'use strict';
// Settings → Language (F44), ported from shipping v1.45.1 (src/renderer/pages/
// settings.js and settings-language-model.js). The choice is stored natively
// (blanc/browser/ui/ui_language.h) and applies after a relaunch; this launch's
// language is the one strings.js resolved. tools/ui-language.test.mjs checks
// the languages and the system resolution against shipping.
const UI_LANGUAGES = [
  { code: 'en', endonym: 'English' },
  { code: 'de', endonym: 'Deutsch' },
  { code: 'es', endonym: 'Español' },
  { code: 'fr', endonym: 'Français' },
  { code: 'it', endonym: 'Italiano' },
  { code: 'pt-BR', endonym: 'Português do Brasil' },
];

// Shipping's resolveLocale for "system": each preferred language's exact
// catalog, its language, else the same language's regional catalog.
function resolveSystem(preferred) {
  const codes = UI_LANGUAGES.map((l) => l.code);
  const primaryOf = (code) => code.toLowerCase().split('-')[0];
  for (const tag of preferred ?? []) {
    const wanted = String(tag).replace(/_/g, '-').toLowerCase();
    const match = codes.find((code) => code.toLowerCase() === wanted)
      ?? codes.find((code) => code === primaryOf(wanted))
      ?? codes.find((code) => primaryOf(code) === primaryOf(wanted));
    if (match) return match;
  }
  return 'en';
}

const resolvedFor = (value, languages) => (value === 'system' ? languages.system : value);

function languageRow({ uiLanguage, languages, t }) {
  const options = languages?.options ?? [];
  if (options.length < 2) return { visible: false, options: [] };
  const endonym = new Map(options.map((o) => [o.code, o.endonym]));
  const selected = uiLanguage === 'system' || endonym.has(uiLanguage) ? uiLanguage : 'en';
  return {
    visible: true,
    selected,
    options: [
      { value: 'system', label: t('settings.language.system', { language: endonym.get(languages.system) ?? endonym.get('en') }) },
      ...options.map((o) => ({ value: o.code, label: o.endonym })),
    ],
  };
}

function needsRelaunch(value, languages) {
  return resolvedFor(value, languages) !== languages.active;
}

if (typeof module !== 'undefined') module.exports = { UI_LANGUAGES, resolveSystem, languageRow, needsRelaunch };
if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', async () => {
  const bridge = window.blancSearchSettings;
  const setting = document.getElementById('uiLanguageSetting');
  if (!bridge || !window.blancI18n || !window.blancStrings) { setting.remove(); return; }
  const t = window.blancI18n.t;
  for (const element of setting.querySelectorAll('[data-language-i18n]'))
    element.textContent = t(element.dataset.languageI18n);
  const languages = {
    active: window.blancStrings.locale,
    system: resolveSystem(navigator.languages?.length ? navigator.languages : [navigator.language]),
    options: UI_LANGUAGES,
  };
  const row = languageRow({ uiLanguage: (await bridge.get()).uiLanguage, languages, t });
  if (!row.visible) { setting.remove(); return; }
  const select = document.getElementById('uiLanguage');
  const relaunch = document.getElementById('uiLanguageRelaunch');
  select.setAttribute('aria-label', t('settings.language.label'));
  select.replaceChildren(...row.options.map((option) => {
    const el = document.createElement('option');
    el.value = option.value;
    el.textContent = option.label;
    return el;
  }));
  select.value = row.selected;
  let committed = row.selected;
  const syncRelaunch = () => { relaunch.hidden = !needsRelaunch(select.value, languages); };
  select.addEventListener('change', async () => {
    const stored = (await bridge.set({ uiLanguage: select.value })).uiLanguage;
    if (stored === select.value) committed = select.value;
    else select.value = committed;
    syncRelaunch();
  });
  relaunch.addEventListener('click', () => bridge.relaunch());
  setting.hidden = false;
  syncRelaunch();
});
