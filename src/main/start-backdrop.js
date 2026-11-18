'use strict';

// The Start Page's wallpaper continued behind the Island's top band (spec
// docs/superpowers/specs/2026-11-18-start-page-widgets-and-island-backdrop-port-design.md,
// goal 7; ported from the fork's host.js paintBackdrop and its native checks).
// Pure: no Electron. The page reports each wallpaper layer's computed
// background; main checks it here, decides whether the band continues this
// page, and hands the strip only what it may draw.

const MAX_LAYERS = 4;
const MAX_STRING = 4096;
const LAYER_STRINGS = ['color', 'image', 'size', 'position', 'repeat'];
// Blanc's own Start Page art, served flat from blanc://newtab/ (pages.js).
const PAGE_IMAGE = /^blanc:\/\/newtab\/[A-Za-z0-9_-][A-Za-z0-9_.-]*$/;

const finite = (value, min, max) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

// Every url() in a background must be a quoted Blanc page image or the
// current photo (wallpaper.js's served URL); anything else refuses the layer.
function allowedImage(image, wallpaperUrl) {
  if (image.includes('\\')) return false;
  for (const [, raw] of image.matchAll(/url\(([^)]*)\)/g)) {
    const href = /^"([^"]*)"$/.exec(raw)?.[1];
    if (href == null) return false;
    if (href === wallpaperUrl && typeof wallpaperUrl === 'string') continue;
    if (!PAGE_IMAGE.test(href)) return false;
  }
  return true;
}

function normalizeLayer(layer, wallpaperUrl) {
  if (!layer || typeof layer !== 'object' || Array.isArray(layer)) return null;
  const out = {};
  for (const key of LAYER_STRINGS) {
    if (typeof layer[key] !== 'string' || layer[key].length > MAX_STRING || layer[key].includes('\\')) return null;
    out[key] = layer[key];
  }
  if (!allowedImage(out.image, wallpaperUrl)) return null;
  if (!finite(layer.opacity, 0, 1)) return null;
  out.opacity = layer.opacity;
  out.fade = layer.fade === true;
  return out;
}

/** The page's spec as the strip may draw it, or null (refused whole). */
function normalizeBackdrop(spec, { wallpaperUrl = null } = {}) {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) return null;
  if (!finite(spec.zoom, 0.25, 5)) return null;
  for (const key of ['width', 'height']) {
    if (!Number.isInteger(spec[key]) || spec[key] < 1 || spec[key] > 20000) return null;
  }
  if (!Array.isArray(spec.layers) || spec.layers.length < 1 || spec.layers.length > MAX_LAYERS) return null;
  const layers = [];
  for (const layer of spec.layers) {
    const clean = normalizeLayer(layer, wallpaperUrl);
    if (!clean) return null;
    layers.push(clean);
  }
  return { zoom: spec.zoom, width: spec.width, height: spec.height, layers };
}

/** The band's height above this page in CSS pixels, or 0 where the band
 * doesn't sit above this page alone (the strip keeps its sampled color). */
function backdropBand({ isActive, isPrivate, splitVisible, glanceOpen, autoHide, fullScreen, siteColors, pageTop }) {
  if (!isActive || isPrivate || splitVisible || glanceOpen || autoHide || fullScreen || !siteColors) return 0;
  return Number.isFinite(pageTop) && pageTop > 0 ? pageTop : 0;
}

/** What the strip receives: the page's spec and the band above it, or null
 * where the band keeps its sampled color. */
function backdropPayload(tabId, spec, band) {
  if (!spec || !(band > 0)) return null;
  const { zoom, width, height, layers } = spec;
  return { id: tabId, zoom, width, height, layers, band };
}

module.exports = { MAX_LAYERS, normalizeBackdrop, backdropBand, backdropPayload };
