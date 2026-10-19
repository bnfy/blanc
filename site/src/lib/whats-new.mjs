// The What's New pages (docs/superpowers/specs/2026-10-19-whats-new-page-design.md):
// site/src/data/whats-new.json holds one page per feature release (major.minor),
// two to five highlights each, and each page also shows a few from earlier releases. Pure: no Astro imports, so the unit test and
// the page share one validator. The app opens /whats-new/<major>.<minor> only
// after checking that the page exists (src/main/whats-new.js).
import fs from 'node:fs';
import path from 'node:path';

const RELEASE_RE = /^(\d+)\.(\d+)\.(\d+)$/;
const FEATURE_RE = /^(\d+)\.(\d+)$/;

// Only the demos that carry their own script and styles; Glance and gestures
// still lean on the homepage's home.js and home.css.
export const DEMOS = Object.freeze(['spaces', 'tab-drag']);
// The media of a drafted highlight (site/scripts/whats-new-draft.mjs) until
// someone chooses real media. Invalid outside the dev server's preview, so a
// draft can neither pass the unit test nor build.
export const TODO_MEDIA_KIND = 'todo';
// Two to five of a release's own; earlier releases fill the page out.
const MIN_HIGHLIGHTS = 2;
const MAX_HIGHLIGHTS = 5;
// A page shows its own highlights, then up to this many earlier pages'.
const EARLIER_PAGES = 2;
const MAX_ENTRIES = 8;

// Keys, menu glyphs and bang codes sit in the site's chip (.bang-chip), never
// bare in a sentence. The data marks them with backticks: `⌘L`, `⋮`, `!yt lofi`.
export function chipSpans(text) {
  return String(text).split('`').map((part, index) => ({ chip: index % 2 === 1, text: part })).filter((span) => span.text !== '');
}

export function plainText(text) {
  return String(text).replaceAll('`', '');
}

const BARE_KEY = /[⌘⌥⇧⋮]|(?:^|\s)![\w]/;

