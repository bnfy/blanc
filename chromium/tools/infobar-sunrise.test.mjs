// Owner, 2026-11-21 ("rebrand it"): the "Pin Blanc to your taskbar" bar kept
// Chromium's logo in dark mode and a blue button. Patch 0085's Island bar
// styling now swaps every Chromium product icon the bars use for the Sunrise,
// including dark mode's omnibox::kChromeProductIcon, and gives a bar's
// prominent button the Sunrise accent; patch 0098 names the Windows channel in
// the pin bar ("Pin Blanc Beta to your taskbar …").
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';

const file = rel => fileURLToPath(new URL(`../${rel}`, import.meta.url));
function added(patchName, name) {
  const patch = fs.readFileSync(file(`patches/${patchName}`), 'utf8');
  const start = patch.indexOf(`+++ b/${name}\n`);
  assert.ok(start >= 0, `${patchName} patches ${name}`);
  const end = patch.indexOf('\ndiff --git ', start);
  return patch.slice(start, end < 0 ? undefined : end).split('\n')
    .filter(l => l.startsWith('+') && !l.startsWith('+++')).map(l => l.slice(1)).join('\n');
}

test('Island bars swap every Chromium product icon for the Sunrise, dark mode\'s too', () => {
  const view = added('0085-blanc-infobar-band.patch', 'chrome/browser/ui/views/infobars/infobar_view.cc');
  for (const icon of ['kProductRefreshIcon', 'kProductChromeRefreshOldIcon', 'kChromeProductIcon'])
    assert.ok(view.includes(`"${icon}"`), icon);
});

test('a bar\'s prominent button takes the Sunrise accent in light and dark', () => {
  const view = added('0085-blanc-infobar-band.patch', 'chrome/browser/ui/views/infobars/infobar_view.cc');
  assert.match(view, /views::AsViewClass<views::MdTextButton>/);
  assert.match(view, /ui::ButtonStyle::kProminent/);
  assert.match(view, /SkColorSetRGB\(0x80, 0x5d, 0x28\)/);
  assert.match(view, /SkColorSetRGB\(0xd4, 0xad, 0x66\)/);
  assert.match(view, /SkColorSetRGB\(0x17, 0x13, 0x0f\)/);
});

test('the Windows pin bar names the channel', () => {
  const pin = added('0098-blanc-windows-identity.patch',
    'chrome/browser/ui/startup/default_browser_prompt/pin_infobar/pin_infobar_controller.cc');
  assert.match(pin, /Pin \$1 to your taskbar to get to it quickly anytime/);
  assert.match(pin, /u"Pin \$1"/);
  assert.match(pin, /install_static::GetBaseAppName\(\)/);
});
