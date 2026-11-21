// Owner, 2026-11-21 ("fix them"): on Windows, Blanc Beta's Settings → About
// had no way to check for updates and reported the Mac's facts. Patch 0111
// shows Chromium's own update status there on the Windows beta (its
// version_updater_win already talks to Blanc's updater, W3) with a Check for
// Updates… button that runs Chromium's check again, and hides the Electron
// import row where the importer can't read that app's data (Windows). The
// trust receipt reports the platform it runs on, the Windows build number and,
// on Windows, the Authenticode publisher against Bananify Creative.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';

const file = rel => fileURLToPath(new URL(`../${rel}`, import.meta.url));
const NAME = '0111-blanc-windows-about-updates.patch';
const patch = fs.existsSync(file(`patches/${NAME}`)) ? fs.readFileSync(file(`patches/${NAME}`), 'utf8') : '';
function added(name) {
  const start = patch.indexOf(`+++ b/${name}\n`);
  assert.ok(start >= 0, `0111 patches ${name}`);
  const end = patch.indexOf('\ndiff --git ', start);
  return patch.slice(start, end < 0 ? undefined : end).split('\n')
    .filter(l => l.startsWith('+') && !l.startsWith('+++')).map(l => l.slice(1)).join('\n');
}

test('patch 0111 follows 0110 in the desktop lane', () => {
  const lane = JSON.parse(fs.readFileSync(file('lanes/desktop.json'), 'utf8')).patches.map(p => p.split('/').pop());
  assert.equal(lane.indexOf(NAME), lane.indexOf('0110-blanc-restore-pages-button.patch') + 1);
});

test('the page learns which platform has which update path and import', () => {
  const ui = added('chrome/browser/ui/webui/settings/settings_ui.cc');
  assert.match(ui, /AddBoolean\("blancWindowsUpdater", blanc_prototype::IsBetaBuild\(\) && BUILDFLAG\(IS_WIN\)\)/);
  assert.match(ui, /AddBoolean\("blancProfileImportAvailable", BUILDFLAG\(IS_MAC\)\)/);
});

test('on the Windows beta, Chromium\'s update status shows and a button checks again', () => {
  const html = added('chrome/browser/resources/settings/about_page/about_page.html.ts');
  assert.match(html, /\?hidden="\$\{!this\.windowsUpdater_ \|\| !this\.shouldShowIcons_\(\)\}"/, 'the status icon');
  assert.match(html, /\?hidden="\$\{!this\.windowsUpdater_ \|\| !this\.showUpdateStatus_\}"/, 'the status message');
  assert.match(html, /id="blancWindowsCheck"[\s\S]*@click="\$\{this\.onBlancWindowsCheckClick_\}"[\s\S]*Check for Updates…/);
  assert.doesNotMatch(html, /support\.google\.com/, 'no new link to Google\'s help');
  const ts = added('chrome/browser/resources/settings/about_page/about_page.ts');
  assert.match(ts, /windowsUpdater_ = loadTimeData\.getBoolean\('blancWindowsUpdater'\)/);
  assert.match(ts, /onBlancWindowsCheckClick_\(\)[\s\S]*this\.aboutBrowserProxy_\.refreshUpdateStatus\(\)/);
  assert.match(ts, /UpdateStatus\.CHECKING[\s\S]*UpdateStatus\.UPDATING/, 'no second check while one runs');
});

test('the Electron import row shows only where the importer can read that app', () => {
  const html = added('chrome/browser/resources/settings/about_page/about_page.html.ts');
  assert.match(html, /\$\{this\.profileImportAvailable_ \? html`/);
  const ts = added('chrome/browser/resources/settings/about_page/about_page.ts');
  assert.match(ts, /profileImportAvailable_ = loadTimeData\.getBoolean\('blancProfileImportAvailable'\)/);
});

test('the trust receipt reports this platform, build and publisher', () => {
  const receipt = fs.readFileSync(file('blanc/browser/ui/trust_receipt.inc'), 'utf8');
  assert.doesNotMatch(receipt, /\.Set\("platform", "macOS"\)/, 'not always macOS');
  assert.match(receipt, /kPlatformName\[\] =[\s\S]*"Windows"[\s\S]*"macOS"[\s\S]*"Linux"/);
  assert.match(receipt, /kExpectedWindowsPublisher\[\] = "Bananify Creative"/);
  assert.match(receipt, /WinVerifyTrust/);
  // The Windows beta's build is its version's last number (158.0.8127.<build>).
  assert.match(receipt, /#elif BUILDFLAG\(IS_WIN\)[\s\S]*build = .*components\(\)\.back\(\)/);
});
