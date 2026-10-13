'use strict';

// The website moved to blanc.day on October 13, 2026
// (docs/superpowers/specs/2026-10-13-blanc-day-domain-design.md). Its pages,
// public files, scripts and Workers, the browser's own links and copy, the
// docs readers use today and the tab-import companions name the site's origin
// and contact address only through blanc.day.
// blancbrowser.com stays a permanent redirect, and its tab relay
// (tabs.blancbrowser.com), newsletter sender (updates.blancbrowser.com) and
// social handles keep their names.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

// The apex or www host, or the support address — not a subdomain such as
// tabs. or updates., and not a handle such as blancbrowser.substack.com.
const OLD_SITE = /(?<![\w.-])(?:www\.)?blancbrowser\.com\b/g;

const ALLOWED = {
  'site/src/lib/site-origin.mjs': ["'https://blancbrowser.com'", 'from blancbrowser.com to'],
  'site/src/pages/privacy.astro': ['(formerly blancbrowser.com)'],
  'site/src/pages/terms.astro': ['(formerly blancbrowser.com)'],
  'cloudflare/newsletter-worker/src/index.js': ["'https://blancbrowser.com',", 'blancbrowser.com stays allowed'],
  // The Worker that retires the former hosts has to name them.
  'cloudflare/blancbrowser-redirects/src/index.js': ["new Set(['blancbrowser.com', 'www.blancbrowser.com', 'www.blanc.day'])"],
  // Official builds still treat the former domain as Bananify's: the tab relay lives there.
  'src/main/bananify-services.js': ["host === 'blancbrowser.com'", 'blancbrowser.com keeps the tab relay'],
  // Docs that explain the move, and the Firefox add-on ID, which never changes.
  'CLAUDE.md': ['from `blancbrowser.com`', '`blancbrowser.com` and its `www.` host', '`tab-import@blancbrowser.com`'],
  'AGENTS.md': ['from `blancbrowser.com`', '`blancbrowser.com` and its `www.` host', '`tab-import@blancbrowser.com`'],
  'site/CLAUDE.md': ['`blancbrowser.com` redirects there path for path'],
  'README.md': ['`blancbrowser.com` redirects there path for path'],
  'SECURITY.md': ['(including the former blancbrowser.com)'],
  'extensions/blanc-tab-import/README.md': ['`tab-import@blancbrowser.com`'],
  'extensions/blanc-tab-import/web-extension/manifest.json': ['"id": "tab-import@blancbrowser.com"'],
};

// Records of past work and generated font metadata keep what they shipped with.
const SKIPPED = new Set([
  'site/src/data/releases.json',
  'site/scripts/build-condensed-newsreader.py',
]);

const TEXT = /\.(?:astro|mjs|js|json|css|html|txt|xml|md|py|toml|ya?ml)$|(?:^|\/)_(?:headers|redirects)$/;

