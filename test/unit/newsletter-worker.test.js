'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const WORKER_PATH = path.resolve(__dirname, '../../cloudflare/newsletter-worker/src/index.js');
const DEPLOY_PATH = path.resolve(__dirname, '../../cloudflare/newsletter-worker/deploy.mjs');
const AMBASSADOR_PAGE_PATH = path.resolve(__dirname, '../../site/src/pages/ambassadors.astro');
const SITE_HEADERS_PATH = path.resolve(__dirname, '../../site/public/_headers');
let worker;
let assertVerifiedDomain;
test.before(async () => {
  worker = (await import(pathToFileURL(WORKER_PATH))).default;
  ({ assertVerifiedDomain } = await import(pathToFileURL(DEPLOY_PATH)));
});

class FakeKV {
  constructor() { this.values = new Map(); this.metadata = new Map(); this.gets = 0; this.deletes = 0; }
  async get(key, options) {
    this.gets += 1;
    const value = this.values.get(key) ?? null;
    return options?.type === 'json' && value !== null ? JSON.parse(value) : value;
  }
  async put(key, value, options) {
    this.values.set(key, String(value));
    if (options?.metadata) this.metadata.set(key, options.metadata); else this.metadata.delete(key);
  }
  async delete(key) { this.deletes += 1; this.values.delete(key); this.metadata.delete(key); }
  // Pages of at most `limit` (KV's default 1000) keys, like Workers KV.
  async list({ prefix = '', limit = 1000, cursor } = {}) {
    const names = [...this.values.keys()].filter((name) => name.startsWith(prefix)).sort();
    const start = cursor ? Number(cursor) : 0;
    const page = names.slice(start, start + limit);
    const end = start + page.length;
    return {
      keys: page.map((name) => (this.metadata.has(name) ? { name, metadata: this.metadata.get(name) } : { name })),
      list_complete: end >= names.length,
      cursor: end >= names.length ? undefined : String(end),
    };
  }
}

class FakeRateLimiter {
  constructor(limit = 4) {
    this.limitValue = limit;
    this.counts = new Map();
  }
  async limit({ key }) {
    const count = (this.counts.get(key) ?? 0) + 1;
    this.counts.set(key, count);
    return { success: count <= this.limitValue };
  }
}

const environment = () => ({
  SUBSCRIBERS: new FakeKV(),
  NEWSLETTER_TOKEN_SECRET: 'token-secret',
  RESEND_API_KEY: 're_test',
  NEWSLETTER_FROM: 'Blanc <release-notes@updates.blancbrowser.com>',
  AMBASSADOR_TO: 'support@blancbrowser.com',
  AMBASSADOR_RATE_LIMITER: new FakeRateLimiter(),
});

