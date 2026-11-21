// Blanc's Settings colors (A5a): the Sunrise theme overlay holds exactly tokens/tokens.json's values.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const tokens = JSON.parse(fs.readFileSync(new URL('../../tokens/tokens.json', import.meta.url), 'utf8'));
const read = file => fs.readFileSync(new URL(`../blanc/android/island/res/${file}`, import.meta.url), 'utf8');
// token name -> Android color name
const COLORS = {
  'sunrise-bg': 'blanc_sunrise_bg', 'sunrise-surface': 'blanc_sunrise_surface',
  'sunrise-surface-raised': 'blanc_sunrise_surface_raised', 'sunrise-border': 'blanc_sunrise_border',
  'sunrise-text': 'blanc_sunrise_text', 'sunrise-text-dim': 'blanc_sunrise_text_dim', 'sunrise-accent': 'blanc_sunrise_accent',
};
const colors = xml => Object.fromEntries([...xml.matchAll(/<color name="([a-z_]+)">(#[0-9A-Fa-f]{6})<\/color>/g)].map(m => [m[1], m[2].toLowerCase()]));

for (const [mode, file] of [['light', 'values/blanc_settings_colors.xml'], ['dark', 'values-night/blanc_settings_colors.xml']]) {
  test(`the ${mode} Settings colors are the Sunrise tokens`, () => {
    const found = colors(read(file));
    for (const [token, name] of Object.entries(COLORS)) {
      const entry = tokens.tokens.find(t => t.name === token);
      assert.ok(entry, `token ${token} exists`);
      assert.equal(found[name], entry.values[mode].toLowerCase(), `${name} (${mode})`);
    }
  });
}

test('the overlay sets the attributes Chromium draws Settings with', () => {
  const style = read('values/blanc_settings_theme.xml');
  for (const attr of ['colorSurface', 'colorSurfaceContainerHigh', 'colorSurfaceBright', 'colorOnSurface',
    'colorOnSurfaceVariant', 'colorPrimary', 'colorOutlineVariant']) {
    assert.match(style, new RegExp(`<item name="${attr}">@color/blanc_sunrise_`), attr);
  }
  assert.match(style, /<style name="ThemeOverlay.Blanc.Settings" parent="">/);
});
