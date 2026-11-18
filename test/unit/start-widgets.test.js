'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  WIDGET_NAMES,
  CARD_NAMES,
  CARD_SIZES,
  defaultWidgets,
  normalizeWidgets,
  migrateFromLayout,
  withWidget,
  withShortcutCount,
  withPlace,
  withSize,
  pageWidgets,
} = require('../../src/main/start-widgets');

const pick = ({ favorites, devices, shortcutCount }) => ({ favorites, devices, shortcutCount });

test('names and sizes match the fork', () => {
  assert.deepEqual(WIDGET_NAMES, ['favorites', 'devices']);
  assert.deepEqual(CARD_NAMES, ['favorites', 'devices', 'sent']);
  assert.deepEqual(CARD_SIZES, [240, 360, 480, 600, 720]);
});

test('defaults: no widgets, six shortcuts, cards on their default sides', () => {
  assert.deepEqual(defaultWidgets(), {
    v: 1, favorites: false, devices: false, shortcutCount: 6,
    place: { left: ['favorites', 'devices'], right: ['sent'] }, sizes: {},
  });
});

test('defaults are a fresh object each time', () => {
  const a = defaultWidgets();
  a.place.left.push('sent');
  a.sizes.devices = 240;
  assert.deepEqual(defaultWidgets().place.left, ['favorites', 'devices']);
  assert.deepEqual(defaultWidgets().sizes, {});
});

test('an old layout turns into the widgets that match it', () => {
  assert.deepEqual(pick(migrateFromLayout('ledger')), { favorites: true, devices: true, shortcutCount: 6 });
  assert.deepEqual(pick(migrateFromLayout('tally')), { favorites: true, devices: false, shortcutCount: 6 });
  assert.deepEqual(pick(migrateFromLayout('shelf')), { favorites: true, devices: false, shortcutCount: 12 });
  for (const layout of ['billboard', 'mahjong', '', undefined, null, 7]) {
    assert.deepEqual(migrateFromLayout(layout), defaultWidgets());
  }
});

test('normalize drops wrong types, unknown widgets, duplicates and odd sizes', () => {
  const widgets = normalizeWidgets({
    favorites: 'yes', devices: true, chart: true, panels: ['x'], shortcutCount: 13,
    place: { left: ['sent', 'sent', 'chart'], right: ['favorites'] },
    sizes: { favorites: 999, devices: 360, sent: 240 },
  });
  assert.equal(widgets.favorites, false);
  assert.equal(widgets.devices, true);
  assert.equal(widgets.shortcutCount, 6);
  // devices was missing, so it returns to its default side.
  assert.deepEqual(widgets.place, { left: ['sent', 'devices'], right: ['favorites'] });
  assert.deepEqual(widgets.sizes, { devices: 360 });
  assert.equal('chart' in widgets, false);
  assert.equal('panels' in widgets, false);
  assert.equal(widgets.v, 1);
});

test('normalize keeps a valid saved value as it is', () => {
  const saved = {
    v: 1, favorites: true, devices: false, shortcutCount: 9,
    place: { left: ['sent'], right: ['devices', 'favorites'] }, sizes: { favorites: 720 },
  };
  assert.deepEqual(normalizeWidgets(saved), saved);
});

test('normalize: a card named on both sides stays where it is first named', () => {
  const widgets = normalizeWidgets({ place: { left: ['favorites'], right: ['favorites', 'sent'] } });
  assert.deepEqual(widgets.place, { left: ['favorites', 'devices'], right: ['sent'] });
});

test('normalize survives values that are not objects', () => {
  for (const raw of [null, undefined, 7, 'x', [], true]) assert.deepEqual(normalizeWidgets(raw), defaultWidgets());
  assert.deepEqual(normalizeWidgets({ place: 'left', sizes: [240] }), defaultWidgets());
  assert.deepEqual(normalizeWidgets({ place: { left: 'favorites', right: null } }).place, defaultWidgets().place);
});

test('normalize rejects counts that are not whole numbers from 1 to 12', () => {
  for (const shortcutCount of [0, 13, 2.5, '6', NaN, -1]) {
    assert.equal(normalizeWidgets({ shortcutCount }).shortcutCount, 6);
  }
  assert.equal(normalizeWidgets({ shortcutCount: 1 }).shortcutCount, 1);
  assert.equal(normalizeWidgets({ shortcutCount: 12 }).shortcutCount, 12);
});

test('withWidget turns a widget on or off and refuses anything else', () => {
  const widgets = defaultWidgets();
  assert.equal(withWidget(widgets, 'favorites', true).favorites, true);
  assert.equal(withWidget(withWidget(widgets, 'devices', true), 'devices', false).devices, false);
  assert.equal(withWidget(widgets, 'chart', true), null);
  assert.equal(withWidget(widgets, 'sent', true), null);
  assert.equal(withWidget(widgets, 'favorites', 'yes'), null);
  assert.equal(widgets.favorites, false, 'the input is not changed');
});

test('withShortcutCount accepts 1 to 12 only', () => {
  const widgets = defaultWidgets();
  assert.equal(withShortcutCount(widgets, 12).shortcutCount, 12);
  assert.equal(withShortcutCount(widgets, 1).shortcutCount, 1);
  for (const count of [0, 13, 2.5, '6', null]) assert.equal(withShortcutCount(widgets, count), null);
});

test('withPlace saves both sides through the same rules', () => {
  const widgets = defaultWidgets();
  assert.deepEqual(withPlace(widgets, ['sent'], ['favorites', 'devices']).place,
    { left: ['sent'], right: ['favorites', 'devices'] });
  assert.deepEqual(withPlace(widgets, ['sent', 'chart'], []).place,
    { left: ['sent', 'favorites', 'devices'], right: [] });
  assert.equal(withPlace(widgets, 'sent', []), null);
  assert.equal(withPlace(widgets, [], undefined), null);
});

test('withSize sets one of the five sizes, and 0 removes it', () => {
  const widgets = defaultWidgets();
  const sized = withSize(widgets, 'devices', 480);
  assert.deepEqual(sized.sizes, { devices: 480 });
  assert.deepEqual(withSize(sized, 'devices', 0).sizes, {});
  assert.equal(withSize(widgets, 'sent', 240), null);
  assert.equal(withSize(widgets, 'favorites', 300), null);
  assert.equal(withSize(widgets, 'favorites', '240'), null);
});

test('the page gets everything but the version', () => {
  const page = pageWidgets(defaultWidgets());
  assert.equal('v' in page, false);
  assert.deepEqual(Object.keys(page).sort(), ['devices', 'favorites', 'place', 'shortcutCount', 'sizes']);
});
