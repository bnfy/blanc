'use strict';

// The Blanc Mail survey page, its site flag and its headers, checked against
// the survey Worker's contract (cloudflare/mail-survey-worker/).
// Spec: docs/superpowers/specs/2026-11-12-mail-feature-survey-design.md.

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const read = (file) => readFileSync(path.join(root, file), 'utf8');
const SURVEY_WORKER = 'https://blanc-mail-survey.bnfy-441.workers.dev';

let CHOICES;
test.before(async () => {
  ({ CHOICES } = await import(pathToFileURL(path.join(root, 'cloudflare/mail-survey-worker/src/survey.js'))));
});

function headerBlock(route) {
  const headers = read('site/public/_headers');
  const match = headers.match(new RegExp(`^${route.replace(/[/.*]/g, '\\$&')}\\n((?:  .*\\n?)+)`, 'm'));
  assert.ok(match, `_headers has a ${route} block`);
  return match[1];
}

test('the survey page posts only to the survey Worker, without analytics', () => {
  const page = read('site/src/pages/mail/survey.astro');
  assert.match(page, /path="\/mail\/survey"/);
  assert.match(page, /analytics=\{false\}/);
  assert.match(page, /social="none"/);
  const form = read('site/src/components/MailSurveyForm.astro');
  assert.ok(form.includes(`'${SURVEY_WORKER}/mail-survey'`));
  assert.match(form, /<form class="mail-survey"[^>]*method="post"/);
  assert.match(form, /name="website" tabindex="-1" autocomplete="off" aria-hidden="true"/);
  assert.match(form, /<button type="submit"[^>]*\bdisabled>/, 'no submission before the script is ready');
  assert.match(form, /<noscript>/);
  assert.doesNotMatch(form + page, /data-track/);
  assert.doesNotMatch(form + page, /newsletter\.bnfy-441/);
});

