'use strict';
const assert = require('node:assert/strict');
// Synthetic capture only. Return original observed metadata, never an origin
// substitute. The ordinary recorder's admission policy is not changed.
function frameObserverScrub(base, authoredDataUrls = []) {
  assert(Array.isArray(authoredDataUrls));
  const known = new Set(authoredDataUrls);
  for (const value of known) assert(typeof value === 'string' && value.startsWith('data:text/html;charset=utf-8,'));
  return {...base, decision(row) {
    const checked = {...row, frame: row.frame && {...row.frame}};
    const sentinel = value => value === 'about:blank' || value === 'about:srcdoc';
    if (sentinel(checked.tabUrl)) checked.tabUrl = null;
    if (checked.frame) for (const key of ['url', 'topUrl']) {
      const value = checked.frame[key];
      if (sentinel(value) || known.has(value)) checked.frame[key] = null;
    }
    base.decision(checked); // Every network field and all remaining metadata still checked.
    return row;
  }};
}
module.exports = {frameObserverScrub};
