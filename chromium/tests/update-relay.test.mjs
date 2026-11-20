// W3 Task E1's staging gate: Chromium's test updater refuses any update
// address but localhost, so a runner-local relay carries its update checks to
// the staging server. The relay must pass both directions through unchanged
// (the CUP signature covers the answer) and carry nothing else.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {startRelay} from './lib/update-relay.mjs';

async function fakeUpstream(handler) {
  const seen = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => { seen.push({method: req.method, url: req.url, headers: req.headers, body: Buffer.concat(chunks)}); handler(req, res); });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return {seen, origin: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(r => server.close(r))};
}

test('an update check goes to staging and its signed answer comes back byte for byte', async () => {
  const answer = Buffer.from(")]}'\n{\"response\":{\"protocol\":\"4.0\"}}");
  const upstream = await fakeUpstream((req, res) => {
    res.writeHead(200, {'content-type': 'application/json', 'x-cup-server-proof': 'ab12:cd34', etag: 'W/"x"', 'set-cookie': 'no=1'});
    res.end(answer);
  });
  const relay = await startRelay({upstream: upstream.origin});
  try {
    const body = '{"request":{"protocol":"4.0"}}';
    const res = await fetch(`${relay.url}/update/win/v4?cup2key=16:abc&cup2hreq=def`, {method: 'POST', body,
      headers: {'content-type': 'application/json', 'x-goog-update-appid': '{459fd3cf}', cookie: 'secret=1'}});
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('x-cup-server-proof'), 'ab12:cd34');
    assert.equal(res.headers.get('set-cookie'), null);
    assert.deepEqual(Buffer.from(await res.arrayBuffer()), answer);
    assert.equal(upstream.seen.length, 1);
    assert.equal(upstream.seen[0].method, 'POST');
    assert.equal(upstream.seen[0].url, '/update/win/v4?cup2key=16:abc&cup2hreq=def');
    assert.equal(upstream.seen[0].body.toString(), body);
    assert.equal(upstream.seen[0].headers['x-goog-update-appid'], '{459fd3cf}');
    assert.equal(upstream.seen[0].headers.cookie, undefined);
  } finally { await relay.close(); await upstream.close(); }
});

test('anything but an update check is refused and never reaches staging', async () => {
  const upstream = await fakeUpstream((req, res) => res.end('upstream'));
  const relay = await startRelay({upstream: upstream.origin});
  try {
    for (const [method, pathName] of [['GET', '/update/win/v4'], ['POST', '/update/win/pkg/aa.crx3'], ['POST', '/other']]) {
      const res = await fetch(`${relay.url}${pathName}`, {method, body: method === 'POST' ? 'x' : undefined});
      assert.equal(res.status, 404, `${method} ${pathName}`);
      await res.arrayBuffer();
    }
    assert.equal(upstream.seen.length, 0);
  } finally { await relay.close(); await upstream.close(); }
});

test('the relay listens on localhost only', async () => {
  const upstream = await fakeUpstream((req, res) => res.end());
  const relay = await startRelay({upstream: upstream.origin});
  try { assert.match(relay.url, /^http:\/\/127\.0\.0\.1:\d+$/); } finally { await relay.close(); await upstream.close(); }
});
