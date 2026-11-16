// The emulator checks' sync peer runs on the test's thread, which adb and sleep() block for seconds.
// The test Worker closes an idle connection after five, so the peer's next request can land on a
// socket the server already closed (about half the time past six seconds). Chromium retries a
// request on a reused socket that fails before any answer; the peer's stand-in host must do the
// same, or a check fails with "offline" by chance.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createRequire} from 'node:module';

const {hostFetch} = createRequire(import.meta.url)('../tests/android/support/sync-peer.cjs');
const ask = (url, method) => new Promise(resolve => hostFetch(url, method, '{}', null, (error, status) => resolve(error ?? status)));

// Answers each connection's first request and drops the connection on any later one, as a server
// does when it closes an idle socket just as the client reuses it.
async function closingServer() {
  const served = new WeakSet();
  const server = {dropped: 0};
  const http1 = http.createServer((request, response) => {
    if (served.has(request.socket)) { server.dropped++; request.socket.destroy(); return; }
    served.add(request.socket);
    response.writeHead(204).end();
  });
  await new Promise(resolve => http1.listen(0, '127.0.0.1', resolve));
  return Object.assign(server, {url: `http://127.0.0.1:${http1.address().port}/`,
    close: () => { http1.closeAllConnections(); http1.close(); }});
}

test('a request on a reused connection the server dropped is sent again on a new one', async () => {
  const server = await closingServer();
  try {
    // fetch doesn't reuse a connection every time; a few requests are sure to.
    for (let i = 0; i < 4; i++) assert.equal(await ask(server.url, 'POST'), 204, `request ${i + 1}`);
    assert.ok(server.dropped > 0, 'no request landed on a reused connection');
  } finally {
    server.close();
  }
});

test('a server that is down is still reported as a failure', async () => {
  const server = await closingServer();
  server.close();
  assert.match(String(await ask(server.url, 'GET')), /fetch failed/);
});
