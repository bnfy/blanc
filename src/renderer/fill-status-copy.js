'use strict';
// The fill capsule's copy table: which strings each fill kind shows. The text
// itself lives in the interface catalog (copy/messages, keys fill.<kind>.*).
// Served to the capsule renderer over blanc-chrome:// (built with the page's
// blancI18n) AND required by main for the native dialog fallback (built with
// mainI18n) — no other file may define fill-flow copy. Fixed strings only:
// nothing here may ever embed page-, vault-, or account-derived data, so no
// fill message takes a placeholder.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    // Node consumers (tests, main's kind table) get the English table.
    const { createTranslator } = require('./pages/i18n.js');
    const strings = require('./pages/strings.en.js');
    api.FILL_COPY = api.fillCopy(createTranslator({ locale: 'en', messages: strings.messages }));
    module.exports = api;
  } else {
    api.FILL_COPY = api.fillCopy(root.blancI18n.t);
    root.blancFillCopy = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  // kind → catalog key segment; decision kinds also carry button labels.
  const DECISIONS = {
    'setup-enable': 'setupEnable',
    'setup-account': 'setupAccount',
    'confirm-heuristic': 'confirmHeuristic',
  };
  const NOTICES = {
    busy: 'busy',
    'unsupported-page': 'unsupportedPage',
    'page-changed': 'pageChanged',
    'no-form': 'noForm',
    'no-match': 'noMatch',
    'empty-login': 'emptyLogin',
    'nothing-filled': 'nothingFilled',
    unexpected: 'unexpected',
    'desktop-unavailable': 'desktopUnavailable',
    'account-not-found': 'accountNotFound',
    'not-authorized': 'notAuthorized',
    'session-expired': 'sessionExpired',
    'timed-out': 'timedOut',
    'broker-stopped': 'brokerStopped',
    'sdk-error': 'sdkError',
    'selection-changed': 'selectionChanged',
  };

  function fillCopy(t) {
    const table = {};
    for (const [kind, id] of Object.entries(DECISIONS)) {
      table[kind] = {
        title: t(`fill.${id}.title`),
        body: t(`fill.${id}.body`),
        primaryLabel: t(`fill.${id}.primaryLabel`),
        cancelLabel: t(`fill.${id}.cancelLabel`),
      };
    }
    for (const [kind, id] of Object.entries(NOTICES)) {
      table[kind] = { title: t(`fill.${id}.title`), body: t(`fill.${id}.body`) };
    }
    // Success is a title-only confirmation.
    table.filled = { title: t('fill.filled.title'), body: '' };
    return Object.freeze(table);
  }

  return { fillCopy };
});
