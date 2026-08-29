'use strict';

const { FILL_COPY } = require('../renderer/fill-status-copy');

const MODES = Object.freeze({ DECISION: 'decision', NOTICE: 'notice' });

const notice = (level) => Object.freeze({ mode: MODES.NOTICE, level, verbs: Object.freeze(['dismiss']) });
const decision = (primaryVerb) => Object.freeze({ mode: MODES.DECISION, verbs: Object.freeze([primaryVerb, 'cancel']) });

const FILL_KINDS = Object.freeze({
  'setup-enable': decision('open-settings'),
  'setup-account': decision('open-settings'),
  'confirm-heuristic': decision('fill'),
  busy: notice('error'),
  'unsupported-page': notice('error'),
  'page-changed': notice('error'),
  'no-form': notice('error'),
  'no-match': notice('error'),
  'empty-login': notice('error'),
  'nothing-filled': notice('error'),
  unexpected: notice('error'),
  'desktop-unavailable': notice('error'),
  'account-not-found': notice('error'),
  'not-authorized': notice('error'),
  'session-expired': notice('error'),
  'timed-out': notice('error'),
  'broker-stopped': notice('error'),
  'sdk-error': notice('error'),
  'selection-changed': notice('error'),
  filled: notice('success'),
});

function kindForErrorCode(code) {
  if (code === 'broker-unavailable') return 'broker-stopped';
  return FILL_KINDS[code] ? code : 'sdk-error';
}

module.exports = { FILL_KINDS, MODES, kindForErrorCode, FILL_COPY };
