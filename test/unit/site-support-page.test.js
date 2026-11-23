'use strict';

// The Support page (redesign of November 23, 2026,
// docs/superpowers/specs/2026-11-23-support-page-redesign-design.md): product
// tabs whose rows come from site/src/data/support-products.json, new iPhone &
// iPad and Blanc Beta answers recorded in a claims ledger, and Mail's
// questions shared with /mail.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.join(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const json = (file) => JSON.parse(read(file));
const flat = (text) => text.replace(/\s+/g, ' ');

const products = json('site/src/data/support-products.json');
const questions = json('site/src/data/support-questions.json');
const guides = json('site/src/data/guide-topics.json').filter((topic) => topic.page === 'support');
const ledger = json('docs/website-support-redesign-2026-11-23-claims.json');
const page = read('site/src/pages/support.astro');
const rows = products.flatMap((product) =>
  product.groups.flatMap((group) => group.rows.map((row) => ({ product: product.id, ...row }))));
const newAnswers = questions.filter((question) => /^(iphone|beta)-/.test(question.id));

test('the product tabs are desktop, iPhone & iPad, Blanc Beta and Mail, in that order', () => {
  assert.deepEqual(products.map((product) => product.id), ['desktop', 'iphone', 'beta', 'mail']);
  for (const product of products) assert.ok(product.groups.length > 0, product.id);
});

test('every Support guide and answer is on the page exactly once, in its own tab', () => {
  const placed = (kind) => rows.filter((row) => row[kind]).map((row) => row[kind]);
  assert.deepEqual([...placed('guide')].sort(), guides.map((topic) => topic.id).sort());
  assert.deepEqual([...placed('answer')].sort(), questions.map((question) => question.id).sort());
  for (const row of rows.filter((row) => row.guide)) assert.equal(row.product, 'desktop', row.guide);
  for (const row of rows.filter((row) => row.answer)) {
    const tab = /^iphone-/.test(row.answer) ? 'iphone' : /^beta-/.test(row.answer) ? 'beta' : 'desktop';
    assert.equal(row.product, tab, row.answer);
  }
});

test('Mail rows come from the module /mail renders, with unique mail- ids', async () => {
  const { mailQuestions, mailSupportTopics } = await import(pathToFileURL(path.join(root, 'site/src/data/mail-questions.mjs')).href);
  const ids = [...mailQuestions, ...mailSupportTopics].map((item) => item.id);
  assert.ok(ids.every((id) => /^mail-[a-z-]+$/.test(id)), ids.join());
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(rows.filter((row) => row.mail).map((row) => row.mail), ids);
  assert.match(page, /from "\.\.\/data\/mail-questions\.mjs"/);
  assert.match(read('site/src/pages/mail.astro'), /from '\.\.\/data\/mail-questions\.mjs'/);
});

test('no two rows can render the same id', () => {
  const rendered = rows.map((row) => row.guide ?? (row.answer === '1password' ? '1password-faq' : row.answer ?? row.mail));
  assert.equal(new Set(rendered).size, rendered.length);
});

test('every ledger claim is still on the page, word for word', () => {
  for (const claim of ledger.claims) {
    assert.ok(flat(read(claim.source)).includes(claim.exactWording), `${claim.id}: ${claim.exactWording}`);
    assert.ok(claim.evidenceGroups.length, claim.id);
    for (const key of claim.evidenceGroups) {
      const group = ledger.evidenceGroups[key];
      assert.ok(group?.qualification && group.evidence.length, `${claim.id} ${key}`);
      for (const file of group.evidence) assert.ok(fs.existsSync(path.join(root, file)), file);
    }
  }
});

