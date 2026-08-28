'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const WORKER_PATH = path.join(__dirname, '../../cloudflare/ping-worker/src/index.js');
let worker;
test.before(async () => {
  worker = (await import(pathToFileURL(WORKER_PATH))).default;
});

function fakeKV() {
  const map = new Map();
  return {
    map,
    async get(key) { return map.has(key) ? map.get(key) : null; },
    async put(key, value) { map.set(key, String(value)); },
  };
}

async function download({ url, apiKey }) {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (target, init = {}) => {
    const href = String(target);
    calls.push({ href, init });
    if (href.startsWith('https://api.github.com/')) {
      return Response.json({
        assets: [{ name: 'Blanc-Setup-1.9.1.exe', browser_download_url: 'https://downloads.test/blanc.exe' }],
      });
    }
    return new Response(null, { status: 202 });
  };

  const waited = [];
  try {
    const response = await worker.fetch(
      new Request(url),
      { PINGS: fakeKV(), OPENAI_CONVERSIONS_API_KEY: apiKey },
      { waitUntil(promise) { waited.push(promise); } }
    );
    await Promise.all(waited);
    return { response, calls };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test('a consent-forwarded oppref queues one privacy-bounded OpenAI conversion', async () => {
  const { response, calls } = await download({
    url: 'https://blancbrowser.com/dl/win?oppref=opaque-click-reference',
    apiKey: 'test-api-key',
  });

  assert.equal(response.status, 302);
  assert.equal(response.headers.get('Location'), 'https://downloads.test/blanc.exe');

  const call = calls.find(({ href }) => href.startsWith('https://bzr.openai.com/v1/events?pid='));
  assert.ok(call, 'the Conversions API request is queued');
  assert.equal(call.init.headers.Authorization, 'Bearer test-api-key');
  const body = JSON.parse(call.init.body);
  assert.equal(body.validate_only, false);
  assert.equal(body.events.length, 1);
  const event = body.events[0];
  assert.equal(event.custom_event_name, 'blanc_download');
  assert.equal(event.oppref, 'opaque-click-reference');
  assert.equal(event.source_url, 'https://blancbrowser.com/dl/win');
  assert.equal(event.opt_out, true);
  assert.deepEqual(event.data, { type: 'custom', platform: 'win' });
  assert.equal('user' in event, false);
});

test('missing consent attribution or a missing credential sends no conversion', async () => {
  const noReference = await download({
    url: 'https://blancbrowser.com/dl/win',
    apiKey: 'test-api-key',
  });
  const noCredential = await download({
    url: 'https://blancbrowser.com/dl/win?oppref=opaque-click-reference',
  });
  for (const result of [noReference, noCredential]) {
    assert.equal(
      result.calls.some(({ href }) => href.startsWith('https://bzr.openai.com/')),
      false
    );
  }
});
