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
  const start = view.indexOf('views::AsViewClass<views::MdTextButton>');
  assert.ok(start >= 0, 'the prominent-button branch');
  const branch = view.slice(start, view.indexOf('continue;', start) + 'continue;'.length);
  assert.match(branch, /ui::ButtonStyle::kProminent/);
  // A dark bar takes the light gold, a light bar the deep brown.
  assert.match(branch, /dark \? SkColorSetRGB\(0xd4, 0xad, 0x66\)\s*:\s*SkColorSetRGB\(0x80, 0x5d, 0x28\)/);
  // Kept visible against the bar's own color (a site's color can be gold too).
  assert.match(branch, /color_utils::BlendForMinContrast\([\s\S]*style->background[\s\S]*3\.0f\)/);
  // The label follows the fill: white on a dark fill, ink on a light one.
  assert.match(branch, /color_utils::IsDark\(fill\) \? SK_ColorWHITE : SkColorSetRGB\(0x17, 0x13, 0x0f\)/);
  // The walk stops at the button, so the bar's ink never reaches its label.
  assert.ok(branch.endsWith('continue;'), 'the branch ends the walk at the button');
});

test('the Windows pin bar names the channel', () => {
  const pin = added('0098-blanc-windows-identity.patch',
    'chrome/browser/ui/startup/default_browser_prompt/pin_infobar/pin_infobar_controller.cc');
  assert.match(pin, /Pin \$1 to your taskbar to get to it quickly anytime/);
  assert.match(pin, /u"Pin \$1"/);
  assert.match(pin, /install_static::GetBaseAppName\(\)/);
});

// Windows, 2026-11-21: the band color reached the native side after the bars
// were themed, and Widget::ThemeChanged() didn't reach them again (a VM
// diagnostic build logged the color arriving with two bars showing, and no
// second style pass). The bandColor handler restyles each bar directly.
test('a band color arriving restyles each bar directly, not through the widget', () => {
  const ui = fs.readFileSync(file('blanc/browser/ui/blanc_prototype_ui.cc'), 'utf8');
  const start = ui.indexOf('if (method == "bandColor"');
  assert.ok(start >= 0, 'the bandColor handler');
  const handler = ui.slice(start, ui.indexOf('\n    }\n', start));
  assert.match(handler, /views::AsViewClass<InfoBarView>\(child\)/);
  assert.match(handler, /infobar->OnThemeChanged\(\)/);
  assert.doesNotMatch(handler, /GetWidget\(\)->ThemeChanged\(\)/);
});
