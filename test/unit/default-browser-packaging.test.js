const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const pkg = require(path.join(root, 'package.json'));
const installer = fs.readFileSync(path.join(root, 'build', 'installer.nsh'), 'utf8');
const {
  WINDOWS_HTML_PROGID, USER_CHOICE_KEY, parseUserChoiceProgId, isWindowsDefaultBrowser,
} = require('../../src/main/windows-default-browser');

// Windows only lists an app under Settings > Default apps (and in the
// http/https chooser) when the Default Programs contract is registered:
// RegisteredApplications -> Capabilities -> ProgId. These keys live in the
// NSIS installer, so a static scan is the only cross-platform guard.
test('Windows installer registers Blanc as a browser under the Default Programs contract', () => {
  const clientKey = 'Software\\Clients\\StartMenuInternet\\${PRODUCT_NAME}';
  assert.match(installer, /!macro customInstall\b/);
  assert.match(installer, /!macro customUnInstall\b/);
  assert.ok(installer.includes(`!define BLANC_CLIENT_KEY "${clientKey}"`));
  // The runtime UserChoice check compares against the ProgId the installer registers.
  assert.ok(installer.includes(`!define BLANC_HTML_PROGID "${WINDOWS_HTML_PROGID}"`));

  const install = installer.slice(installer.indexOf('!macro customInstall'), installer.indexOf('!macro customUnInstall'));
  const uninstall = installer.slice(installer.indexOf('!macro customUnInstall'));

  for (const line of [
    'WriteRegStr SHELL_CONTEXT "Software\\RegisteredApplications" "${PRODUCT_NAME}" "${BLANC_CLIENT_KEY}\\Capabilities"',
    'WriteRegStr SHELL_CONTEXT "${BLANC_CLIENT_KEY}\\Capabilities\\URLAssociations" "http" "${BLANC_HTML_PROGID}"',
    'WriteRegStr SHELL_CONTEXT "${BLANC_CLIENT_KEY}\\Capabilities\\URLAssociations" "https" "${BLANC_HTML_PROGID}"',
    'WriteRegStr SHELL_CONTEXT "${BLANC_CLIENT_KEY}\\Capabilities\\StartMenu" "StartMenuInternet" "${PRODUCT_NAME}"',
    'WriteRegStr SHELL_CONTEXT "${BLANC_CLIENT_KEY}\\shell\\open\\command" "" \'"$INSTDIR\\${APP_EXECUTABLE_FILENAME}"\'',
    'WriteRegStr SHELL_CONTEXT "Software\\Classes\\${BLANC_HTML_PROGID}\\shell\\open\\command" "" \'"$INSTDIR\\${APP_EXECUTABLE_FILENAME}" "%1"\'',
  ]) {
    assert.ok(install.includes(line), `installer writes: ${line}`);
  }

  // Every registration must be undone on uninstall or Windows keeps offering
  // a browser whose executable is gone.
  for (const line of [
    'DeleteRegValue SHELL_CONTEXT "Software\\RegisteredApplications" "${PRODUCT_NAME}"',
    'DeleteRegKey SHELL_CONTEXT "${BLANC_CLIENT_KEY}"',
    'DeleteRegKey SHELL_CONTEXT "Software\\Classes\\${BLANC_HTML_PROGID}"',
  ]) {
    assert.ok(uninstall.includes(line), `uninstaller removes: ${line}`);
  }

  // Blanc's argv handling accepts only http(s) URLs (startup-urls.js), so the
  // installer must not invite Windows to hand it local .html files.
  assert.doesNotMatch(install, /FileAssociations/);

  // SHELL_CONTEXT follows the per-user/per-machine install mode; a hard-coded
  // hive would register the wrong half of a per-machine install.
  assert.doesNotMatch(install + uninstall, /WriteReg\w+ HK(CU|LM)|DeleteReg\w+ HK(CU|LM)/);
});

// Linux desktop environments list default-browser candidates by the desktop
// entry's Categories and MimeType keys. electron-builder emits
// x-scheme-handler/* from build.protocols and the rest from linux.mimeTypes
// and linux.category.
test('Linux desktop entry advertises Blanc as a web browser', () => {
  const schemes = pkg.build.protocols.flatMap((p) => p.schemes);
  assert.ok(schemes.includes('http') && schemes.includes('https'));

  const categories = pkg.build.linux.category.split(';').filter(Boolean);
  assert.ok(categories.includes('Network'));
  assert.ok(categories.includes('WebBrowser'));

  const mimeTypes = pkg.build.linux.mimeTypes;
  assert.ok(mimeTypes.includes('text/html'));
  assert.ok(mimeTypes.includes('application/xhtml+xml'));
});

// Windows 10+ only honours the per-user UserChoice ProgId, which Settings
// alone may write. Electron's isDefaultProtocolClient reads back our own
// protocol write instead, so the status must come from reg.exe.
test('Windows default status is read from the UserChoice ProgId, not our own handler write', () => {
  const regOutput = [
    '',
    'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\http\\UserChoice',
    '    ProgId    REG_SZ    BlancHTML',
    '',
  ].join('\r\n');
  assert.equal(parseUserChoiceProgId(regOutput), 'BlancHTML');
  assert.equal(parseUserChoiceProgId(regOutput.replace('BlancHTML', 'ChromeHTML')), 'ChromeHTML');
  assert.equal(parseUserChoiceProgId('ERROR: The system was unable to find the specified registry key or value.'), null);
  assert.equal(parseUserChoiceProgId(undefined), null);

  const calls = [];
  const execFileSync = (file, args) => {
    calls.push([file, args]);
    return regOutput;
  };
  assert.equal(isWindowsDefaultBrowser({ execFileSync }), true);
  assert.deepEqual(calls[0], ['reg.exe', ['query', USER_CHOICE_KEY('http'), '/v', 'ProgId']]);
  assert.equal(isWindowsDefaultBrowser({ execFileSync: () => regOutput.replace('BlancHTML', 'MSEdgeHTM') }), false);
  assert.equal(isWindowsDefaultBrowser({ execFileSync: () => { throw new Error('exit 1'); } }), false);
});
