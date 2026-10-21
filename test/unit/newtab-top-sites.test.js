'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Billboard top sites stay local and private-safe; hiding stays in the page, pins go through main', () => {
  const main = read('src/main/main.js');
  const pages = read('src/main/pages.js');
  const preload = read('src/main/tab-preload.js');
  const renderer = read('src/renderer/pages/newtab.js');
  const css = read('src/renderer/pages/pages.css');

  assert.match(pages, /topSites:\s*hooks\.startPage\?\.topSites\?\.\(event\.sender\)/);
  assert.match(pages, /pages:start:top-sites/);
  assert.match(main, /topSites:\s*\(wc, options = \{\}\)[\s\S]*?if \(!owner \|\| owner\.private\) return \[\]/);
  assert.match(main, /return history\.listTopSites\(options\)\.map/);
  assert.match(main, /history\.cacheSiteIcon\(tab\.url, sanitized\)/);
  assert.match(renderer, /const sites = isPrivate \? \[\] : visibleBillboardSites\(\);/);
  assert.match(renderer, /startPins\.billboardSites\(state\.pins, state\.topSites, hiddenTopSites, 6\)/);
  assert.match(renderer, /start\.topSites\(\{[\s\S]*?offset,[\s\S]*?limit: TOP_SITES_PAGE_SIZE/);
  assert.match(renderer, /localStorage\.setItem\(TOP_SITES_HIDDEN_KEY/);
  assert.match(renderer, /key\.length > 0 && key\.length <= 255/);
  assert.match(renderer, /const fullTitle = \(site\.title \|\| hostOf\(site\.url\) \|\| t\('newtab\.billboard\.untitled'\)\)\.trim\(\);/);
  assert.match(renderer, /label\.textContent = globalThis\.blancStartSiteName\.shortSiteName\(fullTitle, site\.url\);/);
  assert.match(renderer, /label\.title = fullTitle;/);
  assert.match(renderer, /link\.setAttribute\('aria-label', t\('newtab\.billboard\.open', \{ title: fullTitle \}\)\);/);
  assert.match(css, /\.bb-fav \.label \{[^}]*white-space: nowrap;[^}]*text-overflow: ellipsis;/s);
  assert.doesNotMatch((css.match(/\.bb-fav \.label \{[^}]*\}/g) ?? []).join(''), /line-clamp/,
    'Billboard labels stay on one line');
  assert.match(renderer, /t\('newtab\.billboard\.hide', \{ title: fullTitle \}\)/);
  // The × takes the text color like the pin, so it reads in dark mode (the
  // start page never sets data-theme="dark" for an <img> invert to key off).
  assert.match(renderer, /dismiss\.appendChild\(closeGlyph\(\)\);/);
  assert.doesNotMatch(renderer, /close\.svg/);
  assert.match(css, /\.bb-site-dismiss \{ color: var\(--text\); \}/);
  assert.match(css, /\.bb-site-dismiss svg,\s*\.bb-site-pin svg,[^{]*\{[^}]*stroke: currentColor;/);
  assert.match(preload, /topSites: \(options\) => invoke\('pages:start:top-sites', options\)/);
  // Hiding stays in this page's storage; no channel reaches main for it.
  assert.doesNotMatch(preload, /hideTopSite|dismissTopSite/);
  assert.doesNotMatch(pages, /pages:start:(?:hide|dismiss)-top-site/);
  // Pins are the one Start Page list main holds (start-page-pins.js), so the
  // tab menu and the Favorites page can pin too. Only the Start Page and the
  // Favorites page reach it, and a private start page can't change it.
  assert.match(pages, /handle\('pages:pins:list', \['bookmarks', 'newtab'\]/);
  assert.match(pages, /handleEvent\('pages:pins:pin', \['bookmarks', 'newtab'\]/);
  assert.match(pages, /handleEvent\('pages:pins:unpin', \['bookmarks', 'newtab'\]/);
  assert.match(main, /pin: \(wc, page\) => \(startPageSenderIsPrivate\(wc\)\s*\? \{ ok: false, reason: 'private' \}/);
  assert.match(main, /unpin: \(wc, url\) => !startPageSenderIsPrivate\(wc\) && startPagePins\.unpin\(url\)/);
  assert.match(renderer, /async function togglePin\(page, pinned, statusId\) \{\s*if \(isPrivate\) return false;/);
  assert.doesNotMatch(renderer, /localStorage\.setItem\([A-Z_]*PIN/);
});