// The form builds its inputs from [id, label] arrays in its front matter.
function choiceArrays() {
  const form = read('site/src/components/MailSurveyForm.astro');
  const array = (name) => {
    const block = form.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\n\\];`));
    assert.ok(block, `${name} array`);
    return [...block[1].matchAll(/\['([a-z-]+)', '([^']+)'\]/g)].map((match) => ({ id: match[1], label: match[2] }));
  };
  return { form, accounts: array('accounts'), speeds: array('speeds'), features: array('features') };
}

test('the page offers exactly the Worker ids', () => {
  const { form, accounts, speeds, features } = choiceArrays();
  assert.deepEqual(accounts.map((choice) => choice.id), [...CHOICES.account]);
  assert.deepEqual(speeds.map((choice) => choice.id), [...CHOICES.speed]);
  assert.deepEqual(features.map((choice) => choice.id), [...CHOICES.features]);
  assert.match(form, /name="account" value=\{value\}/);
  assert.match(form, /name="speed" value=\{value\}/);
  assert.match(form, /name="features" value=\{value\}/);
  assert.match(form, /<textarea[^>]*name="note"[^>]*maxlength="500"/);
});

test('the page carries the spec privacy wording and never says what is built', () => {
  const { form, accounts, speeds, features } = choiceArrays();
  const text = form + read('site/src/pages/mail/survey.astro');
  assert.match(text, /anonymous/i);
  assert.match(text, /Please don[’']t include personal details/);
  assert.match(text, /href="\/privacy#mail-survey"/);
  assert.match(text, /Blanc Mail isn[’']t released yet/);
  for (const { label } of [...accounts, ...speeds, ...features]) {
    assert.doesNotMatch(label, /\b(built|coming|available|soon|new)\b/i, label);
  }
});

test('the survey page has its own headers block without analytics or chat', () => {
  const block = headerBlock('/mail/survey');
  assert.match(block, /^  ! Content-Security-Policy$/m);
  assert.match(block, new RegExp(`connect-src [^;]*${SURVEY_WORKER.replace(/[/.]/g, '\\$&')}`));
  assert.doesNotMatch(block, /crisp|google|cloudflareinsights/i);
  // The footer's newsletter form and the Mail bar's waitlist form post to the
  // Blanc-owned newsletter Worker; nothing else leaves the page.
  const origins = [...block.matchAll(/https:\/\/[^\s;]+/g)].map((match) => match[0]);
  assert.deepEqual([...new Set(origins)].sort(), [SURVEY_WORKER, 'https://blanc-newsletter.bnfy-441.workers.dev'].sort());
});

test('the site flag decides between the form and the closed message', () => {
  const flag = JSON.parse(read('site/src/data/mail-survey.json'));
  // Ships closed; the go-live PR opens it with the Worker (Worker README).
  assert.equal(flag.open, false);
  const page = read('site/src/pages/mail/survey.astro');
  assert.match(page, /import survey from '..\/..\/data\/mail-survey\.json'/);
  assert.match(page, /survey\.open \?/);
  assert.match(page, /This survey has closed\. Thank you to everyone who answered\./);
});

test('the privacy page describes the survey contract', () => {
  const privacy = read('site/src/pages/privacy.astro');
  assert.match(privacy, /<h3 id="mail-survey">Blanc Mail survey \(optional, anonymous\)<\/h3>/);
  assert.match(privacy, /no email address, IP address or browser details/);
  assert.match(privacy, /keeps no request logs/);
  assert.match(privacy, /only to decide what goes into Blanc Mail 1\.0/);
  assert.match(privacy, /<li>[^<]*Blanc Mail survey[^<]*deleted when that decision is made[^<]*<\/li>/);
});

// Owner-approved Proton wording, 2026-11-12 (spec "Announcing Proton").
const PROTON_LINES = [
  'Gmail and Proton Mail',
  'Connect a Google account directly, or a Proton account through Proton Mail Bridge on your Mac. Mail is stored locally for reading and draft recovery.',
  'Blanc Mail is a native Gmail and Proton Mail app for macOS, coming soon from the makers of Blanc Browser.',
  'Blanc Mail brings a careful, native experience for Gmail and Proton Mail to your Mac.',
  'Native app for Gmail and Proton Mail',
  'plus a Google account, or a Proton account with Proton Mail Bridge.',
];
const SURVEY_LINK = 'Help shape Blanc Mail: tell us what you’d want, anonymously.';
const WAITLIST_INVITE = 'While you’re here, you can tell us what you’d want in Blanc Mail.';

test('the Mail page names both providers and links the open survey', () => {
  const mail = read('site/src/pages/mail.astro');
  for (const line of PROTON_LINES) assert.ok(mail.includes(line), line);
  assert.doesNotMatch(mail, /Gmail first'|Gmail-first native app|native Gmail client|native Gmail experience/);
  assert.match(mail, /import survey from '..\/data\/mail-survey\.json'/);
  assert.match(mail, /survey\.open && [\s\S]{0,200}href="\/mail\/survey"/);
  assert.ok(mail.includes(SURVEY_LINK));
});

test('joining the waitlist offers the survey without tracking', () => {
  const form = read('site/src/components/MailWaitlistForm.astro');
  assert.match(form, /import survey from '..\/data\/mail-survey\.json'/);
  assert.ok(form.includes(WAITLIST_INVITE));
  assert.match(form, /survey\.open && [\s\S]{0,300}href="\/mail\/survey"/);
  const invite = form.slice(form.indexOf('href="/mail/survey"') - 200, form.indexOf('href="/mail/survey"') + 200);
  assert.doesNotMatch(invite, /data-track/);
});

test('every new Mail page sentence has a ledger row', () => {
  const ledger = read('docs/website-mail-claims-2026-11-12.md');
  for (const line of [...PROTON_LINES, SURVEY_LINK, WAITLIST_INVITE]) assert.ok(ledger.includes(line), line);
  assert.ok(ledger.includes('What would you want?'));
  assert.ok(ledger.includes('This survey has closed. Thank you to everyone who answered.'));
});

test('the Mail page shows the invitation card only while the survey is open', () => {
  const mail = read('site/src/pages/mail.astro');
  assert.match(mail, /import MailSurveyInvite from '..\/components\/MailSurveyInvite\.astro'/);
  assert.match(mail, /\{survey\.open && <MailSurveyInvite \/>\}/);
  for (const page of ['site/src/pages/mail/privacy.astro', 'site/src/pages/mail/terms.astro', 'site/src/pages/mail/survey.astro']) {
    assert.doesNotMatch(read(page), /MailSurveyInvite/, page);
  }
});

test('the invitation card is a quiet dialog whose chips start the survey', () => {
  const card = read('site/src/components/MailSurveyInvite.astro');
  assert.match(card, /role="dialog"/);
  assert.doesNotMatch(card, /aria-modal/);
  assert.match(card, /aria-labelledby="mail-survey-invite-title"/);
  assert.match(card, /id="mail-survey-invite-title">Help shape Blanc Mail</);
  assert.match(card, /Which accounts would you use\?/);
  const chips = [...card.matchAll(/href=\{`\/mail\/survey\?account=\$\{id\}`\}/g)];
  assert.equal(chips.length, 1, 'one chip template');
  assert.match(card, /\['gmail', 'Gmail'\][\s\S]*\['proton', 'Proton Mail'\][\s\S]*\['both', 'Both'\][\s\S]*\['other', 'Something else'\]/);
  assert.match(card, /<button[^>]*class="mail-survey-invite-close"[^>]*aria-label="Close"/);
  assert.match(card, /<aside[^>]*\bhidden\b/, 'hidden until its script decides, so a snoozed card never flashes');
  assert.doesNotMatch(card, /data-track|\.focus\(/);
  assert.match(card, /const storage = browserStorage\(\);/);
  assert.match(card, /shouldShow\(readState\(storage\), Date\.now\(\)\)/);
  assert.match(card, /writeState\(storage, snooze\(Date\.now\(\)\)\)/);
});

test('the survey preselects from the link and remembers an answered survey', () => {
  const form = read('site/src/components/MailSurveyForm.astro');
  assert.match(form, /accountFromQuery\(location\.search\)/);
  assert.match(form, /writeState\(browserStorage\(\), ANSWERED\)/);
});

test('the privacy page discloses the invitation card note', () => {
  const privacy = read('site/src/pages/privacy.astro');
  assert.match(privacy, /blanc-mail-survey-invite-v1/);
  assert.match(privacy, /never leaves your browser/);
});

test('the card waits while a waitlist form is behind it', () => {
  const card = read('site/src/components/MailSurveyInvite.astro');
  // Owner's choice A (2026-11-12): never cover a waitlist form, so on phones the
  // card appears once the form has scrolled clear of it.
  assert.match(card, /document\.querySelectorAll<HTMLFormElement>\('main form\[data-mail-waitlist\]'\)/);
  assert.match(card, /overlaps\(/);
  assert.match(card, /classList\.toggle\('is-waiting', /);
  assert.match(card, /addEventListener\('scroll', [^)]*\{ passive: true \}\)/);
  assert.match(card, /addEventListener\('resize', /);
  const css = read('site/src/styles/mail.css');
  assert.match(css, /\.mail-survey-invite\.is-waiting\{[^}]*visibility:hidden[^}]*\}/);
  assert.doesNotMatch(card, /has-mail-survey-invite|mail-survey-invite-short/, 'the compact bar (C) is gone');
});

test('the card also offers a way to suggest something else', () => {
  const card = read('site/src/components/MailSurveyInvite.astro');
  assert.match(card, /<a class="mail-survey-invite-suggest" href="\/mail\/survey#suggest">Suggest something else<\/a>/);
  assert.match(card, /querySelectorAll\('\.mail-survey-invite-chip, \.mail-survey-invite-suggest'\)/, 'opening the survey puts the card away');
  const form = read('site/src/components/MailSurveyForm.astro');
  assert.match(form, /<div class="mail-survey-question" id="suggest">[\s\S]*?name="note"/);
  assert.ok(read('docs/website-mail-claims-2026-11-12.md').includes('| Suggest something else |'));
});
