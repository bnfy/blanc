'use strict';

// The Start Page's widgets (spec docs/superpowers/specs/
// 2026-11-18-start-page-widgets-and-island-backdrop-port-design.md, ported
// from the fork's V24/V26 rules in blanc_prototype_ui.cc). Pure: no Electron,
// no settings store. settings.js keeps the result device-local as
// `newtabWidgets`, never synced.
//
// Stored shape: { v: 1, favorites, devices, shortcutCount: 1..12,
//   place: { left: [...], right: [...] }, sizes: { favorites?, devices? } }.
// Every function returns a new object; a setter returns null when the value
// it is given is not one the Start Page can show.

const WIDGET_NAMES = Object.freeze(['favorites', 'devices']);
// Sent to this device is an inbox, not a switch, but its card can be placed.
const CARD_NAMES = Object.freeze(['favorites', 'devices', 'sent']);
const DEFAULT_SIDE = Object.freeze({ favorites: 'left', devices: 'left', sent: 'right' });
const SIZED_CARDS = Object.freeze(['favorites', 'devices']);
const CARD_SIZES = Object.freeze([240, 360, 480, 600, 720]);
const DEFAULT_SHORTCUT_COUNT = 6;
const MAX_SHORTCUT_COUNT = 12;

// An old layout decides the widgets once (V24's map; V26 dropped Tally's chart).
const LAYOUT_WIDGETS = Object.freeze({
  ledger: { favorites: true, devices: true },
  tally: { favorites: true },
  shelf: { favorites: true, shortcutCount: 12 },
});

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const validCount = (count) => Number.isInteger(count) && count >= 1 && count <= MAX_SHORTCUT_COUNT;

function defaultWidgets() {
  return {
    v: 1,
    favorites: false,
    devices: false,
    shortcutCount: DEFAULT_SHORTCUT_COUNT,
    place: { left: ['favorites', 'devices'], right: ['sent'] },
    sizes: {},
  };
}

// Keeps each known card where it is first named (left before right) and
// returns any card left unnamed to its default side.
function normalizePlace(raw) {
  const place = { left: [], right: [] };
  const seen = new Set();
  const source = isObject(raw) ? raw : {};
  for (const side of ['left', 'right']) {
    if (!Array.isArray(source[side])) continue;
    for (const name of source[side]) {
      if (!CARD_NAMES.includes(name) || seen.has(name)) continue;
      seen.add(name);
      place[side].push(name);
    }
  }
  for (const name of CARD_NAMES) if (!seen.has(name)) place[DEFAULT_SIDE[name]].push(name);
  return place;
}

function normalizeSizes(raw) {
  const sizes = {};
  if (!isObject(raw)) return sizes;
  for (const card of SIZED_CARDS) if (CARD_SIZES.includes(raw[card])) sizes[card] = raw[card];
  return sizes;
}

function normalizeWidgets(raw) {
  const source = isObject(raw) ? raw : {};
  return {
    v: 1,
    favorites: source.favorites === true,
    devices: source.devices === true,
    shortcutCount: validCount(source.shortcutCount) ? source.shortcutCount : DEFAULT_SHORTCUT_COUNT,
    place: normalizePlace(source.place),
    sizes: normalizeSizes(source.sizes),
  };
}

function migrateFromLayout(layout) {
  const choice = typeof layout === 'string' && Object.hasOwn(LAYOUT_WIDGETS, layout) ? LAYOUT_WIDGETS[layout] : {};
  return normalizeWidgets({ ...defaultWidgets(), ...choice });
}

function withWidget(widgets, name, on) {
  if (!WIDGET_NAMES.includes(name) || typeof on !== 'boolean') return null;
  return normalizeWidgets({ ...widgets, [name]: on });
}

function withShortcutCount(widgets, count) {
  if (!validCount(count)) return null;
  return normalizeWidgets({ ...widgets, shortcutCount: count });
}

function withPlace(widgets, left, right) {
  if (!Array.isArray(left) || !Array.isArray(right)) return null;
  return normalizeWidgets({ ...widgets, place: { left, right } });
}

function withSize(widgets, card, size) {
  if (!SIZED_CARDS.includes(card) || (size !== 0 && !CARD_SIZES.includes(size))) return null;
  const sizes = { ...normalizeSizes(widgets?.sizes) };
  if (size === 0) delete sizes[card];
  else sizes[card] = size;
  return normalizeWidgets({ ...widgets, sizes });
}

function pageWidgets(widgets) {
  const { favorites, devices, shortcutCount, place, sizes } = normalizeWidgets(widgets);
  return { favorites, devices, shortcutCount, place, sizes };
}

module.exports = {
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
};
