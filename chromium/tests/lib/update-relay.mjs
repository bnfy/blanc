#!/usr/bin/env node
// W3 Task E1's staging gate on a runner. Chromium's test updater crashes on any
// overrides.json update address but localhost (chrome/updater/
// external_constants_override.cc, CheckURL: "to reduce the program's utility as
// a mule"), so the proof points it here and this relay carries update checks,
// and nothing else, to the staging server. Request body and query, and the
// answer's status, CUP proof and body, pass through unchanged: the updater
// still verifies the staging server's signature with Blanc's key. Packages are
// not relayed; the signed answer names them on the staging server itself.
//
//   node chromium/tests/lib/update-relay.mjs https://….workers.dev PORT_FILE
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const CHECK_PATH = '/update/win/v4';
const REQUEST_HEADERS = /^(content-type|x-goog-update-[a-z-]+)$/;
const RESPONSE_HEADERS = ['content-type', 'x-cup-server-proof', 'etag', 'x-retry-after', 'x-daystart', 'x-daynum'];

export async function startRelay({upstream, port = 0}) {
  const server = http.createServer((req, res) => {
    const target = new URL(req.url, 'http://relay');
    if (req.method !== 'POST' || target.pathname !== CHECK_PATH) { res.writeHead(404).end(); req.resume(); return; }
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', async () => {
      try {
        const headers = Object.fromEntries(Object.entries(req.headers).filter(([name]) => REQUEST_HEADERS.test(name)));
        const answer = await fetch(`${upstream}${target.pathname}${target.search}`, {method: 'POST', headers, body: Buffer.concat(chunks), redirect: 'error'});
        const body = Buffer.from(await answer.arrayBuffer());
        const out = {};
        for (const name of RESPONSE_HEADERS) { const value = answer.headers.get(name); if (value !== null) out[name] = value; }
        res.writeHead(answer.status, out).end(body);
      } catch {
        res.writeHead(502).end();
      }
    });
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  return {url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(resolve => server.close(resolve))};
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const [upstream, portFile] = process.argv.slice(2);
  if (!/^https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev$/.test(upstream ?? '') || !portFile) {
    console.error('usage: update-relay.mjs https://….workers.dev PORT_FILE'); process.exit(2);
  }
  const relay = await startRelay({upstream});
  fs.writeFileSync(portFile, new URL(relay.url).port);
}
