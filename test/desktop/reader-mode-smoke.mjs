import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { collectDriverResult } from './support/smoke-driver-result.mjs';
const require = createRequire(import.meta.url);
const electron = require('electron');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-reader-'));
const userData = path.join(root, 'profile');
fs.mkdirSync(userData + '-Dev');
fs.writeFileSync(path.join(userData + '-Dev', 'settings.json'), JSON.stringify({ onboardingVersion: 1, usagePing: false, searchSuggestions: false }));
const paragraphs = Array.from({ length: 24 }, (_, i) => `<p>Reader fixture paragraph ${i}. ${'An article about quiet, comfortable reading with clear typography and useful context. '.repeat(8)}</p>`).join('');
const html = `<!doctype html><title>Reader fixture</title><article><h1>Reader fixture</h1>${paragraphs}<p><a id="reader-test-link" href="/reader-click-target">Follow this article link</a></p><p hidden>HIDDEN_SECRET</p><p style="display:none">HIDDEN_SECRET</p><table><tr><th>Example</th><td>Value</td></tr></table><figure><img src="/image.png" alt="Article image"><figcaption>Figure caption</figcaption></figure><a href="javascript:alert(1)">unsafe link</a><a href="data:text/html,unsafe">data link text</a><a href="vbscript:unsafe">vbscript link text</a><iframe srcdoc="unsafe"></iframe></article>`;
const server = http.createServer((_req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end(html); });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const { ELECTRON_RUN_AS_NODE: ignored, ...env } = process.env;
const result = path.join(root, 'result.json');
const child = spawn(electron, ['-r', path.resolve('test/desktop/reader-mode-driver.cjs'), path.resolve('.'), `--user-data-dir=${userData}`], {
  env: { ...env, BLANC_TEST: '1', READER_SMOKE_BASE: `http://127.0.0.1:${server.address().port}`, READER_SMOKE_RESULT: result, READER_SMOKE_SCREENSHOT: path.join(root, 'reader.png') },
  detached: process.platform !== 'win32',
  stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = '';
child.stdout.on('data', data => { logs = (logs + data).slice(-12000); });
child.stderr.on('data', data => { logs = (logs + data).slice(-12000); });
try {
  const report = await collectDriverResult({ child, resultFile: result, expectedChecks: 12,
    stop: () => {
      if (process.platform === 'win32') child.kill();
      else process.kill(-child.pid, 'SIGKILL');
    },
  });
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.error(error.message);
  console.error(logs);
  process.exitCode = 1;
} finally {
  server.closeAllConnections();
  server.close();
}
