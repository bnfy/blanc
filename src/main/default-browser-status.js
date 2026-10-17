'use strict';

const { isWindowsDefaultBrowser: readWindowsUserChoice } = require('./windows-default-browser');

// Default-browser state lives in LaunchServices/the OS, not settings.json.
// canSet: a dev run must never register the bare Electron binary as a
// browser, and Linux has no default-protocol-client API in Electron.
// On Windows, isDefaultProtocolClient only echoes our own protocol write,
// so the answer comes from the real UserChoice key instead. Shared by the
// pages:default-browser:* handlers, the moving-in checklist, the reminder
// and the first-day default signal so all of them always agree.
function canSetDefaultBrowser({ app, platform }) {
  return app.isPackaged && platform !== 'linux';
}

function createDefaultBrowserStatus({
  app,
  platform,
  execFileSync,
  isWindowsDefaultBrowser = readWindowsUserChoice,
}) {
  return () => ({
    isDefault: platform === 'win32'
      ? isWindowsDefaultBrowser({ execFileSync })
      : app.isDefaultProtocolClient('http'),
    canSet: canSetDefaultBrowser({ app, platform }),
  });
}

/** Asks the OS to make Blanc the default. No-op where canSet is false. */
function requestDefaultBrowser({ app, platform, shell }) {
  if (!canSetDefaultBrowser({ app, platform })) return false;
  if (platform === 'win32') {
    // Windows 10+ ignores a programmatic http/https handler change: the
    // user must pick the browser in Settings > Default apps, where Blanc
    // is listed by the installer's StartMenuInternet registration
    // (build/installer.nsh). Hand off to that page instead of writing a
    // protocol handler that would only fool isDefaultProtocolClient.
    shell.openExternal('ms-settings:defaultapps').catch(() => {});
  } else {
    // macOS raises its "change your default web browser?" prompt PER
    // CALL, and answering it assigns the browser role — http and https
    // together — so one call is the whole request.
    app.setAsDefaultProtocolClient('http');
  }
  return true;
}

module.exports = { canSetDefaultBrowser, createDefaultBrowserStatus, requestDefaultBrowser };
