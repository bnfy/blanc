'use strict';

const MAC_CATAP_LOOPBACK_FEATURE = 'MacCatapLoopbackAudioForScreenShare';
const LINUX_INPUT_VOLUME_FEATURE = 'WebRtcAllowInputVolumeAdjustment';

function captureDisabledFeatures(platform) {
  if (platform === 'darwin') return [MAC_CATAP_LOOPBACK_FEATURE];
  // Process-wide: also disables APM input-volume recommendations for page
  // microphones. Keep mic/camera coexistence in the Linux packaged gate.
  if (platform === 'linux') return [LINUX_INPUT_VOLUME_FEATURE];
  return [];
}

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

module.exports = { mergeDisabledFeatures, MAC_CATAP_LOOPBACK_FEATURE,
  LINUX_INPUT_VOLUME_FEATURE, captureDisabledFeatures };
