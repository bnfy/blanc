'use strict';

// Settings → General → Island size (#1292). The strip draws each size from
// styles.css (`:root[data-island-size]`); main keeps the two numbers it needs
// before the strip has drawn or that follow the pill's zoom: the strip height
// a new window starts with, and the room the floating Island's shadow needs.
// test/unit/island-size-settings.test.js keeps this table and the CSS equal.

const ISLAND_SIZE_GEOMETRY = Object.freeze({
  default: Object.freeze({ zoom: 1.15, stripHeight: 68 }),
  large: Object.freeze({ zoom: 1.3, stripHeight: 76 }),
  'extra-large': Object.freeze({ zoom: 1.45, stripHeight: 84 }),
});
const ISLAND_SIZES = Object.freeze(Object.keys(ISLAND_SIZE_GEOMETRY));

const geometry = (size) => ISLAND_SIZE_GEOMETRY[ISLAND_SIZES.includes(size) ? size : 'default'];

/** The strip's height at this size, in px. */
function stripHeightFor(size) {
  return geometry(size).stripHeight;
}

/** A length measured at the default size's zoom (a shadow drawn inside the
 * zoomed pill), at this size's zoom, rounded up to whole px. */
function scaleForIslandSize(px, size) {
  return Math.ceil((px * geometry(size).zoom) / ISLAND_SIZE_GEOMETRY.default.zoom);
}

module.exports = { ISLAND_SIZE_GEOMETRY, ISLAND_SIZES, stripHeightFor, scaleForIslandSize };
