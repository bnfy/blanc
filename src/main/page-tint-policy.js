'use strict';

// Website tabs use their rendered top edge as the Island strip's faux header.
// The Start Page is the one internal surface that should participate too: its
// Sunrise backdrop is the page itself, rather than utility chrome such as
// Settings or History.
function shouldSamplePageTint(tab) {
  if (!tab || tab.private || typeof tab.url !== 'string') return false;

  try {
    const url = new URL(tab.url);
    return url.protocol === 'http:'
      || url.protocol === 'https:'
      || (url.protocol === 'blanc:' && url.hostname === 'newtab');
  } catch {
    return false;
  }
}

module.exports = { shouldSamplePageTint };
