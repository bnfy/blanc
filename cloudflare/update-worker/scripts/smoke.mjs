#!/usr/bin/env node
// Asks a deployed update Worker one update check, as the Windows beta's
// updater would, and checks its CUP signature against a public key with
// OpenSSL (W3 Task C1). Prints only pass/fail facts.
//
//   node scripts/smoke.mjs BASE_URL [PUBLIC_KEY_DER]
//   (default key: chromium/windows/keys/cup-public.der)
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const OPENSSL = '/opt/homebrew/opt/openssl@3/bin/openssl';
const sha = bytes => crypto.createHash('sha256').update(bytes).digest();
export const BROWSER_APP_ID = '{459fd3cf-456c-4a06-8b37-2084cf64ddce}';

export async function smokeCheck(base, spkiDerPath, {fetchImpl = fetch, version = '0.0.0.1'} = {}) {
  const body = JSON.stringify({request: {protocol: '4.0', apps: [{appid: BROWSER_APP_ID, version, updatecheck: {}}]}});
  const cup2key = `ML-DSA-44-1:${crypto.randomBytes(32).toString('base64url')}`;
  const res = await fetchImpl(`${base.replace(/\/$/, '')}/update/win/v4?cup2key=${cup2key}&cup2hreq=${sha(body).toString('hex')}`,
    {method: 'POST', body, headers: {'content-type': 'application/json'}});
  const text = await res.text();
  const [sigHex = '', hashHex = ''] = (res.headers.get('x-cup-server-proof') ?? '').split(':');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-update-smoke-'));
  try {
    fs.writeFileSync(path.join(dir, 'msg'), sha(Buffer.concat([sha(body), sha(Buffer.from(text)), Buffer.from(cup2key)])));
    fs.writeFileSync(path.join(dir, 'sig'), Buffer.from(sigHex, 'hex'));
    const verified = spawnSync(OPENSSL, ['pkeyutl', '-verify', '-pubin', '-keyform', 'DER', '-inkey', spkiDerPath,
      '-rawin', '-in', path.join(dir, 'msg'), '-sigfile', path.join(dir, 'sig')]).status === 0;
    let app = null;
    try { app = JSON.parse(text.slice(4)).response.apps[0]; } catch {}
    return {status: res.status, requestHashEchoed: hashHex === sha(body).toString('hex'), signatureVerifies: verified,
      safePrefix: text.startsWith(")]}'"), updatecheck: app?.updatecheck?.status ?? null, nextversion: app?.updatecheck?.nextversion ?? null};
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const [base, keyPath] = process.argv.slice(2);
  if (!base) { console.error('usage: smoke.mjs BASE_URL [PUBLIC_KEY_DER]'); process.exit(2); }
  const key = keyPath ?? fileURLToPath(new URL('../../../chromium/windows/keys/cup-public.der', import.meta.url));
  const result = await smokeCheck(base, key);
  const pass = result.status === 200 && result.requestHashEchoed && result.signatureVerifies && result.safePrefix && result.updatecheck !== null;
  console.log(JSON.stringify({pass, ...result}));
  if (!pass) process.exitCode = 1;
}