test('every new string on the page is in the ledger', () => {
  const recorded = new Set(ledger.claims.map((claim) => claim.exactWording));
  const strings = [
    ...products.flatMap((product) => [product.label, ...product.groups.map((group) => group.title)]),
    ...newAnswers.flatMap((answer) => [answer.q, ...answer.a, ...(answer.links ?? []).map((link) => link.text)]),
    ...[...page.matchAll(/\{ href: "#[\w-]+", text: "([^"]+)" \}/g)].map((match) => match[1]),
  ];
  for (const text of strings) assert.ok(recorded.has(text), text);
  for (const text of ['Still need help?', 'Choose a product', 'Popular', 'Try bookmarks, pairing or 1Password']) {
    assert.ok(page.includes(text), text);
    assert.ok(recorded.has(text), text);
  }
});

test('the new answers stay inside what the releases back', () => {
  const copy = newAnswers.map((answer) => [answer.q, ...answer.a].join(' ')).join(' ');
  for (const claim of json('docs/website-ipad-1.0.3-claims.json').prohibitedClaims) {
    assert.ok(!copy.includes(claim), claim);
  }
  const beta = newAnswers.filter((answer) => answer.id.startsWith('beta-')).map((answer) => answer.a.join(' ')).join(' ');
  assert.doesNotMatch(beta, /installed automatically|installs updates automatically|plays (Netflix|Spotify|protected)/i);
  assert.doesNotMatch(beta, /\b(2\.0\.0-beta\.\d+|158\.0\.\d+)/, 'beta answers name no version');
  assert.match(beta, /Protected video, such as Netflix or Spotify, doesn’t play yet/);
  const iphone = newAnswers.filter((answer) => answer.id.startsWith('iphone-')).map((answer) => answer.a.join(' ')).join(' ');
  assert.doesNotMatch(iphone, /passkey|ad[- ]block/i);
});

test('the hero shows the full-resolution gold Sunrise under the clear header', () => {
  const mark = page.match(/<img\s+class="support-hero-mark"[\s\S]*?\/>/)?.[0] ?? '';
  assert.match(mark, /src="\/lockup\/sunrise-mark-2048\.webp"/);
  assert.match(mark, /\/lockup\/sunrise-mark-2048\.webp 2048w/);
  assert.match(mark, /alt=""/);
  assert.doesNotMatch(page, /sunrise-hero-mark\.png/, 'the 256px share-card mark looks soft at hero size');
  assert.match(read('site/src/components/Header.astro'), /\["\/trust", "\/support"\]\.includes/);
});

test('the tabs fail open where :has() is missing: every panel shows, labeled', () => {
  const css = read('site/src/styles/support.css');
  const outside = css.replace(/@supports[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
  assert.doesNotMatch(outside, /\.support-panel\s*(,|\{)[^}]*display:\s*none/, 'panels may only be hidden where :has() works');
  assert.match(css, /@supports not selector\(:has\(\*\)\)\s*\{[^@]*\.support-tabs\s*\{\s*display:\s*none/);
  assert.match(css, /@supports selector\(:has\(\*\)\)/);
});

test('the radios sit inside one labeled radio group, and product names reach screen readers', () => {
  const group = page.match(/<div class="support-tabs"[^>]*>/)?.[0] ?? '';
  assert.match(group, /role="radiogroup"/);
  assert.match(group, /aria-label="Choose a product"/);
  const tabs = page.slice(page.indexOf('<div class="support-tabs"'), page.indexOf('</div>', page.indexOf('<div class="support-tabs"')));
  assert.match(tabs, /type="radio"/);
  assert.doesNotMatch(page, /class="support-panel-label" aria-hidden/);
});

test('Beta and iPhone copy keeps the owners’ caveats and links', () => {
  const byId = Object.fromEntries(questions.map((question) => [question.id, question]));
  const linux = byId['beta-requirements'].a.join(' ');
  assert.ok(linux.includes('Install and update checks ran on Ubuntu 24.04, Debian 12 and Fedora 45, on x64 and arm64.'), linux);
  assert.ok(linux.includes('KDE and x64 desktops haven’t been checked by hand.'), linux);
  const notYet = byId['beta-not-yet'].a.join(' ');
  assert.doesNotMatch(notYet, /On Mac and Linux, Sync/, 'the Sync caveat applies on every platform');
  assert.match(notYet, /don’t rely on it yet/);
  assert.equal(byId['iphone-get'].links[0].href, '/download#iphone');
  for (const answer of newAnswers) {
    for (const text of [answer.q, ...answer.a, ...(answer.links ?? []).map((link) => link.text)]) {
      assert.doesNotMatch(text, /'/, `straight apostrophe in ${answer.id}: ${text}`);
    }
  }
});
