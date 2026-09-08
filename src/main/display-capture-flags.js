'use strict';

const MAC_CATAP_LOOPBACK_FEATURE = 'MacCatapLoopbackAudioForScreenShare';

function mergeDisabledFeatures(existing, extras) {
  const parts = String(existing || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const extra of extras) {
    if (extra && !parts.includes(extra)) parts.push(extra);
  }
  return parts.join(',');
}

module.exports = { mergeDisabledFeatures, MAC_CATAP_LOOPBACK_FEATURE };
