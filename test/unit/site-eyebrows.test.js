'use strict';

// The site keeps an eyebrow (the small label above a headline) only where it
// says something the headline and breadcrumb do not: status, platform, a
// version or date, Patron, or the page's name above a tagline H1. Everything
// else was removed on purpose; see
// docs/superpowers/specs/2026-10-08-site-eyebrow-reduction-design.md.
// Adding one means adding it here, in the same commit.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const SRC = path.join(ROOT, 'site/src');
// Matches only elements carrying one of the eyebrow classes as a whole class
// name, so an outer wrapper is never mistaken for one and swallowed.
const ELEMENT = /<([a-z][a-z0-9]*)\b[^>]*\bclass="[^"]*(?<![\w-])(?:section-kicker|pop-eyebrow|mail-eyebrow|frame-kicker|eyebrow)(?![\w-])[^"]*"[^>]*>([\s\S]*?)<\/\1>/g;

const ALLOWED = [
  'components/ReleaseEvidence.astro → public v1.27.0 · October 3, 2026',
  'pages/404.astro → 404',
  'pages/about.astro → about blanc',
  'pages/ambassadors.astro → Blanc ambassador pilot',
  'pages/features.astro → Patron',
  'pages/features/security.astro → public v1.27.0 · October 3, 2026',
  'pages/features/workspaces.astro → Blanc Patron',
  'pages/index.astro → Blanc Browser',
  'pages/index.astro → The Island',
  'pages/mail/download.astro → macOS only · Coming soon',
  'pages/mail/pricing.astro → Blanc Mail · Planned pricing',
  'pages/mail/privacy.astro → Blanc Mail · Pre-release policy',
  'pages/mail/support.astro → Blanc Mail',
  'pages/mail/terms.astro → Blanc Mail · Pre-release terms',
  'pages/media.astro → Media',
  'pages/roadmap.astro → Feature Roadmap',
  'pages/support.astro → Blanc Support',
  'pages/trust.astro → Privacy & security',
];

function eyebrows(markup) {
  return [...markup.matchAll(ELEMENT)].map(([, , inner]) => inner.replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim());
}

test('the eyebrow matcher finds every eyebrow class, including multi-line ones', () => {
  const fixture = `
    <main class="feature-page"><section class="hero"><div>
    <p class="section-kicker">one</p><h2>x</h2></div></section>
    <p class="pop-eyebrow">two</p>
    <p class="mail-eyebrow">three &amp; more</p>
    <p class="frame-kicker">
      four
    </p><h1>y</h1>
    <p class="eyebrow">five</p>
    <p class="section-kicker-like">not one</p>
    <p class="lead">not one either</p></main>`;
  assert.deepEqual(eyebrows(fixture), ['one', 'two', 'three & more', 'four', 'five']);
});

test('the site carries only the allowed eyebrows', () => {
  const found = fs.readdirSync(SRC, { recursive: true }).filter(file => file.endsWith('.astro')).flatMap(file =>
    eyebrows(fs.readFileSync(path.join(SRC, file), 'utf8')).map(text => `${file.split(path.sep).join('/')} → ${text}`),
  ).sort();
  assert.deepEqual(found, [...ALLOWED].sort());
});
