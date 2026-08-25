'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');

async function loadGate() {
  return import('../../scripts/onepassword-live-gate-server.mjs');
}

function request(server, { hostname = 'exact.localhost', method = 'GET', path = '/login', body = '' } = {}) {
  const port = server.address().port;
  return new Promise((resolve, reject) => {
    const outgoing = http.request({
      hostname: '127.0.0.1',
      port,
      method,
      path,
      headers: { Host: `${hostname}:${port}` },
    }, (incoming) => {
      const chunks = [];
      incoming.on('data', (chunk) => chunks.push(chunk));
      incoming.on('end', () => resolve({
        statusCode: incoming.statusCode,
        headers: incoming.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      }));
    });
    outgoing.on('error', reject);
    if (body) outgoing.write(body);
    outgoing.end();
  });
}

test('live gate serves an inert login form only on loopback test hosts', async (t) => {
  const { createGateServer } = await loadGate();
  const server = createGateServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const response = await request(server);
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.match(response.headers['content-security-policy'], /form-action 'none'/);
  assert.match(response.headers['content-security-policy'], /connect-src 'none'/);
  assert.match(response.body, /autocomplete="username"/);
  assert.match(response.body, /autocomplete="current-password"/);
  assert.match(response.body, /event\.preventDefault\(\)/);
  assert.match(response.body, /never logs requests/);

  const rejected = await request(server, { hostname: 'example.com' });
  assert.equal(rejected.statusCode, 421);
});

test('live gate signup fixture is unambiguously new-password-only', async () => {
  const { buildPage } = await loadGate();
  const page = buildPage({ variant: 'signup', host: 'exact.localhost:48765' });
  assert.equal((page.match(/autocomplete="new-password"/g) ?? []).length, 2);
  assert.doesNotMatch(page, /<input[^>]+autocomplete="current-password"/);
  assert.match(page, /Create test account/);
});

test('live gate rejects submission methods without reflecting field values', async (t) => {
  const { createGateServer } = await loadGate();
  const server = createGateServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const secret = 'must-not-appear';
  const response = await request(server, { method: 'POST', body: secret });
  assert.equal(response.statusCode, 405);
  assert.doesNotMatch(response.body, new RegExp(secret));
});