function tracked(paths) {
  return execFileSync('git', ['ls-files', ...paths], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter((file) => file && TEXT.test(file) && !SKIPPED.has(file));
}

function offendersIn(files) {
  const offenders = [];
  for (const file of files) {
    let text = read(file);
    for (const allowed of ALLOWED[file] || []) {
      assert.ok(text.includes(allowed), `${file}: allowance no longer needed: ${allowed}`);
      text = text.replaceAll(allowed, '');
    }
    for (const match of text.matchAll(OLD_SITE)) {
      const line = text.slice(0, match.index).split('\n').length;
      offenders.push(`${file}:${line}`);
    }
  }
  return offenders;
}

test('the site and its Workers name blancbrowser.com only where the move needs it', () => {
  const files = tracked(['site/src', 'site/public', 'site/scripts', 'site/astro.config.mjs', 'cloudflare'])
    .filter((file) => !file.startsWith('cloudflare/') || /^cloudflare\/[^/]+\/src\//.test(file));
  assert.deepEqual(offendersIn(files), []);
});

test('the browser links to and names blanc.day, in every language', () => {
  const files = tracked(['src', 'copy/messages']);
  assert.ok(files.includes('src/renderer/pages/settings.html') && files.includes('copy/messages/de.json'));
  assert.deepEqual(offendersIn(files), []);
});

// Records of past work (release notes and incidents, dated specs and ledgers,
// grant applications, posted marketing) keep the domain they were written on.
const CURRENT_DOCS = [
  'README.md', 'SUPPORT.md', 'SECURITY.md', 'TRADEMARKS.md', 'CONTRIBUTING.md',
  'AGENTS.md', 'CLAUDE.md', 'site/CLAUDE.md', '.bestpractices.json', '.github/ISSUE_TEMPLATE',
  'docs/user-guide.md', 'docs/release-verification.md',
  'docs/press/fact-sheet.md', 'docs/press/release-ownership.md',
  'extensions/blanc-tab-import', 'plugins/blanc-tab-import',
];

test('current docs and the tab-import companions name blanc.day', async () => {
  const files = tracked(CURRENT_DOCS);
  assert.ok(files.includes('.github/ISSUE_TEMPLATE/config.yml') && files.includes('plugins/blanc-tab-import/.codex-plugin/plugin.json'));
  assert.deepEqual(offendersIn(files), []);
  // The companions open the landing page on blanc.day; the relay they call stays put.
  for (const file of ['extensions/blanc-tab-import/web-extension/handoff.mjs',
    'extensions/blanc-tab-import/safari/Blanc Tab Importer/Blanc Tab Importer Extension/Resources/handoff.mjs']) {
    const { LANDING_ORIGIN } = await import(pathToFileURL(path.join(ROOT, file)).href);
    assert.equal(LANDING_ORIGIN, 'https://blanc.day', file);
  }
  const manifest = JSON.parse(read('extensions/blanc-tab-import/web-extension/manifest.json'));
  assert.deepEqual(manifest.host_permissions, ['https://tabs.blancbrowser.com/*']);
});

test('every blanc.day link in the browser opens a page the site builds, not a legacy redirect', () => {
  const legacy = JSON.parse(read('site/src/data/legacy-routes.json'));
  const links = new Set();
  for (const file of tracked(['src']).filter((name) => !/\/strings\.[\w-]+\.js$/.test(name))) {
    for (const [, pathname = '/'] of read(file).matchAll(/https:\/\/blanc\.day(\/[^"'`#?\s)]*)?/g)) links.add(pathname);
  }
  assert.ok(links.has('/trust') && links.has('/privacy') && links.has('/changelog'), [...links].join(', '));
  for (const pathname of links) {
    const page = pathname === '/' ? 'index' : pathname.replace(/^\/|\/$/g, '');
    const built = ['.astro', '/index.astro'].some((ext) => fs.existsSync(path.join(ROOT, 'site/src/pages', page + ext)));
    assert.ok(built, `${pathname} is not a site page`);
    assert.equal(legacy[pathname.replace(/\/$/, '')], undefined, `${pathname} is a legacy redirect`);
  }
});

test('one constant holds the site origin, and the build reads it', async () => {
  const { SITE_ORIGIN, FORMER_SITE_ORIGIN } = await import(pathToFileURL(path.join(ROOT, 'site/src/lib/site-origin.mjs')).href);
  assert.equal(SITE_ORIGIN, 'https://blanc.day');
  assert.equal(FORMER_SITE_ORIGIN, 'https://blancbrowser.com');
  assert.match(read('site/astro.config.mjs'), /\bsite: SITE_ORIGIN,/);
  assert.match(read('site/public/robots.txt'), /^Sitemap: https:\/\/blanc\.day\/sitemap\.xml$/m);
  assert.match(read('site/public/.well-known/security.txt'), /^Canonical: https:\/\/blanc\.day\/\.well-known\/security\.txt$/m);
});

test('the Workers serve and link the site on blanc.day', async () => {
  const pingRoutes = read('cloudflare/ping-worker/wrangler.toml');
  assert.match(pingRoutes, /\{ pattern = "blanc\.day\/dl\/\*", zone_name = "blanc\.day" \}/);
  assert.match(pingRoutes, /\{ pattern = "www\.blanc\.day\/dl\/\*", zone_name = "blanc\.day" \}/);
  const { LANDING_ORIGIN, launchUrlFor } = await import(pathToFileURL(path.join(ROOT, 'cloudflare/tab-import-worker/src/model.js')).href);
  assert.equal(LANDING_ORIGIN, 'https://blanc.day');
  const capability = { id: Buffer.alloc(16, 1).toString('base64url'), key: Buffer.alloc(32, 2).toString('base64url') };
  assert.match(launchUrlFor(capability), /^https:\/\/blanc\.day\/import-tabs\/#v=1&id=/);
  // The relay itself stays where shipped browsers and store extensions call it.
  assert.match(read('cloudflare/tab-import-worker/wrangler.toml'), /^pattern = "tabs\.blancbrowser\.com"$/m);
});
