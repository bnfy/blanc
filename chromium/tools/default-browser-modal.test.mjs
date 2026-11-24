// Patch 0109 (owner, 2026-11-21: "rebrand it"): Chromium's "Set … as your
// default browser" dialog (chrome://default-browser-modal) speaks for Blanc.
// It showed Chromium's logo, a Google Chrome Settings picture, Google's blue
// and a sync claim Blanc doesn't make. Now: the Sunrise logo (Chromium's
// product_logo.svg, used by every page that shows the product logo), a
// Settings picture naming Blanc Beta, the Sunrise palette, and true text.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';

const file = rel => fileURLToPath(new URL(`../${rel}`, import.meta.url));
const NAME = '0109-blanc-default-browser-dialog.patch';
const patch = fs.existsSync(file(`patches/${NAME}`)) ? fs.readFileSync(file(`patches/${NAME}`), 'utf8') : '';
// The added lines of one file's diff in the patch.
function added(name) {
  const start = patch.indexOf(`+++ b/${name}\n`);
  assert.ok(start >= 0, `0109 patches ${name}`);
  const end = patch.indexOf('\ndiff --git ', start);
  return patch.slice(start, end < 0 ? undefined : end).split('\n')
    .filter(l => l.startsWith('+') && !l.startsWith('+++')).map(l => l.slice(1)).join('\n');
}

test('patch 0109 follows 0108 in the desktop lane', () => {
  const lane = JSON.parse(fs.readFileSync(file('lanes/desktop.json'), 'utf8')).patches.map(p => p.split('/').pop());
  assert.equal(lane.indexOf(NAME), lane.indexOf('0108-blanc-no-environment-api-keys.patch') + 1);
});

test('the product logo is the Sunrise master, not Chromium\'s', () => {
  const logo = added('chrome/app/theme/chromium/product_logo.svg');
  assert.match(logo, /<image [^>]*href="data:image\/png;base64,[A-Za-z0-9+/=]+"/, 'the Sunrise raster, embedded');
  assert.doesNotMatch(logo, /#(1A73E8|4285F4|DB4437|0F9D58|F4B400)/i, 'none of Chromium\'s colors');
});

test('the Settings picture names Blanc Beta, not Google Chrome', () => {
  const svg = added('chrome/browser/resources/default_browser/default_browser_modal/settings_illustration.svg');
  assert.match(svg, />Blanc Beta</);
  assert.match(svg, /Make Blanc Beta your default browser/);
  assert.match(svg, />Set default</);
  assert.doesNotMatch(svg, /Google|Chrome/);
});

test('the header art and the button take the Sunrise palette', () => {
  for (const name of ['header_background.svg', 'header_background_dark.svg']) {
    const svg = added(`chrome/browser/resources/default_browser/default_browser_modal/${name}`);
    assert.doesNotMatch(svg, /#(D3E3FD|7CACF8|6DD58C|0842A0|1B6EF3|198639)/i, name);
  }
  const css = added('chrome/browser/resources/default_browser/default_browser_modal/app.css');
  for (const value of ['#805d28', '#f2eade', '#d4ad66', '#2d251d']) assert.ok(css.includes(value), value);
  assert.match(css, /--color-button-background-prominent/);
});

test('the dialog\'s text is true for Blanc: no sync claim', () => {
  const cc = added('chrome/browser/ui/webui/default_browser/default_browser_modal_ui.cc');
  assert.match(cc, /Make \$1 your default browser/);
  assert.match(cc, /Links you open in other apps will open in \$1\./);
  assert.match(cc, /In Windows Settings, select Set default next to \$1\./);
  assert.match(cc, /install_static::GetBaseAppName\(\)/, 'the channel\'s name on Windows');
  assert.doesNotMatch(cc, /synced|passwords|bookmarks/);
});
