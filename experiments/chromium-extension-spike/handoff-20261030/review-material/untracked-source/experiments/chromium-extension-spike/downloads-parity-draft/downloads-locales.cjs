'use strict';
const additions = require('./downloads-locales.json');
const LOCALES = Object.freeze(['en','en-XA','de','es','fr','it','pt-BR']);
const KEYS = Object.freeze(['downloads.loadError','downloads.updating','downloads.actionUnconfirmed','downloads.securityReview','downloads.securityUnknown']);
function merge(locale, original) {
  if (!LOCALES.includes(locale) || !original || original.locale !== locale || !original.messages || !additions[locale]) throw new TypeError('Invalid locale');
  const added = additions[locale];
  if (Object.keys(added).sort().join('\0') !== [...KEYS].sort().join('\0')) throw new TypeError('Incomplete locale');
  for (const key of KEYS) {
    if (Object.hasOwn(original.messages,key) || typeof added[key] !== 'string' || !added[key].trim()) throw new TypeError('Locale collision or empty message');
  }
  return {...original, messages:{...original.messages, ...added}};
}
module.exports = {merge,LOCALES,KEYS};
