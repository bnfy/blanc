'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Billboard top sites stay local, private-safe, and independently dismissible', () => {
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
  assert.match(renderer, /state\.topSites\.filter[\s\S]*?\.slice\(0, 6\)/);
  assert.match(renderer, /start\.topSites\(\{[\s\S]*?offset,[\s\S]*?limit: TOP_SITES_PAGE_SIZE/);
  assert.match(renderer, /label\.textContent = \(site\.title \|\| hostOf\(site\.url\)/);
  assert.match(css, /\.bb-fav \.label \{[\s\S]*?-webkit-line-clamp: 2/);
  assert.match(renderer, /localStorage\.setItem\(TOP_SITES_HIDDEN_KEY/);
  assert.match(renderer, /key\.length > 0 && key\.length <= 255/);
  assert.match(renderer, /Hide \$\{label\.textContent\} from Billboard/);
  assert.match(preload, /topSites: \(options\) => invoke\('pages:start:top-sites', options\)/);
  assert.doesNotMatch(preload, /hideTopSite|dismissTopSite/);
  assert.doesNotMatch(pages, /pages:start:(?:hide|dismiss)-top-site/);
});
