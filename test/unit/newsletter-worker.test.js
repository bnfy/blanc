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
  constructor() { this.values = new Map(); }
  async get(key, options) {
    const value = this.values.get(key) ?? null;
    return options?.type === 'json' && value !== null ? JSON.parse(value) : value;
  }
  async put(key, value) { this.values.set(key, String(value)); }
  async delete(key) { this.values.delete(key); }
  async list({ prefix = '' } = {}) {
    return {
      keys: [...this.values.keys()].filter((name) => name.startsWith(prefix)).map((name) => ({ name })),
      list_complete: true,
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
