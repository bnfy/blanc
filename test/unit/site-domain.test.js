'use strict';

// The website moved to blanc.day on October 13, 2026
// (docs/superpowers/specs/2026-10-13-blanc-day-domain-design.md). Its pages,
// public files, scripts and Workers name the site's own origin and contact
// address only through blanc.day. blancbrowser.com stays a permanent redirect,
// and its tab relay (tabs.blancbrowser.com), newsletter sender
// (updates.blancbrowser.com) and social handles keep their names.

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
};

// Records of past work and generated font metadata keep what they shipped with.
const SKIPPED = new Set([
  'site/src/data/releases.json',
  'site/scripts/build-condensed-newsreader.py',
]);

const TEXT = /\.(?:astro|mjs|js|json|css|html|txt|xml|md|py|toml)$|(?:^|\/)_(?:headers|redirects)$/;

function sources() {
  return execFileSync('git', ['ls-files', 'site/src', 'site/public', 'site/scripts', 'site/astro.config.mjs', 'cloudflare'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter((file) => file && TEXT.test(file) && !SKIPPED.has(file))
    .filter((file) => !file.startsWith('cloudflare/') || /^cloudflare\/[^/]+\/src\//.test(file));
}

test('the site and its Workers name blancbrowser.com only where the move needs it', () => {
  const offenders = [];
  for (const file of sources()) {
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
  assert.deepEqual(offenders, []);
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
