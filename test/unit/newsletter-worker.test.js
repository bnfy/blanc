'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const WORKER_PATH = path.resolve(__dirname, '../../cloudflare/newsletter-worker/src/index.js');
const DEPLOY_PATH = path.resolve(__dirname, '../../cloudflare/newsletter-worker/deploy.mjs');
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

const environment = () => ({
  SUBSCRIBERS: new FakeKV(),
  NEWSLETTER_TOKEN_SECRET: 'token-secret',
  RESEND_API_KEY: 're_test',
  NEWSLETTER_FROM: 'Blanc <release-notes@updates.blancbrowser.com>',
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
