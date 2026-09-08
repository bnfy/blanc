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

// Packaged AppImages often inherit DISPLAY from XWayland while the session is
// Wayland. Chromium then picks the X11 ozone path and desktop capture dies
// with shared_x_display "Unable to open display". Prefer Wayland whenever the
// session already says so, unless the operator pinned ozone-platform.
function shouldPreferWaylandOzone(platform, env = process.env, hasOzonePlatform = false) {
  if (platform !== 'linux' || hasOzonePlatform) return false;
  return env.XDG_SESSION_TYPE === 'wayland' || !!env.WAYLAND_DISPLAY;
}

function applyLinuxCaptureOzone(commandLine, {
  platform = process.platform,
  env = process.env,
} = {}) {
  const hasOzone = typeof commandLine?.hasSwitch === 'function'
    ? commandLine.hasSwitch('ozone-platform')
    : !!commandLine?.getSwitchValue?.('ozone-platform');
  if (!shouldPreferWaylandOzone(platform, env, hasOzone)) return false;
  commandLine.appendSwitch('ozone-platform', 'wayland');
  return true;
}

module.exports = {
  mergeDisabledFeatures,
  MAC_CATAP_LOOPBACK_FEATURE,
  LINUX_INPUT_VOLUME_FEATURE,
  captureDisabledFeatures,
  shouldPreferWaylandOzone,
  applyLinuxCaptureOzone,
};
