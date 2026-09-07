'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

async function loadGate() {
  return import('../../scripts/onepassword-live-gate-server.mjs');
}

function request(handler, {
  hostname = 'exact.localhost', method = 'GET', path = '/login', body = '',
} = {}) {
  const headers = {};
  let statusCode = null;
  let responseBody = '';
  let resumed = false;
  const incoming = {
    method,
    url: path,
    headers: { host: `${hostname}:48765` },
    body,
    resume() { resumed = true; },
  };
  const outgoing = {
    writeHead(nextStatusCode, nextHeaders) {
      statusCode = nextStatusCode;
      for (const [name, value] of Object.entries(nextHeaders)) {
        headers[name.toLowerCase()] = value;
      }
    },
    end(payload) {
      responseBody = payload ? Buffer.from(payload).toString('utf8') : '';
    },
  };
  handler(incoming, outgoing);
  return { statusCode, headers, body: responseBody, resumed };
}

test('live gate serves an inert login form only on loopback test hosts', async () => {
  const { handleGateRequest } = await loadGate();
  const response = request(handleGateRequest);
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.match(response.headers['content-security-policy'], /form-action 'none'/);
  assert.match(response.headers['content-security-policy'], /connect-src 'none'/);
  assert.match(response.body, /autocomplete="username"/);
  assert.match(response.body, /autocomplete="current-password"/);
  assert.match(response.body, /event\.preventDefault\(\)/);
  assert.match(response.body, /never logs requests/);

  const rejected = request(handleGateRequest, { hostname: 'example.com' });
  assert.equal(rejected.statusCode, 421);
});

test('live gate signup fixture is unambiguously new-password-only', async () => {
  const { buildPage } = await loadGate();
  const page = buildPage({ variant: 'signup', host: 'exact.localhost:48765' });
  assert.equal((page.match(/autocomplete="new-password"/g) ?? []).length, 2);
  assert.doesNotMatch(page, /<input[^>]+autocomplete="current-password"/);
  assert.match(page, /Create test account/);
});

test('live gate rejects submission methods without reflecting field values', async () => {
  const { handleGateRequest } = await loadGate();
  const secret = 'must-not-appear';
  const response = request(handleGateRequest, { method: 'POST', body: secret });
  assert.equal(response.statusCode, 405);
  assert.equal(response.resumed, true);
  assert.doesNotMatch(response.body, new RegExp(secret));
});
