'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const Identity = require('../../src/renderer/space-identity');
const {
  FONTS, FONT_IDS, STYLES, COLORS, DEFAULTS,
  inkFor, weightIn, clockStyle, clockStyleFromSettings, settingsForClock,
} = require('../../src/main/start-clock-style');

const ROOT = path.join(__dirname, '../..');
const schema = JSON.parse(fs.readFileSync(path.join(ROOT, 'settings-schema/schema.json'), 'utf8'));

test('start-clock-style stays free of Electron so the fork can port it', () => {
  const source = fs.readFileSync(require.resolve('../../src/main/start-clock-style'), 'utf8');
  assert.doesNotMatch(source, /require\(['"]electron['"]\)/);
});

test('the choices match the settings schema', () => {
  assert.deepEqual(FONT_IDS, schema.clockFonts);
  assert.deepEqual([...STYLES], schema.clockStyles);
  assert.deepEqual([...COLORS], schema.clockColors);
  assert.deepEqual(COLORS.slice(1), Identity.PRESETS.map((p) => p.id));
  assert.equal(schema.defaults.newtabClockFont, DEFAULTS.font);
  assert.equal(schema.defaults.newtabClockWeight, DEFAULTS.weight);
  assert.equal(schema.defaults.newtabClockColor, DEFAULTS.color);
  assert.equal(schema.defaults.newtabClockTone, DEFAULTS.tone);
  assert.equal(schema.defaults.newtabClockStyle, DEFAULTS.style);
});

test('the defaults draw the clock as it was: Instrument Sans 500, the page ink, solid', () => {
  const clock = clockStyle();
  assert.equal(clock.font, 'instrument');
  assert.equal(clock.weight, 500);
  assert.equal(clock.color, 'auto');
  assert.equal(clock.ink, null);
  assert.equal(clock.base, null);
  assert.equal(clock.style, 'solid');
  assert.deepEqual(clock.range, { min: 400, max: 700 });
  assert.deepEqual(clock.presets, Identity.PRESETS.map(({ id, hex }) => ({ id, hex })));
});

test('each face has the weight range its bundled file carries', () => {
  const css = fs.readFileSync(path.join(ROOT, 'src/renderer/pages/pages.css'), 'utf8');
  const declared = (family) => {
    const block = css.match(new RegExp(`@font-face\\s*\\{[^}]*font-family:\\s*"${family}"[^}]*\\}`))?.[0] ?? '';
    const [, min, max] = block.match(/font-weight:\s*(\d+)\s+(\d+)/) ?? [];
    return { min: Number(min), max: Number(max) };
  };
  assert.deepEqual({ ...FONTS.instrument }, declared('Instrument Sans'));
  assert.deepEqual({ ...FONTS.condensed }, declared('Instrument Sans'));
  assert.deepEqual({ ...FONTS.inter }, declared('Inter'));
  assert.deepEqual({ ...FONTS.mono }, declared('JetBrains Mono'));
});

test('the saved weight is drawn inside the face and kept as chosen', () => {
  assert.equal(weightIn('inter', 200), 200);
  assert.equal(weightIn('instrument', 200), 400);
  assert.equal(weightIn('mono', 900), 800);
  assert.equal(weightIn('nope', 650), 650);
  assert.equal(weightIn('instrument', 12.5), 500);
  const settings = { newtabClockFont: 'instrument', newtabClockWeight: 200 };
  assert.equal(clockStyleFromSettings(settings).weight, 400);
  assert.equal(clockStyleFromSettings({ ...settings, newtabClockFont: 'inter' }).weight, 200);
});

test('tone 50 is the preset; lower deepens toward black, higher lightens toward white', () => {
  const sky = Identity.PRESETS.find((p) => p.id === 'sky').hex;
  assert.equal(inkFor('sky', 50), sky);
  assert.equal(inkFor('auto', 80), null);
  assert.equal(inkFor('teal', 50), null);
  const luminance = (hex) => Identity.contrast(hex, '#000000');
  assert.ok(luminance(inkFor('sky', 0)) < luminance(sky));
  assert.ok(luminance(inkFor('sky', 100)) > luminance(sky));
  // Short of black and white at the ends, so it stays a color.
  assert.notEqual(inkFor('sky', 0), '#000000');
  assert.notEqual(inkFor('sky', 100), '#ffffff');
  // Monotonic along the slider.
  let last = 0;
  for (let tone = 0; tone <= 100; tone += 5) {
    const l = luminance(inkFor('sky', tone));
    assert.ok(l >= last, `tone ${tone}`);
    last = l;
  }
});

test('the page previews the tone with the same mix main makes', () => {
  const clock = clockStyle({ color: 'rose', tone: 80 });
  assert.equal(clock.base, Identity.PRESETS.find((p) => p.id === 'rose').hex);
  assert.ok(clock.toneMix.darken > 0 && clock.toneMix.darken < 1);
  assert.ok(clock.toneMix.lighten > 0 && clock.toneMix.lighten < 1);
  assert.equal(clock.ink, inkFor('rose', 80));
});

test('unknown values read as the defaults', () => {
  const clock = clockStyle({ font: 'comic', weight: 'bold', color: '#ff0000', tone: 101, style: 'chrome' });
  assert.equal(clock.font, DEFAULTS.font);
  assert.equal(clock.weight, DEFAULTS.weight);
  assert.equal(clock.color, DEFAULTS.color);
  assert.equal(clock.tone, DEFAULTS.tone);
  assert.equal(clock.style, DEFAULTS.style);
});

test('a Font & Color change writes only valid fields, by settings key', () => {
  assert.deepEqual(settingsForClock({ font: 'mono', weight: 640, color: 'iris', tone: 0, style: 'glass' }), {
    newtabClockFont: 'mono',
    newtabClockWeight: 640,
    newtabClockColor: 'iris',
    newtabClockTone: 0,
    newtabClockStyle: 'glass',
  });
  assert.deepEqual(settingsForClock({ font: 'comic', weight: 1000, color: 'teal', tone: -1, style: 'chrome', theme: 'dark' }), {});
  assert.deepEqual(settingsForClock({ weight: 99 }), {});
  assert.deepEqual(settingsForClock({ weight: 100, tone: 100 }), { newtabClockWeight: 100, newtabClockTone: 100 });
  assert.deepEqual(settingsForClock(null), {});
  assert.deepEqual(settingsForClock('glass'), {});
});