function subscribeRequest(body, headers = {}) {
  return new Request('https://newsletter.test/subscribe', {
    method: 'POST',
    headers: {
      Origin: 'https://blanc.day',
      'CF-Connecting-IP': '203.0.113.9',
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function ambassadorRequest(body, headers = {}) {
  return new Request('https://newsletter.test/ambassador-apply', {
    method: 'POST',
    headers: {
      Origin: 'https://blanc.day',
      'CF-Connecting-IP': '203.0.113.10',
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function nativeAmbassadorRequest(body, headers = {}) {
  return new Request('https://newsletter.test/ambassador-apply', {
    method: 'POST',
    headers: {
      Origin: 'https://blanc.day',
      'CF-Connecting-IP': '203.0.113.12',
      'Content-Type': 'application/x-www-form-urlencoded',
      ...headers,
    },
    body: new URLSearchParams(body),
  });
}

test('the site posts from blanc.day, and pages still open on the former origin keep working', async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('{}');
  t.after(() => { globalThis.fetch = originalFetch; });

  for (const origin of ['https://blanc.day', 'https://blancbrowser.com']) {
    const response = await worker.fetch(subscribeRequest({ email: 'person@example.com' }, { Origin: origin }), environment());
    assert.equal(response.status, 202, origin);
  }
});

test('subscribe rejects non-site origins and quarantines honeypot addresses', async (t) => {
  const env = environment();
  const originalFetch = globalThis.fetch;
  let mailCalls = 0;
  globalThis.fetch = async () => { mailCalls += 1; return new Response('{}'); };
  t.after(() => { globalThis.fetch = originalFetch; });

  const denied = subscribeRequest({ email: 'person@example.com' }, { Origin: 'https://evil.example' });
  assert.equal((await worker.fetch(denied, env)).status, 403);
  const trapped = await worker.fetch(subscribeRequest({
    email: 'victim@example.com', website: 'filled-by-bot',
  }), env);
  assert.equal(trapped.status, 202);
  assert.equal(mailCalls, 0);
  assert.equal(await env.SUBSCRIBERS.get('sub:victim@example.com'), null);
  assert.ok(await env.SUBSCRIBERS.get('hp:victim@example.com'));

  const exported = await worker.fetch(new Request('https://newsletter.test/subscribers', {
    headers: { Authorization: 'Bearer admin' },
  }), { ...env, ADMIN_TOKEN: 'admin' });
  assert.deepEqual((await exported.json()).quarantined.map(({ email }) => email), [
    'victim@example.com',
  ]);

  const rescued = await worker.fetch(subscribeRequest({
    email: 'victim@example.com', website: '',
  }), env);
  assert.equal(rescued.status, 202);
  assert.equal(mailCalls, 1);
  assert.equal(await env.SUBSCRIBERS.get('hp:victim@example.com'), null);
  assert.equal(await env.SUBSCRIBERS.get('sub:victim@example.com'), null);
});

test('an address enters the list only after confirmation and can self-unsubscribe', async (t) => {
  const env = environment();
  const originalFetch = globalThis.fetch;
  let mail;
  globalThis.fetch = async (_url, init) => {
    mail = JSON.parse(init.body);
    return new Response(JSON.stringify({ id: 'mail-1' }), { status: 200 });
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  const pending = await worker.fetch(subscribeRequest({ email: 'person@example.com', website: '' }), env);
  assert.equal(pending.status, 202);
  assert.equal(await env.SUBSCRIBERS.get('sub:person@example.com'), null);
  assert.equal(await env.SUBSCRIBERS.get('hp:person@example.com'), null);
  const confirmationUrl = mail.text.match(/https:\/\/[^\s]+\/confirm\?token=[A-Za-z0-9_-]{43}/)?.[0];
  assert.ok(confirmationUrl);
  // The HTML part is the branded layout and carries the same link.
  assert.ok(mail.html.includes(`href="${confirmationUrl}"`), 'HTML button links to the confirmation URL');
  assert.ok(mail.html.includes('src="https://blanc.day/press/blanc-lockup-ink-480.png"'), 'HTML shows the Blanc lockup');
  assert.match(mail.html, /background-color:#F8F2E8/, 'HTML sits on Blanc White');

  const confirmed = await worker.fetch(new Request(confirmationUrl), env);
  assert.equal(confirmed.status, 200);
  const record = await env.SUBSCRIBERS.get('sub:person@example.com', { type: 'json' });
  assert.match(record.unsubscribeToken, /^[A-Za-z0-9_-]{43}$/);

  const removed = await worker.fetch(new Request(
    `https://newsletter.test/unsubscribe?token=${record.unsubscribeToken}`
  ), env);
  assert.equal(removed.status, 200);
  assert.equal(await env.SUBSCRIBERS.get('sub:person@example.com'), null);
});

test('misconfigured confirmation delivery fails closed without enrollment', async () => {
  const env = environment();
  delete env.RESEND_API_KEY;
  const response = await worker.fetch(subscribeRequest({ email: 'person@example.com' }), env);
  assert.equal(response.status, 503);
  assert.equal(await env.SUBSCRIBERS.get('sub:person@example.com'), null);
});

test('ambassador applications are validated and delivered without KV storage', async (t) => {
  const env = environment();
  const originalFetch = globalThis.fetch;
  let mail;
  globalThis.fetch = async (_url, init) => {
    mail = JSON.parse(init.body);
    return new Response(JSON.stringify({ id: 'mail-application' }), { status: 200 });
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  const response = await worker.fetch(ambassadorRequest({
    name: 'Ada Lovelace',
    email: 'ADA@example.com',
    profileUrl: 'https://example.com/ada',
    introduction: 'I explain independent software to curious designers.',
    blancCheck: '',
  }), env);

  assert.equal(response.status, 202);
  assert.equal(mail.to[0], 'support@blancbrowser.com');
  assert.equal(mail.reply_to, 'ada@example.com');
  assert.match(mail.text, /Creator profile: https:\/\/example\.com\/ada/);
  assert.deepEqual(
    [...env.SUBSCRIBERS.values.keys()].filter((key) => !key.startsWith('ip:')),
    []
  );
});

test('ambassador honeypot and invalid applications are rejected without delivery', async (t) => {
  const env = environment();
  const originalFetch = globalThis.fetch;
  let mailCalls = 0;
  globalThis.fetch = async () => { mailCalls += 1; return new Response('{}'); };
  t.after(() => { globalThis.fetch = originalFetch; });

  const trapped = await worker.fetch(ambassadorRequest({
    name: 'Bot',
    email: 'bot@example.com',
    profileUrl: 'https://example.com/bot',
    introduction: 'This looks long enough to pass normal validation.',
    blancCheck: 'filled',
  }), env);
  assert.equal(trapped.status, 400);
  assert.equal(mailCalls, 0);

  const invalid = await worker.fetch(ambassadorRequest({
    name: 'Person',
    email: 'person@example.com',
    profileUrl: 'javascript:alert(1)',
    introduction: 'Too short',
    blancCheck: '',
  }, { 'CF-Connecting-IP': '203.0.113.11' }), env);
  assert.equal(invalid.status, 400);
  assert.equal(mailCalls, 0);

  const denied = await worker.fetch(ambassadorRequest({}, { Origin: 'https://evil.example' }), env);
  assert.equal(denied.status, 403);
});

test('ambassador delivery fails closed when its recipient is not configured', async () => {
  const env = environment();
  delete env.AMBASSADOR_TO;
  const response = await worker.fetch(ambassadorRequest({
    name: 'Person',
    email: 'person@example.com',
    profileUrl: 'https://example.com/person',
    introduction: 'I make thoughtful videos about independent software.',
    blancCheck: '',
  }), env);
  assert.equal(response.status, 503);
});

test('native ambassador fallback remains POST-only and returns an HTML result', async (t) => {
  const env = environment();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ id: 'mail-native' }), { status: 200 });
  t.after(() => { globalThis.fetch = originalFetch; });

  const response = await worker.fetch(nativeAmbassadorRequest({
    name: 'Grace Hopper',
    email: 'grace@example.com',
    profileUrl: 'https://example.com/grace',
    introduction: 'I write about useful technology for working developers.',
    blancCheck: '',
  }), env);
  assert.equal(response.status, 202);
  assert.match(response.headers.get('Content-Type'), /^text\/html/);
  assert.match(await response.text(), /Application received/);
});

test('ambassador form fallback is a CSP-authorized POST with aligned HTTPS validation', () => {
  const page = readFileSync(AMBASSADOR_PAGE_PATH, 'utf8');
  const headers = readFileSync(SITE_HEADERS_PATH, 'utf8');
  assert.match(page, /action=\{APPLICATION_ENDPOINT\}/);
  assert.match(page, /method="post"/);
  assert.match(page, /pattern="https:\/\/\.\*"/);
  assert.match(headers, /form-action 'self' https:\/\/blanc-newsletter\.bnfy-441\.workers\.dev/);
});

test('ambassador requests use the platform rate limiter and fail closed without it', async (t) => {
  const env = environment();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ id: 'mail-rate' }), { status: 200 });
  t.after(() => { globalThis.fetch = originalFetch; });
  const valid = (suffix) => ({
    name: 'Creator',
    email: `creator${suffix}@example.com`,
    profileUrl: `https://example.com/creator${suffix}`,
    introduction: `I make thoughtful independent software videos number ${suffix}.`,
    blancCheck: '',
  });

  for (let index = 0; index < 4; index += 1) {
    assert.equal((await worker.fetch(ambassadorRequest(valid(index)), env)).status, 202);
  }
  assert.equal((await worker.fetch(ambassadorRequest(valid(4)), env)).status, 429);

  const missing = environment();
  delete missing.AMBASSADOR_RATE_LIMITER;
  assert.equal((await worker.fetch(ambassadorRequest(valid('missing'), {
    'CF-Connecting-IP': '203.0.113.13',
  }), missing)).status, 503);
});

test('deploy gate requires the sender to be covered by a verified Resend domain', () => {
  const deploySource = readFileSync(DEPLOY_PATH, 'utf8');
  const workerPackage = JSON.parse(readFileSync(
    path.resolve(__dirname, '../../cloudflare/newsletter-worker/package.json'),
    'utf8'
  ));
  assert.equal(workerPackage.scripts.deploy, 'node deploy.mjs');
  assert.match(deploySource, /process\.env\.RESEND_DEPLOY_API_KEY/);
  assert.doesNotMatch(deploySource, /const apiKey = process\.env\.RESEND_API_KEY/);
  assert.doesNotThrow(() => assertVerifiedDomain(
    { status: 'verified', name: 'blancbrowser.com' },
    'updates.blancbrowser.com'
  ));
  assert.throws(
    () => assertVerifiedDomain({ status: 'pending', name: 'blancbrowser.com' }, 'blancbrowser.com'),
    /not verified/
  );
  assert.throws(
    () => assertVerifiedDomain({ status: 'verified', name: 'example.com' }, 'updates.blancbrowser.com'),
    /outside verified/
  );
});

function waitlistRequest(body, headers = {}) {
  return new Request('https://newsletter.test/mail-waitlist', {
    method: 'POST',
    headers: {
      Origin: 'https://blanc.day',
      'CF-Connecting-IP': '203.0.113.20',
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

const admin = (pathname, method = 'GET', token = 'admin') => new Request(`https://newsletter.test${pathname}`, {
  method,
  headers: token ? { Authorization: `Bearer ${token}` } : {},
});

test('the Mail waitlist uses its own double opt-in and never joins the newsletter', async (t) => {
  const env = { ...environment(), ADMIN_TOKEN: 'admin' };
  const originalFetch = globalThis.fetch;
  let mail;
  globalThis.fetch = async (_url, init) => {
    mail = JSON.parse(init.body);
    return new Response(JSON.stringify({ id: 'mail-1' }), { status: 200 });
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  assert.equal((await worker.fetch(waitlistRequest({ email: 'a@example.com' }, { Origin: 'https://evil.example' }), env)).status, 403);
  const pending = await worker.fetch(waitlistRequest({ email: ' Person@Example.com ', website: '' }), env);
  assert.equal(pending.status, 202);
  assert.match(mail.subject, /Blanc Mail waitlist/);
  assert.match(mail.text, /does not subscribe you to the Blanc newsletter/);
  assert.match(mail.text, /deleted after the launch announcement/);
  assert.equal(await env.SUBSCRIBERS.get('mailwait:person@example.com'), null);

  // A waitlist token never confirms a newsletter subscription.
  const token = mail.text.match(/\/mail-waitlist\/confirm\?token=([A-Za-z0-9_-]{43})/)?.[1];
  assert.ok(token);
  assert.equal((await (await worker.fetch(new Request(`https://newsletter.test/confirm?token=${token}`), env)).text()).includes('invalid or expired'), true);

  const confirmed = await worker.fetch(new Request(`https://newsletter.test/mail-waitlist/confirm?token=${token}`), env);
  assert.match(await confirmed.text(), /on the waitlist/);
  const record = await env.SUBSCRIBERS.get('mailwait:person@example.com', { type: 'json' });
  assert.match(record.unsubscribeToken, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(await env.SUBSCRIBERS.get('sub:person@example.com'), null);

  const newsletter = await (await worker.fetch(admin('/subscribers'), env)).json();
  assert.equal(newsletter.count, 0);
  const waitlist = await (await worker.fetch(admin('/mail-waitlist/members'), env)).json();
  assert.deepEqual(waitlist.subscribers.map(({ email }) => email), ['person@example.com']);
  assert.match(waitlist.subscribers[0].unsubscribeUrl, /\/mail-waitlist\/leave\?token=/);

  const left = await worker.fetch(new Request(`https://newsletter.test/mail-waitlist/leave?token=${record.unsubscribeToken}`), env);
  assert.match(await left.text(), /removed from the Blanc Mail waitlist/);
  assert.equal(await env.SUBSCRIBERS.get('mailwait:person@example.com'), null);
});

test('waitlist honeypot quarantine stays separate from the newsletter quarantine', async (t) => {
  const env = environment();
  const originalFetch = globalThis.fetch;
  let mailCalls = 0;
  globalThis.fetch = async () => { mailCalls += 1; return new Response('{}'); };
  t.after(() => { globalThis.fetch = originalFetch; });

  const trapped = await worker.fetch(waitlistRequest({ email: 'bot@example.com', website: 'x' }), env);
  assert.equal(trapped.status, 202);
  assert.equal(mailCalls, 0);
  assert.ok(await env.SUBSCRIBERS.get('mailwait-hp:bot@example.com'));
  assert.equal(await env.SUBSCRIBERS.get('hp:bot@example.com'), null);
});

test('waitlist admin endpoints fail closed and purge only waitlist records', async (t) => {
  const env = { ...environment(), ADMIN_TOKEN: 'admin' };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('{}');
  t.after(() => { globalThis.fetch = originalFetch; });

  await env.SUBSCRIBERS.put('sub:reader@example.com', JSON.stringify({ ts: 't' }));
  await env.SUBSCRIBERS.put('mailwait:a@example.com', JSON.stringify({ ts: 't' }));
  await env.SUBSCRIBERS.put('mailwait-leave:hash', 'a@example.com');
  await env.SUBSCRIBERS.put('mailwait-hp:b@example.com', JSON.stringify({ ts: 't' }));

  assert.equal((await worker.fetch(admin('/mail-waitlist/members', 'GET', null), env)).status, 401);
  assert.equal((await worker.fetch(admin('/mail-waitlist/members', 'DELETE', 'wrong'), env)).status, 401);
  assert.equal((await worker.fetch(admin('/mail-waitlist/members', 'DELETE'), env)).status, 400);
  assert.ok(await env.SUBSCRIBERS.get('mailwait:a@example.com'));

  const purged = await worker.fetch(admin('/mail-waitlist/members?confirm=delete-all', 'DELETE'), env);
  assert.deepEqual(await purged.json(), { deleted: 1, remaining: false });
  assert.deepEqual([...env.SUBSCRIBERS.values.keys()], ['sub:reader@example.com']);
});

test('the Mail waitlist form, CSP and privacy disclosure describe the Worker contract', () => {
  const site = (name) => readFileSync(path.resolve(__dirname, '../../site', name), 'utf8');
  const form = site('src/components/MailWaitlistForm.astro');
  assert.match(form, /'https:\/\/blanc-newsletter\.bnfy-441\.workers\.dev\/mail-waitlist'/);
  assert.match(form, /<form class="mail-waitlist"[^>]*method="post"/, 'an address never lands in the page URL');
  assert.match(form, /name="website" tabindex="-1" autocomplete="off" aria-hidden="true"/);
  assert.match(form, /<button type="submit"[^>]*\bdisabled>/, 'no submission before the script is ready');
  assert.match(form, /button\.disabled = false;\n/);
  assert.match(form, /separate from the Blanc newsletter/);
  assert.match(form, /delete it after the launch announcement/);
  assert.match(form, /href="\/privacy#mail-waitlist"/);
  for (const page of ['src/pages/mail.astro', 'src/pages/mail/download.astro']) {
    assert.match(site(page), /<MailWaitlistForm/, page);
  }
  // Legal pages carry no social-sharing metadata, like /privacy and /terms.
  for (const page of ['src/pages/mail/privacy.astro', 'src/pages/mail/terms.astro']) {
    assert.match(site(page), /header="legal" analytics=\{false\} social="none"/, page);
  }
  const headers = readFileSync(SITE_HEADERS_PATH, 'utf8');
  assert.match(headers, /connect-src [^;]*https:\/\/blanc-newsletter\.bnfy-441\.workers\.dev/);
  const privacy = site('src/pages/privacy.astro');
  assert.match(privacy, /<h3 id="mail-waitlist">Blanc Mail waitlist \(optional, double opt-in\)<\/h3>/);
  assert.match(privacy, /does not subscribe you to the newsletter/);
  assert.match(privacy, /we delete the whole waitlist/);
});

test('a large waitlist purges in bounded batches and exports from list metadata', async (t) => {
  const env = { ...environment(), ADMIN_TOKEN: 'admin' };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('{}');
  t.after(() => { globalThis.fetch = originalFetch; });
  for (let i = 0; i < 700; i += 1) {
    const member = { ts: `2026-10-08T00:00:${String(i).padStart(4, '0')}Z`, unsubscribeToken: 'a'.repeat(43) };
    await env.SUBSCRIBERS.put(`mailwait:m${i}@example.com`, JSON.stringify(member), { metadata: member });
    await env.SUBSCRIBERS.put(`mailwait-leave:h${i}`, `m${i}@example.com`);
  }
  await env.SUBSCRIBERS.put('sub:reader@example.com', '{}');

  env.SUBSCRIBERS.gets = 0;
  const exported = await (await worker.fetch(admin('/mail-waitlist/members'), env)).json();
  assert.equal(exported.count, 700);
  assert.equal(env.SUBSCRIBERS.gets, 0, 'members come from list metadata, not one get each');

  const first = await (await worker.fetch(admin('/mail-waitlist/members?confirm=delete-all', 'DELETE'), env)).json();
  assert.equal(first.remaining, true);
  assert.ok(env.SUBSCRIBERS.deletes <= 900, 'one request stays inside the per-invocation KV budget');
  const second = await (await worker.fetch(admin('/mail-waitlist/members?confirm=delete-all', 'DELETE'), env)).json();
  assert.equal(second.remaining, false);
  assert.deepEqual([...env.SUBSCRIBERS.values.keys()], ['sub:reader@example.com']);
});

test('confirming twice leaves exactly one removal lookup for the address', async (t) => {
  const env = environment();
  const originalFetch = globalThis.fetch;
  const tokens = [];
  globalThis.fetch = async (_url, init) => {
    tokens.push(JSON.parse(init.body).text.match(/confirm\?token=([A-Za-z0-9_-]{43})/)[1]);
    return new Response('{}');
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  await worker.fetch(waitlistRequest({ email: 'twice@example.com' }), env);
  await env.SUBSCRIBERS.delete([...env.SUBSCRIBERS.values.keys()].find((k) => k.startsWith('mailwait-sent:')));
  await worker.fetch(waitlistRequest({ email: 'twice@example.com' }), env);
  for (const token of tokens) {
    await worker.fetch(new Request(`https://newsletter.test/mail-waitlist/confirm?token=${token}`), env);
  }
  const leaveKeys = [...env.SUBSCRIBERS.values.keys()].filter((k) => k.startsWith('mailwait-leave:'));
  assert.equal(leaveKeys.length, 1);
  await worker.fetch(admin('/mail-waitlist/member?email=twice@example.com', 'DELETE'), { ...env, ADMIN_TOKEN: 'admin' });
  assert.deepEqual([...env.SUBSCRIBERS.values.values()].filter((v) => v.includes('twice@example.com')), []);
});

// Records console.error lines for one test and restores it afterwards.
function captureErrors(t) {
  const lines = [];
  const original = console.error;
  console.error = (line) => { lines.push(String(line)); };
  t.after(() => { console.error = original; });
  return lines;
}

test('a Worker exception on a form route is a readable 503, and the log names the cause', async (t) => {
  const logged = captureErrors(t);
  const env = environment();
  env.SUBSCRIBERS.put = async () => { throw new Error('KV put() limit exceeded for the day.'); };

  for (const request of [
    subscribeRequest({ email: 'person@example.com' }),
    waitlistRequest({ email: 'person@example.com' }),
  ]) {
    const response = await worker.fetch(request, env);
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'https://blanc.day');
    assert.deepEqual(await response.json(), { error: 'service unavailable' });
  }
  assert.deepEqual(logged.map((line) => JSON.parse(line)), [
    { event: 'unhandled-error', route: '/subscribe', error: 'Error', message: 'KV put() limit exceeded for the day.' },
    { event: 'unhandled-error', route: '/mail-waitlist', error: 'Error', message: 'KV put() limit exceeded for the day.' },
  ]);

  // The ambassador handler catches its expected failures itself; an
  // unexpected one still returns its native-form HTML page.
  t.mock.method(crypto.subtle, 'digest', async () => { throw new Error('digest failed'); });
  const page = await worker.fetch(nativeAmbassadorRequest({
    name: 'Grace Hopper',
    email: 'grace@example.com',
    profileUrl: 'https://example.com/grace',
    introduction: 'I write about useful technology for working developers.',
    blancCheck: '',
  }), environment());
  assert.equal(page.status, 503);
  assert.equal(page.headers.get('Access-Control-Allow-Origin'), 'https://blanc.day');
  assert.match(await page.text(), /temporarily unavailable/);
  assert.equal(JSON.parse(logged.at(-1)).route, '/ambassador-apply');
});

test('a refused confirmation send logs Resend\'s status and error name but never the address', async (t) => {
  const logged = captureErrors(t);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    statusCode: 401, name: 'invalid_api_key', message: 'API key is invalid for person@example.com',
  }), { status: 401 });
  t.after(() => { globalThis.fetch = originalFetch; });

  const env = environment();
  const response = await worker.fetch(waitlistRequest({ email: 'person@example.com' }), env);
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'https://blanc.day');
  assert.deepEqual(logged.map((line) => JSON.parse(line)), [
    { event: 'confirmation-not-sent', list: 'mail-waitlist', status: 401, resendError: 'invalid_api_key' },
  ]);
  assert.ok(logged.every((line) => !line.includes('person@example.com')));
  assert.deepEqual([...env.SUBSCRIBERS.values.keys()].filter((key) => key.startsWith('mailwait')), []);
});

test('missing Worker configuration is logged by name only', async (t) => {
  const logged = captureErrors(t);
  const env = environment();
  delete env.NEWSLETTER_TOKEN_SECRET;
  delete env.RESEND_API_KEY;
  assert.equal((await worker.fetch(waitlistRequest({ email: 'person@example.com' }), env)).status, 503);
  assert.deepEqual(JSON.parse(logged[0]), {
    event: 'config-missing', list: 'mail-waitlist', missing: ['NEWSLETTER_TOKEN_SECRET', 'RESEND_API_KEY'],
  });
});

test('the branded email layout escapes text and keeps the lockup PNG served by the site', async () => {
  const { renderEmail, LOCKUP_URL, FONT_URL } = await import(pathToFileURL(path.resolve(__dirname, '../../cloudflare/newsletter-worker/src/email.js')));
  const html = renderEmail({ heading: 'A <b> & "c"', paragraphs: ['x < y', { lead: 'L&', text: '<i>' }], action: { label: 'Go', url: 'https://blanc.day/?a=1&b=2' } });
  assert.ok(html.includes('A &lt;b&gt; &amp; &quot;c&quot;'));
  assert.ok(html.includes('x &lt; y'));
  assert.ok(html.includes('L&amp;</strong> &lt;i&gt;'));
  assert.ok(html.includes('href="https://blanc.day/?a=1&amp;b=2"'));
  assert.ok(!/<svg|\.webp/.test(html), 'no SVG or WebP, which email clients drop');
  // The only <style> declares the web font; everything else is inline.
  assert.deepEqual(html.match(/<style>[^<]*<\/style>/g), [`<style>@font-face{font-family:'Instrument Sans';src:url(${FONT_URL}) format('woff2');font-weight:400 700;font-stretch:75% 100%;font-style:normal;}</style>`]);
  assert.ok(!/Newsreader|Inter,/.test(html), 'emails no longer use Newsreader or Inter');
  const fontFile = readFileSync(path.resolve(__dirname, '../../site/public', `.${new URL(FONT_URL).pathname}`));
  assert.deepEqual(fontFile, readFileSync(path.resolve(__dirname, '../../src/renderer/pages/instrument-sans-latin-wdth-normal.woff2')), 'site serves the app\'s own Instrument Sans file');
  const headers = readFileSync(SITE_HEADERS_PATH, 'utf8');
  assert.match(headers, /\/fonts\/instrument-sans\/\*\n  ! Cross-Origin-Resource-Policy\n  Access-Control-Allow-Origin: \*/, 'mail apps on other origins may load the font');
  assert.match(headers, /\/press\/blanc-lockup-ink-480\.png\n  ! Cross-Origin-Resource-Policy/, 'mail apps on other origins may load the lockup');
  const published = new URL(LOCKUP_URL).pathname;
  const file = readFileSync(path.resolve(__dirname, '../../site/public', `.${published}`));
  assert.deepEqual([file.readUInt32BE(16), file.readUInt32BE(20)], [480, 142], 'lockup PNG is 480 × 142, drawn at 160 × 47');
});

const SYNC_PATH = path.resolve(__dirname, '../../cloudflare/newsletter-worker/src/resend-sync.js');
const WEBHOOK_SECRET = `whsec_${Buffer.from('a webhook signing key for tests').toString('base64')}`;

function signedWebhook(event, { secret = WEBHOOK_SECRET, timestamp = Math.floor(Date.now() / 1000) } = {}) {
  const crypto = require('node:crypto');
  const body = JSON.stringify(event);
  const id = 'msg_test';
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const signature = crypto.createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64');
  return new Request('https://newsletter.test/resend-webhook', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'svix-id': id,
      'svix-timestamp': String(timestamp),
      'svix-signature': `v1,bm90IHRoaXMgb25l v1,${signature}`,
    },
    body,
  });
}

const contactEvent = (type, email, unsubscribed) => ({
  type,
  created_at: '2026-10-17T10:00:00.000Z',
  data: { id: 'contact-1', email, unsubscribed, segment_ids: [] },
});

async function confirmedSubscriber(env, email) {
  const originalFetch = globalThis.fetch;
  let mail;
  globalThis.fetch = async (_url, init) => { mail = JSON.parse(init.body); return new Response('{}'); };
  try {
    await worker.fetch(subscribeRequest({ email }), env);
    const confirmationUrl = mail.text.match(/https:\/\/[^\s]+\/confirm\?token=[A-Za-z0-9_-]{43}/)[0];
    return confirmationUrl;
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test('an unsubscribe or deletion in Resend removes the newsletter record, and only a signed webhook can', async (t) => {
  const env = { ...environment(), RESEND_WEBHOOK_SECRET: WEBHOOK_SECRET };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('{}');
  t.after(() => { globalThis.fetch = originalFetch; });

  for (const [type, unsubscribed] of [['contact.updated', true], ['contact.deleted', false]]) {
    const email = `${type.split('.')[1]}@example.com`;
    await worker.fetch(new Request(await confirmedSubscriber(env, email)), env);
    const record = await env.SUBSCRIBERS.get(`sub:${email}`, { type: 'json' });
    assert.ok(record, 'subscribed before the webhook');

    const forged = signedWebhook(contactEvent(type, email.toUpperCase(), unsubscribed), { secret: `whsec_${Buffer.from('wrong').toString('base64')}` });
    assert.equal((await worker.fetch(forged, env)).status, 401);
    const stale = signedWebhook(contactEvent(type, email, unsubscribed), { timestamp: Math.floor(Date.now() / 1000) - 600 });
    assert.equal((await worker.fetch(stale, env)).status, 401);
    assert.ok(await env.SUBSCRIBERS.get(`sub:${email}`), 'a bad or stale signature removes nothing');

    assert.equal((await worker.fetch(signedWebhook(contactEvent(type, email.toUpperCase(), unsubscribed)), env)).status, 204);
    assert.equal(await env.SUBSCRIBERS.get(`sub:${email}`), null, type);
    assert.equal(await env.SUBSCRIBERS.get(`unsub:${require('node:crypto').createHash('sha256').update(record.unsubscribeToken).digest('hex')}`), null);
  }

  // A contact that is still subscribed keeps its record.
  await worker.fetch(new Request(await confirmedSubscriber(env, 'kept@example.com')), env);
  assert.equal((await worker.fetch(signedWebhook(contactEvent('contact.updated', 'kept@example.com', false)), env)).status, 204);
  assert.ok(await env.SUBSCRIBERS.get('sub:kept@example.com'));
});

test('the Resend webhook fails closed without its signing secret', async () => {
  const env = environment();
  const response = await worker.fetch(signedWebhook(contactEvent('contact.deleted', 'a@example.com', false)), env);
  assert.equal(response.status, 503);
});

test('with a contacts key, confirming joins the Resend segment and leaving removes only segment membership', async (t) => {
  const env = { ...environment(), RESEND_CONTACTS_API_KEY: 're_contacts', RESEND_SEGMENT_ID: 'seg-1' };
  const confirmationUrl = await confirmedSubscriber(env, 'person@example.com');
  const originalFetch = globalThis.fetch;
  const calls = [];
  let createStatus = 200;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), method: init.method, body: init.body ? JSON.parse(init.body) : undefined, headers: init.headers });
    return new Response('{}', { status: String(url).endsWith('/contacts') ? createStatus : 200 });
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  await worker.fetch(new Request(confirmationUrl), env);
  assert.deepEqual(calls.map(({ method, url }) => `${method} ${url}`), ['POST https://api.resend.com/contacts']);
  assert.deepEqual(calls[0].body, { email: 'person@example.com', segments: [{ id: 'seg-1' }] });
  assert.equal(calls[0].headers.Authorization, 'Bearer re_contacts', 'contacts use their own key, not the send-only key');
  assert.ok(calls[0].headers['User-Agent']);

  const record = await env.SUBSCRIBERS.get('sub:person@example.com', { type: 'json' });
  calls.length = 0;
  await worker.fetch(new Request(`https://newsletter.test/unsubscribe?token=${record.unsubscribeToken}`), env);
  assert.deepEqual(calls.map(({ method, url }) => `${method} ${url}`),
    ['DELETE https://api.resend.com/contacts/person%40example.com/segments/seg-1']);
  assert.ok(!calls.some(({ body }) => body && 'unsubscribed' in body), 'never touches the account-wide unsubscribe flag');

  // An address Resend already knows (another brand's contact) is added to the
  // segment as it is, and a failing Resend never undoes the confirmation.
  createStatus = 409;
  calls.length = 0;
  await worker.fetch(new Request(await confirmedSubscriber(env, 'known@example.com')), env);
  assert.deepEqual(calls.map(({ method, url }) => `${method} ${url}`), [
    'POST https://api.resend.com/contacts',
    'POST https://api.resend.com/contacts/known%40example.com/segments/seg-1',
  ]);
  globalThis.fetch = async () => { throw new TypeError('network down'); };
  const errors = [];
  const originalError = console.error;
  console.error = (line) => errors.push(line);
  t.after(() => { console.error = originalError; });
  const late = await confirmedSubscriber(env, 'offline@example.com');
  globalThis.fetch = async () => { throw new TypeError('network down'); };
  assert.equal((await worker.fetch(new Request(late), env)).status, 200);
  assert.ok(await env.SUBSCRIBERS.get('sub:offline@example.com'));
  assert.ok(errors.some((line) => line.includes('resend-sync-add-failed') && !line.includes('offline@example.com')));
});

test('without a contacts key the Worker makes no Resend contact calls', async (t) => {
  const env = environment();
  const confirmationUrl = await confirmedSubscriber(env, 'person@example.com');
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return new Response('{}'); };
  t.after(() => { globalThis.fetch = originalFetch; });
  await worker.fetch(new Request(confirmationUrl), env);
  const record = await env.SUBSCRIBERS.get('sub:person@example.com', { type: 'json' });
  await worker.fetch(new Request(`https://newsletter.test/unsubscribe?token=${record.unsubscribeToken}`), env);
  assert.equal(calls, 0);
});

test('only an unsubscribe or a deletion in Resend removes a subscriber', async () => {
  const { addressToRemove } = await import(pathToFileURL(SYNC_PATH));
  assert.equal(addressToRemove(contactEvent('contact.created', 'a@example.com', false)), null);
  assert.equal(addressToRemove({ type: 'contact.updated', data: {} }), null);
  assert.equal(addressToRemove(contactEvent('contact.updated', ' A@Example.com ', true)), 'a@example.com');
});

test('the Blanc Mail waitlist is never synced to Resend', async (t) => {
  const env = { ...environment(), RESEND_CONTACTS_API_KEY: 're_contacts', RESEND_SEGMENT_ID: 'seg-1' };
  const originalFetch = globalThis.fetch;
  let mail;
  globalThis.fetch = async (_url, init) => { mail = JSON.parse(init.body); return new Response('{}'); };
  t.after(() => { globalThis.fetch = originalFetch; });
  await worker.fetch(new Request('https://newsletter.test/mail-waitlist', {
    method: 'POST',
    headers: { Origin: 'https://blanc.day', 'CF-Connecting-IP': '203.0.113.20', 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'waiting@example.com' }),
  }), env);
  const confirmationUrl = mail.text.match(/https:\/\/[^\s]+\/mail-waitlist\/confirm\?token=[A-Za-z0-9_-]{43}/)[0];
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return new Response('{}'); };
  await worker.fetch(new Request(confirmationUrl), env);
  assert.ok(await env.SUBSCRIBERS.get('mailwait:waiting@example.com'));
  assert.equal(calls, 0);
});
