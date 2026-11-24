// Every Blanc build's releases for /changelog and its feeds
// (docs/superpowers/specs/2026-11-23-changelog-all-builds-design.md).
//
// Each product keeps its own data file: releases.json (desktop, read by many
// pages), beta-releases.json (Blanc Beta) and ios-releases.json (Blanc for
// iPhone and iPad). Only this module reads the last two, so a beta can never
// become "the latest release" anywhere but the changelog.
import desktopReleases from '../data/releases.json' with { type: 'json' };
import betaReleases from '../data/beta-releases.json' with { type: 'json' };
import iosReleases from '../data/ios-releases.json' with { type: 'json' };
import { SITE_ORIGIN } from './site-origin.mjs';

export const PRODUCT_FILTERS = ['stable', 'desktop', 'iphone', 'beta', 'all'];

const FILTER_PRODUCTS = {
  stable: ['desktop', 'ios'],
  desktop: ['desktop'],
  iphone: ['ios'],
  beta: ['beta'],
  all: ['desktop', 'ios', 'beta'],
};

// Releases published at the same moment keep one order on every build.
const PRODUCT_ORDER = ['desktop', 'ios', 'beta'];
const PLATFORM_ORDER = ['mac', 'windows', 'linux'];
const BETA_PLATFORM_NAMES = { mac: 'Mac', windows: 'Windows', linux: 'Linux' };

export function normalizeFilter(value) {
  const filter = String(value ?? '').trim().toLowerCase();
  return PRODUCT_FILTERS.includes(filter) ? filter : 'stable';
}

export function matchesFilter(entry, filter) {
  return FILTER_PRODUCTS[normalizeFilter(filter)].includes(entry.product);
}

export function mergeEntries({ desktop = [], beta = [], ios = [] }) {
  const rank = (entry) => PRODUCT_ORDER.indexOf(entry.product) * 10 + Math.max(0, PLATFORM_ORDER.indexOf(entry.platform));
  return [
    ...desktop.map((entry) => ({ ...entry, product: 'desktop' })),
    ...beta.map((entry) => ({ ...entry })),
    ...ios.map((entry) => ({ ...entry })),
  ].sort((a, b) => (Date.parse(b.publishedAt) - Date.parse(a.publishedAt)) || (rank(a) - rank(b)));
}

export function productLabel(entry) {
  if (entry.product === 'beta') return `Blanc Beta for ${BETA_PLATFORM_NAMES[entry.platform]}`;
  if (entry.product === 'ios') return (entry.devices || []).includes('ipad') ? 'Blanc for iPhone and iPad' : 'Blanc for iPhone';
  return 'Blanc for desktop';
}

export function entryTitle(entry) {
  if (entry.product === 'beta') return entry.platform === 'mac' ? `Blanc Beta ${entry.version}` : `${productLabel(entry)} ${entry.version}`;
  if (entry.product === 'ios') return `Blanc for iPhone ${entry.version}`;
  return `Blanc ${entry.version}`;
}

// Where a feed item points. Every iPhone entry shares the App Store link, so
// its item points at its own place on the changelog instead.
export function entryLink(entry) {
  return entry.product === 'ios' ? `${SITE_ORIGIN}/changelog#${entry.anchor}` : entry.url;
}

export function allEntries() {
  return mergeEntries({ desktop: desktopReleases, beta: betaReleases, ios: iosReleases });
}
