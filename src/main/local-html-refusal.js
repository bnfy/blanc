'use strict';

// Turns the local HTML files the static preview refused into one native
// message (#1634 follow-up). Pure: main passes its translator and shows the
// result. The preview tags each refusal with `localHtmlRefusal`; anything
// untagged (a read error, a failed load) is "couldn't be read".
const path = require('node:path');

const REASON_KEYS = Object.freeze({
  'not-html': 'localHtml.refused.notHtml',
  'too-large': 'localHtml.refused.tooLarge',
  changed: 'localHtml.refused.changed',
  unreadable: 'localHtml.refused.unreadable',
});

function refusalReason(error) {
  const reason = error?.localHtmlRefusal;
  return Object.hasOwn(REASON_KEYS, reason) ? reason : 'unreadable';
}

/** `refused` is `[{ file, error }]`. Returns `{ message, detail }`, or null
 * when nothing was refused. */
function localHtmlRefusalMessage(t, refused) {
  if (!refused?.length) return null;
  const lines = refused.map(({ file, error }) => ({
    name: typeof file === 'string' ? path.basename(file) : '', reason: t(REASON_KEYS[refusalReason(error)]),
  }));
  if (lines.length === 1) {
    return { message: t('localHtml.refused.message', { name: lines[0].name }), detail: lines[0].reason };
  }
  return {
    message: t('localHtml.refused.messageMany', { count: lines.length }),
    detail: lines.map(({ name, reason }) => t('localHtml.refused.line', { name, reason })).join('\n'),
  };
}

module.exports = { REASON_KEYS, refusalReason, localHtmlRefusalMessage };
