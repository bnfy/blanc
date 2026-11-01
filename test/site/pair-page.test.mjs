// BLANC_SITE_URL=http://127.0.0.1:4322 node --test test/site/pair-page.test.mjs
//
// blanc.day/pair is what another browser loads when the iPhone's Camera app
// reads a desktop pairing QR (design 2026-10-28 §7.3). The pairing code rides
// in the URL fragment, which never reaches the server but is readable by any
// script on the page, so the page must ship no scripts at all and its
// _headers entry must forbid them even if one slipped in.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const baseURL = process.env.BLANC_SITE_URL || 'http://127.0.0.1:4322';
const root = new URL('../../', import.meta.url);
const read = (file) => readFile(new URL(file, root), 'utf8');

test('the built /pair page runs nothing: no scripts, analytics or chat', async () => {
  const html = await read('site/dist/pair.html');
  assert.doesNotMatch(html, /<script/i);
  assert.doesNotMatch(html, /googletagmanager|google-analytics|cloudflareinsights|crisp/i);
  assert.doesNotMatch(html, /\son[a-z]+=/i, 'no inline event handlers');
  assert.match(html, /<meta[^>]+name="robots"[^>]+content="[^"]*\bnoindex\b/i);
  assert.match(html, /<link[^>]+rel="canonical"[^>]+href="https:\/\/blanc\.day\/pair"/i);
  assert.match(html, /Pair with your Blanc/);
  assert.match(html, /Settings → Sync/);
  assert.match(html, /href="https:\/\/testflight\.apple\.com\/join\/AfczdZne"/);
  assert.doesNotMatch(html, /App Store/, 'Blanc for iPhone is a TestFlight beta');
});

test('_headers forbids scripts, connections and frames on /pair', async () => {
  const headers = await read('site/public/_headers');
  const block = headers.match(/^\/pair\n((?:[ \t]+.*\n?)+)/m);
  assert.ok(block, '_headers has a /pair block');
  const lines = block[1].split('\n').map((line) => line.trim()).filter(Boolean);
  assert.ok(lines.includes('! Content-Security-Policy'), 'the site-wide CSP is detached, not appended to');
  const csp = lines.find((line) => line.startsWith('Content-Security-Policy:'));
  assert.ok(csp, 'a /pair CSP replaces it');
  for (const directive of ["script-src 'none'", "connect-src 'none'", "frame-src 'none'", "default-src 'self'", "img-src 'self' data:", "font-src 'self'"]) {
    assert.ok(csp.includes(directive), `CSP has ${directive}`);
  }
  assert.doesNotMatch(csp, /googletagmanager|cloudflareinsights|crisp|unsafe-eval/);
  assert.ok(lines.includes('Referrer-Policy: no-referrer'));
  assert.ok(lines.includes('X-Robots-Tag: noindex, nofollow'));
});

test('/pair is served, noindex, and kept out of the sitemap and site search', async () => {
  const response = await fetch(`${baseURL}/pair`);
  assert.equal(response.status, 200);
  assert.doesNotMatch(await response.text(), /<script/i);
  const sitemap = await (await fetch(`${baseURL}/sitemap.xml`)).text();
  assert.doesNotMatch(sitemap, /\/pair</);
  const index = await (await fetch(`${baseURL}/search-index.json`)).json();
  assert.ok(!index.some((doc) => /\/pair\b/.test(doc.url)));
});
