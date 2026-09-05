const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const pkg = require(path.join(root, 'package.json'));
const installer = fs.readFileSync(path.join(root, 'build', 'installer.nsh'), 'utf8');
const releaseWorkflow = fs.readFileSync(
  path.join(root, '.github', 'workflows', 'release-windows-linux.yml'), 'utf8');
const windowsInstallGate = fs.readFileSync(
  path.join(root, 'scripts', 'verify-windows-browser-registration.ps1'), 'utf8');
const {
  WINDOWS_URL_PROGID, USER_CHOICE_KEY, parseUserChoiceProgId, isWindowsDefaultBrowser,
} = require('../../src/main/windows-default-browser');
const { verifyLinuxDesktopEntry } = require('../../scripts/verify-linux-desktop-entry');

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
  assert.ok(installer.includes(`!define BLANC_URL_PROGID "${WINDOWS_URL_PROGID}"`));

  const install = installer.slice(installer.indexOf('!macro customInstall'), installer.indexOf('!macro customUnInstall'));
  const uninstall = installer.slice(installer.indexOf('!macro customUnInstall'));

  for (const line of [
    'WriteRegStr SHELL_CONTEXT "Software\\RegisteredApplications" "${PRODUCT_NAME}" "${BLANC_CLIENT_KEY}\\Capabilities"',
    'WriteRegStr SHELL_CONTEXT "${BLANC_CLIENT_KEY}\\Capabilities\\URLAssociations" "http" "${BLANC_URL_PROGID}"',
    'WriteRegStr SHELL_CONTEXT "${BLANC_CLIENT_KEY}\\Capabilities\\URLAssociations" "https" "${BLANC_URL_PROGID}"',
    'WriteRegStr SHELL_CONTEXT "${BLANC_CLIENT_KEY}\\Capabilities\\StartMenu" "StartMenuInternet" "${PRODUCT_NAME}"',
    'WriteRegStr SHELL_CONTEXT "${BLANC_CLIENT_KEY}\\shell\\open\\command" "" \'"$INSTDIR\\${APP_EXECUTABLE_FILENAME}"\'',
    'WriteRegStr SHELL_CONTEXT "Software\\Classes\\${BLANC_URL_PROGID}" "URL Protocol" ""',
    'WriteRegStr SHELL_CONTEXT "Software\\Classes\\${BLANC_URL_PROGID}\\shell\\open\\command" "" \'"$INSTDIR\\${APP_EXECUTABLE_FILENAME}" "%1"\'',
  ]) {
    assert.ok(install.includes(line), `installer writes: ${line}`);
  }

  // Every registration must be undone on uninstall or Windows keeps offering
  // a browser whose executable is gone.
  for (const line of [
    'DeleteRegValue SHELL_CONTEXT "Software\\RegisteredApplications" "${PRODUCT_NAME}"',
    'DeleteRegKey SHELL_CONTEXT "${BLANC_CLIENT_KEY}"',
    'DeleteRegKey SHELL_CONTEXT "Software\\Classes\\${BLANC_URL_PROGID}"',
  ]) {
    assert.ok(uninstall.includes(line), `uninstaller removes: ${line}`);
  }

  // Blanc's argv handling accepts only http(s) URLs (startup-urls.js), so the
  // installer must not invite Windows to hand it local .html files.
  assert.doesNotMatch(install, /FileAssociations/);

  const registration = install.indexOf('Software\\RegisteredApplications');
  const refresh = install.indexOf('shell32::SHChangeNotify');
  const settle = install.indexOf('Sleep 1000');
  assert.ok(registration >= 0 && refresh > registration && settle > refresh,
    'association cache is flushed after registration and allowed to settle');
  assert.match(install, /SHChangeNotify\(i,i,i,i\) \(0x08000000, 0x1000, 0, 0\)/);

  // SHELL_CONTEXT follows the per-user/per-machine install mode; a hard-coded
  // hive would register the wrong half of a per-machine install.
  assert.doesNotMatch(install + uninstall, /WriteReg\w+ HK(CU|LM)|DeleteReg\w+ HK(CU|LM)/);
});

