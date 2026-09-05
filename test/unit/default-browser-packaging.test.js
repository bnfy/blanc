const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const pkg = require(path.join(root, 'package.json'));
const installer = fs.readFileSync(path.join(root, 'build', 'installer.nsh'), 'utf8');

// Windows only lists an app under Settings > Default apps (and in the
// http/https chooser) when the Default Programs contract is registered:
// RegisteredApplications -> Capabilities -> ProgId. These keys live in the
// NSIS installer, so a static scan is the only cross-platform guard.
test('Windows installer registers Blanc as a browser under the Default Programs contract', () => {
  const clientKey = 'Software\\Clients\\StartMenuInternet\\${PRODUCT_NAME}';
  assert.match(installer, /!macro customInstall\b/);
  assert.match(installer, /!macro customUnInstall\b/);
  assert.ok(installer.includes(`!define BLANC_CLIENT_KEY "${clientKey}"`));

  const install = installer.slice(installer.indexOf('!macro customInstall'), installer.indexOf('!macro customUnInstall'));
  const uninstall = installer.slice(installer.indexOf('!macro customUnInstall'));

  for (const line of [
    'WriteRegStr SHELL_CONTEXT "Software\\RegisteredApplications" "${PRODUCT_NAME}" "${BLANC_CLIENT_KEY}\\Capabilities"',
    'WriteRegStr SHELL_CONTEXT "${BLANC_CLIENT_KEY}\\Capabilities\\URLAssociations" "http" "${BLANC_HTML_PROGID}"',
    'WriteRegStr SHELL_CONTEXT "${BLANC_CLIENT_KEY}\\Capabilities\\URLAssociations" "https" "${BLANC_HTML_PROGID}"',
    'WriteRegStr SHELL_CONTEXT "${BLANC_CLIENT_KEY}\\Capabilities\\FileAssociations" ".html" "${BLANC_HTML_PROGID}"',
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
