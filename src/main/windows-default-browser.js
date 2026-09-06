'use strict';

// Windows 10+ decides the default browser through the per-user UserChoice
// key, which only Settings > Default apps may write. Electron's
// isDefaultProtocolClient never looks there: it compares
// HKCU\Software\Classes\<protocol>\shell\open\command with our own exe,
// i.e. it reads back whatever setAsDefaultProtocolClient last wrote, so it
// would report "default" the moment Blanc asked to be. The truth is the
// UserChoice ProgIds, which equal the ProgId build/installer.nsh registers
// when the user actually picked Blanc for both web schemes.
const WINDOWS_URL_PROGID = 'BlancURL';
const USER_CHOICE_KEY = (scheme) =>
  `HKCU\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\${scheme}\\UserChoice`;

/** Parse `reg query ... /v ProgId` output into the ProgId string, or null. */
function parseUserChoiceProgId(output) {
  if (typeof output !== 'string') return null;
  const match = output.match(/^\s*ProgId\s+REG_SZ\s+(\S+)\s*$/im);
  return match ? match[1] : null;
}

function isWindowsDefaultBrowser({
  execFileSync,
  schemes = ['http', 'https'],
  progId = WINDOWS_URL_PROGID,
} = {}) {
  return schemes.every((scheme) => {
    let output;
    try {
      output = execFileSync('reg.exe', ['query', USER_CHOICE_KEY(scheme), '/v', 'ProgId'], {
        encoding: 'utf8',
        windowsHide: true,
        timeout: 2000,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
    } catch {
      // No UserChoice value (fresh profile) or reg.exe failure: not default.
      return false;
    }
    return parseUserChoiceProgId(output)?.toLowerCase() === progId.toLowerCase();
  });
}

module.exports = { WINDOWS_URL_PROGID, USER_CHOICE_KEY, parseUserChoiceProgId, isWindowsDefaultBrowser };