function chipErrors(text, where) {
  if ((String(text).match(/`/g) ?? []).length % 2) return [`${where}: a chip is not closed`];
  return chipSpans(text).some((span) => !span.chip && BARE_KEY.test(span.text))
    ? [`${where}: put keys, menu glyphs and bang codes in a chip (backticks)`]
    : [];
}

export function featureRelease(version) {
  const match = RELEASE_RE.exec(typeof version === 'string' ? version : '');
  return match ? `${match[1]}.${match[2]}` : null;
}

function compareFeature(a, b) {
  const [a1, a2] = FEATURE_RE.exec(a).slice(1).map(Number);
  const [b1, b2] = FEATURE_RE.exec(b).slice(1).map(Number);
  return a1 - b1 || a2 - b2;
}

const isSitePath = (url) => typeof url === 'string'
  && ((url.startsWith('/') && !url.startsWith('//')) || url.startsWith('https://blanc.day/'));

const nonEmpty = (value) => typeof value === 'string' && value.trim() !== '';

function mediaErrors(media, where, publicDir, allowDrafts) {
  const errors = [];
  if (!media || typeof media !== 'object') return [`${where}: media is missing`];
  if (media.kind === TODO_MEDIA_KIND) return allowDrafts ? [] : [`${where}: media is still a TODO; choose an image, video or demo`];
  const local = [];
  if (media.kind === 'image') {
    if (!nonEmpty(media.src)) errors.push(`${where}: image needs src`);
    if (!nonEmpty(media.alt)) errors.push(`${where}: image needs alt`);
    if (!Number.isInteger(media.width) || !Number.isInteger(media.height)) errors.push(`${where}: image needs width and height`);
    local.push(media.src);
  } else if (media.kind === 'video') {
    if (!nonEmpty(media.src) || !nonEmpty(media.poster)) errors.push(`${where}: video needs src and poster`);
    if (!nonEmpty(media.alt)) errors.push(`${where}: video needs alt`);
    local.push(media.src, media.poster);
  } else if (media.kind === 'demo') {
    if (!DEMOS.includes(media.demo)) errors.push(`${where}: unknown demo "${media.demo}"`);
  } else {
    errors.push(`${where}: unknown media kind "${media.kind}"`);
  }
  for (const src of local) {
    if (publicDir && typeof src === 'string' && src.startsWith('/') && !fs.existsSync(path.join(publicDir, src))) {
      errors.push(`${where}: ${src} does not exist under site/public`);
    }
  }
  return errors;
}

// Every problem with the data, as messages; [] when it is valid. publicDir,
// when given, checks that local media exist (the unit test passes it; the
// build leaves it to the test).
// requireEveryRelease checks that each feature release from firstRelease on has
// a page or a noPage entry. Both wait on the owner's sign-off, so only the unit
// test asks for it; the build leaves it off, and the post-release changelog
// deploy never waits on a page. allowDrafts accepts TODO media, for the dev
// server's preview only.
export function validateWhatsNew(data, releases, { publicDir, requireEveryRelease = true, allowDrafts = false } = {}) {
  const errors = [];
  const released = new Set(releases.map((r) => r.version));
  const featureReleases = new Set(releases.map((r) => featureRelease(r.version)).filter(Boolean));
  const paged = new Set();
  // Ids are unique across every page, since a page also shows earlier ones.
  const ids = new Set();
  for (const pageData of data.pages ?? []) {
    const release = pageData.release;
    if (!FEATURE_RE.test(release ?? '')) { errors.push(`page "${release}": release must be major.minor`); continue; }
    paged.add(release);
    if (!released.has(`${release}.0`)) errors.push(`page ${release}: ${release}.0 is not in releases.json`);
    const highlights = pageData.highlights ?? [];
    if (highlights.length < MIN_HIGHLIGHTS || highlights.length > MAX_HIGHLIGHTS) {
      errors.push(`page ${release}: needs ${MIN_HIGHLIGHTS} to ${MAX_HIGHLIGHTS} highlights, has ${highlights.length}`);
    }
    // Each panel shows something different: no image or demo twice on a page.
    const visuals = new Set();
    for (const h of highlights) {
      const where = `page ${release}, highlight "${h.id}"`;
      const visual = h.media?.kind === 'demo' ? `demo:${h.media.demo}` : h.media?.src;
      if (visual && visuals.has(visual)) errors.push(`${where}: repeats ${visual}`);
      visuals.add(visual);
      if (!/^[a-z0-9-]+$/.test(h.id ?? '')) errors.push(`${where}: id must be lowercase words joined by hyphens`);
      if (ids.has(h.id)) errors.push(`${where}: duplicate id`);
      ids.add(h.id);
      for (const key of ['tile', 'title', 'body']) if (!nonEmpty(h[key])) errors.push(`${where}: ${key} is missing`);
      // Website chrome keeps the site palette (docs/brand-usage.md); color
      // comes from the captures themselves.
      if ('color' in h) errors.push(`${where}: highlights take no color; the page uses the site palette`);
      if (h.steps !== undefined && (!Array.isArray(h.steps) || !h.steps.every(nonEmpty))) errors.push(`${where}: steps must be a list of text`);
      for (const text of [h.body, h.note, ...(Array.isArray(h.steps) ? h.steps : [])]) {
        if (typeof text === 'string') errors.push(...chipErrors(text, where));
      }
      if (h.learnMore !== undefined && !isSitePath(h.learnMore)) errors.push(`${where}: learnMore must be a blanc.day page`);
      errors.push(...mediaErrors(h.media, where, publicDir, allowDrafts));
    }
  }
  const skipped = new Set(data.noPage ?? []);
  for (const release of skipped) if (paged.has(release)) errors.push(`${release} is both paged and in noPage`);
  if (!FEATURE_RE.test(data.firstRelease ?? '')) {
    errors.push('firstRelease must be major.minor');
  } else if (requireEveryRelease) {
    for (const release of featureReleases) {
      if (compareFeature(release, data.firstRelease) >= 0 && !paged.has(release) && !skipped.has(release)) {
        errors.push(`${release} has no What's New page and is not in noPage`);
      }
    }
  }
  return errors;
}

// The page's meta description: its own highlights, then what the page offers,
// sized for search snippets (70–170 characters; scripts/verify-seo.mjs).
export function pageDescription(page) {
  const names = page.highlights.map((h) => h.tile);
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0];
  return `What’s new in Blanc ${page.release}: ${list}. A short tour of each, with steps to try it and the full changelog for every detail.`;
}

// The pages to build, newest first, with the date and changelog anchor of
// their release's .0 version. Each page's entries lead with its own
// highlights (current: true), then add those of the EARLIER_PAGES previous
// pages, newest first, up to MAX_ENTRIES in all; its own always fit.
export function publishedPages(data, releases) {
  const byVersion = new Map(releases.map((r) => [r.version, r]));
  const pages = (data.pages ?? [])
    .filter((p) => byVersion.has(`${p.release}.0`))
    .map((p) => {
      const release = byVersion.get(`${p.release}.0`);
      return { release: p.release, version: release.version, humanDate: release.humanDate, anchor: release.anchor, highlights: p.highlights };
    })
    .sort((a, b) => compareFeature(b.release, a.release));
  const entriesOf = (page, current) => page.highlights.map((highlight) => ({ highlight, release: page.release, humanDate: page.humanDate, current }));
  return pages.map((page, index) => {
    const own = entriesOf(page, true);
    const earlier = pages.slice(index + 1, index + 1 + EARLIER_PAGES).flatMap((p) => entriesOf(p, false));
    return { ...page, entries: [...own, ...earlier].slice(0, Math.max(MAX_ENTRIES, own.length)) };
  });
}
