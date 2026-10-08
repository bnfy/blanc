'use strict';

// Bananify runs sync, usage counting, and the tab-import relay for official
// Blanc builds. A build published under another product name stops calling
// them on its own, while any server that build runs itself is unaffected.
// This is not a security boundary: anyone can edit it out of a fork, and the
// Workers' own rate limits stay the defense against deliberate misuse.
//
// The product name comes from the packaged package.json, the same value
// Electron uses for app.getName(), so plain `node --test` can load this file.
const { productName } = require('../../package.json');

const OFFICIAL_APP_NAME = 'Blanc';

function isBananifyServiceUrl(url) {
  let host;
  try {
    host = new URL(url).hostname;
  } catch {
    return true; // unreadable: treat as ours, so the check below fails closed
  }
  return host === 'blancbrowser.com'
    || host.endsWith('.blancbrowser.com')
    || host.endsWith('.bnfy-441.workers.dev');
}

function bananifyServiceAllowed(url, appName = productName) {
  return appName === OFFICIAL_APP_NAME || !isBananifyServiceUrl(url);
}

module.exports = { OFFICIAL_APP_NAME, isBananifyServiceUrl, bananifyServiceAllowed };
