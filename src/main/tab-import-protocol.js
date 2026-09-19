'use strict';

const TAB_IMPORT_SCHEME = 'blanc-import';

/**
 * electron-builder emits the macOS URL type and Linux desktop MIME metadata.
 * Windows needs the packaged executable to claim its private scheme in HKCU;
 * do that on every packaged startup so repairs and per-user installs converge.
 */
function registerWindowsTabImportProtocol(app, { platform = process.platform } = {}) {
  if (!app?.isPackaged || platform !== 'win32') {
    return { attempted: false, registered: false };
  }
  try {
    return {
      attempted: true,
      registered: app.setAsDefaultProtocolClient(TAB_IMPORT_SCHEME) === true,
    };
  } catch {
    return { attempted: true, registered: false };
  }
}

module.exports = { TAB_IMPORT_SCHEME, registerWindowsTabImportProtocol };
