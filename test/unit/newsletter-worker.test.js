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
      Origin: 'https://blancbrowser.com',
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
      Origin: 'https://blancbrowser.com',
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
      Origin: 'https://blancbrowser.com',
      'CF-Connecting-IP': '203.0.113.12',
      'Content-Type': 'application/x-www-form-urlencoded',
      ...headers,
    },
    body: new URLSearchParams(body),
  });
}

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
      Origin: 'https://blancbrowser.com',
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
