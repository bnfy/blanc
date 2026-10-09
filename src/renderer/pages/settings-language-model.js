'use strict';
// Settings → General → Language row. Served flat to the settings page via a
// <script> tag AND require-able by node tests (same pattern as
// settings-nav-model.js). Endonyms are never translated.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.blancSettingsLanguage = api;
})(typeof self !== 'undefined' ? self : this, function () {
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

  return { languageRow, needsRelaunch };
});
