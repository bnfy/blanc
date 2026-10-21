'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const Identity = require('../../src/renderer/space-identity');
const {
  FONTS, FONT_IDS, STYLES, COLORS, DEFAULTS,
  inkFor, weightIn, heightIn, clockStyle, clockStyleFromSettings, settingsForClock,
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
  assert.equal(schema.defaults.newtabClockHeight, DEFAULTS.height);
});

test('the defaults draw the clock as it was: Instrument Sans 500, the page ink, solid', () => {
  const clock = clockStyle();
  assert.equal(clock.font, 'instrument');
  assert.equal(clock.weight, 500);
  assert.equal(clock.color, 'auto');
  assert.equal(clock.ink, null);
  assert.equal(clock.base, null);
  assert.equal(clock.style, 'solid');
  assert.equal(clock.height, 100);
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
  for (const face of ['instrument', 'condensed']) {
    assert.deepEqual({ min: FONTS[face].min, max: FONTS[face].max }, declared('Instrument Sans'));
  }
  assert.deepEqual({ min: FONTS.inter.min, max: FONTS.inter.max }, declared('Inter'));
  assert.deepEqual({ min: FONTS.flex.min, max: FONTS.flex.max }, declared('Blanc Clock Flex'));
});

test('only a face with room on its width axis stands taller, and the choice is kept', () => {
  assert.equal(FONTS.flex.height, 300);
  assert.equal(FONTS.instrument.height, 130);
  for (const face of ['condensed', 'inter']) assert.equal(FONTS[face].height, 100);
  assert.equal(FONTS.mono, undefined, 'JetBrains Mono is not a clock face');
  assert.equal(heightIn('flex', 240), 240);
  assert.equal(heightIn('instrument', 240), 130);
  assert.equal(heightIn('inter', 240), 100);
  const settings = { newtabClockFont: 'inter', newtabClockHeight: 240 };
  assert.deepEqual({ ...clockStyleFromSettings(settings).heightRange }, { min: 100, max: 100 });
  assert.equal(clockStyleFromSettings({ ...settings, newtabClockFont: 'flex' }).height, 240);
  assert.equal(clockStyleFromSettings({ ...settings, newtabClockFont: 'flex' }).heightRange.max, 300);
});

test('the saved weight is drawn inside the face and kept as chosen', () => {
  assert.equal(weightIn('flex', 1000), 1000);
  assert.equal(weightIn('inter', 1000), 900);
  assert.equal(weightIn('inter', 200), 200);
  assert.equal(weightIn('instrument', 200), 400);
  assert.equal(weightIn('mono', 650), 650, 'an unknown face reads as Instrument Sans');
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
  const clock = clockStyle({ font: 'comic', weight: 'bold', color: '#ff0000', tone: 101, style: 'chrome', height: 301 });
  assert.equal(clock.font, DEFAULTS.font);
  assert.equal(clock.weight, DEFAULTS.weight);
  assert.equal(clock.color, DEFAULTS.color);
  assert.equal(clock.tone, DEFAULTS.tone);
  assert.equal(clock.style, DEFAULTS.style);
  assert.equal(clock.height, DEFAULTS.height);
  assert.equal(clockStyle({ height: 99 }).height, 100);
  assert.equal(clockStyle({ height: 250.5 }).height, 100);
  assert.equal(clockStyleFromSettings({ newtabClockFont: 'flex', newtabClockHeight: 300 }).height, 300);
});

test('a Font & Color change writes only valid fields, by settings key', () => {
  assert.deepEqual(settingsForClock({ font: 'inter', weight: 640, color: 'iris', tone: 0, style: 'glass', height: 240 }), {
    newtabClockFont: 'inter',
    newtabClockWeight: 640,
    newtabClockColor: 'iris',
    newtabClockTone: 0,
    newtabClockStyle: 'glass',
    newtabClockHeight: 240,
  });
  assert.deepEqual(settingsForClock({ height: 50 }), {});
  assert.deepEqual(settingsForClock({ font: 'comic', weight: 1100, color: 'teal', tone: -1, style: 'chrome', theme: 'dark' }), {});
  assert.deepEqual(settingsForClock({ weight: 99 }), {});
  assert.deepEqual(settingsForClock({ font: 'flex', weight: 1000 }), { newtabClockFont: 'flex', newtabClockWeight: 1000 });
  assert.deepEqual(settingsForClock({ weight: 1001 }), {});
  assert.deepEqual(settingsForClock({ weight: 100, tone: 100 }), { newtabClockWeight: 100, newtabClockTone: 100 });
  assert.deepEqual(settingsForClock(null), {});
  assert.deepEqual(settingsForClock('glass'), {});
});