test('Linux source configuration advertises only web URL handling', () => {
  const schemes = pkg.build.protocols.flatMap((p) => p.schemes);
  assert.ok(schemes.includes('http') && schemes.includes('https'));

  const categories = pkg.build.linux.category.split(';').filter(Boolean);
  assert.ok(categories.includes('Network'));
  assert.ok(categories.includes('WebBrowser'));

  assert.equal(pkg.build.linux.mimeTypes, undefined,
    'local HTML MIME types would claim unsupported file handling');
});

// Windows 10+ only honours the per-user UserChoice ProgId, which Settings
// alone may write. Electron's isDefaultProtocolClient reads back our own
// protocol write instead, so the status must come from reg.exe.
test('Windows default status is read from the UserChoice ProgId, not our own handler write', () => {
  const regOutput = [
    '',
    'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\http\\UserChoice',
    '    ProgId    REG_SZ    BlancURL',
    '',
  ].join('\r\n');
  assert.equal(parseUserChoiceProgId(regOutput), 'BlancURL');
  assert.equal(parseUserChoiceProgId(regOutput.replace('BlancURL', 'ChromeHTML')), 'ChromeHTML');
  assert.equal(parseUserChoiceProgId('ERROR: The system was unable to find the specified registry key or value.'), null);
  assert.equal(parseUserChoiceProgId(undefined), null);

  const calls = [];
  const execFileSync = (file, args) => {
    calls.push([file, args]);
    return regOutput;
  };
  assert.equal(isWindowsDefaultBrowser({ execFileSync }), true);
  assert.deepEqual(calls[0], ['reg.exe', ['query', USER_CHOICE_KEY('http'), '/v', 'ProgId']]);
  assert.deepEqual(calls[1], ['reg.exe', ['query', USER_CHOICE_KEY('https'), '/v', 'ProgId']]);
  assert.equal(isWindowsDefaultBrowser({ execFileSync: () => regOutput.replace('BlancURL', 'MSEdgeHTM') }), false);
  assert.equal(isWindowsDefaultBrowser({ execFileSync: () => { throw new Error('exit 1'); } }), false);
});

test('Windows requires both HTTP and HTTPS choices to call Blanc the default browser', () => {
  const execFileSync = (_file, args) => [
    '    ProgId    REG_SZ    ',
    args[1].includes('https') ? 'MSEdgeHTM' : 'BlancURL',
  ].join('');
  assert.equal(isWindowsDefaultBrowser({ execFileSync }), false);
});

test('native Windows validation installs, inspects, and uninstalls the candidate', () => {
  assert.match(releaseWorkflow, /Verify installed browser registration and uninstall cleanup/);
  assert.match(releaseWorkflow, /verify-windows-browser-registration\.ps1/);
  assert.match(windowsInstallGate, /Start-Process[\s\S]+-ArgumentList '\/S'/);
  assert.match(windowsInstallGate, /Capabilities\\URLAssociations/);
  assert.match(windowsInstallGate, /associations\.http[\s\S]+associations\.https/);
  assert.match(windowsInstallGate, /QuietUninstallString/);
  assert.match(windowsInstallGate, /uninstaller left one or more browser registration entries behind/);
});

test('packaged Linux desktop entry verifier requires browser URL handlers', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-desktop-entry-'));
  const entry = path.join(directory, 'blanc.desktop');
  fs.writeFileSync(entry, [
    '[Desktop Entry]',
    'Name=Blanc',
    'Categories=Network;WebBrowser;',
    'MimeType=x-scheme-handler/http;x-scheme-handler/https;',
    '',
  ].join('\n'));

  assert.doesNotThrow(() => verifyLinuxDesktopEntry(entry));
  fs.writeFileSync(entry, fs.readFileSync(entry, 'utf8').replace(
    'MimeType=x-scheme-handler/http;',
    'MimeType=text/html;x-scheme-handler/http;',
  ));
  assert.throws(() => verifyLinuxDesktopEntry(entry), /unsupported local-file MIME type/);
});
