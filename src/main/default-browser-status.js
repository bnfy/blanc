'use strict';

const { isWindowsDefaultBrowser: readWindowsUserChoice } = require('./windows-default-browser');

// Default-browser state lives in LaunchServices/the OS, not settings.json.
// canSet: a dev run must never register the bare Electron binary as a
// browser, and Linux has no default-protocol-client API in Electron.
// On Windows, isDefaultProtocolClient only echoes our own protocol write,
// so the answer comes from the real UserChoice key instead. Shared by the
// pages:default-browser:* handlers and the first-day default signal so both
// always agree.
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
    canSet: app.isPackaged && platform !== 'linux',
  });
}

module.exports = { createDefaultBrowserStatus };
