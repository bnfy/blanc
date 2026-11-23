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
  const { mailQuestions, mailSupportTopics } = await import(path.join(root, 'site/src/data/mail-questions.mjs'));
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
  assert.match(beta, /Protected video, such as Netflix or Spotify, doesn't play yet/);
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
