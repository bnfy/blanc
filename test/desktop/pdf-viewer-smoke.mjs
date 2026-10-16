import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

// Regression for PDFs that open as an empty viewer: Chromium's PDF viewer
// loads each document into a child frame from its own chrome-extension:
// origin, and Blanc's guards refused it (see pdf-viewer-driver.cjs). Runs once
// per blocker with real blocking on, because uBO also refused the viewer page.
// Run under `xvfb-run -a` on Linux.

const require = createRequire(import.meta.url);
const electron = require('electron');

const repo = path.resolve('.');
const driver = path.join(repo, 'test/desktop/pdf-viewer-driver.cjs');
const PROVIDERS = ['blanc', 'ublock-origin'];
const EXPECTED_CASES = 4;

// A one-page PDF reading "INVOICE".
function onePagePdf() {
  const stream = 'BT /F1 48 Tf 72 700 Td (INVOICE) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets = objects.map((object, index) => {
    const offset = out.length;
    out += `${index + 1} 0 obj\n${object}\nendobj\n`;
    return offset;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) out += `${String(offset).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

const pdf = onePagePdf();
const server = http.createServer((req, res) => {
  if (/^\/invoice\/\d+\/pdf$/.test(req.url)) {
    res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Length': pdf.length });
    res.end(pdf);
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end('<!doctype html><title>invoices</title><p>invoices</p>');
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const { ELECTRON_RUN_AS_NODE: ignored, ...env } = process.env;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function run(provider) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `blanc-pdf-viewer-${provider}-`));
  const userData = path.join(root, 'profile');
  const resultFile = path.join(root, 'result.json');
  fs.mkdirSync(`${userData}-Dev`);
  fs.writeFileSync(path.join(`${userData}-Dev`, 'settings.json'), JSON.stringify({
    onboardingVersion: 1, adblockProvider: provider, adblockEnabled: true,
    usagePing: false, searchSuggestions: false,
  }));
  // BLANC_UBLOCK_TEST keeps real blocking on while the test hook is exposed.
  const child = spawn(electron, ['-r', driver, repo, `--user-data-dir=${userData}`], {
    env: { ...env, BLANC_TEST: '1', BLANC_UBLOCK_TEST: '1',
      PDF_SMOKE_RESULT: resultFile, PDF_SMOKE_BASE: base, PDF_SMOKE_PROVIDER: provider },
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let spawnError = null;
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  child.once('error', (error) => { spawnError = error; output += `${error}\n`; });
  const exited = new Promise((resolve) => child.once('exit', resolve));
  const stop = () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    try {
      if (process.platform === 'win32') child.kill();
      else process.kill(-child.pid, 'SIGKILL');
    } catch {}
  };

  let report = null;
  try {
    const deadline = Date.now() + 240_000;
    while (!fs.existsSync(resultFile)) {
      if (spawnError) throw new Error(`Blanc could not start: ${spawnError.message}`);
      if (child.exitCode !== null || child.signalCode !== null) {
        throw new Error(`Blanc exited (${child.exitCode ?? child.signalCode}) before reporting`);
      }
      if (Date.now() > deadline) throw new Error('timed out waiting for the driver');
      await sleep(250);
    }
    report = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
  } catch (error) {
    console.error(`${provider}: ${error.message}`);
  } finally {
    await Promise.race([exited, sleep(5000)]);
    stop();
    await Promise.race([exited, sleep(2000)]);
  }

  let passed = false;
  if (report) {
    for (const result of report.results) {
      console.log(`${result.shown ? 'ok  ' : 'FAIL'} ${provider}, ${result.name}` +
        (result.shown ? '' : `: ${JSON.stringify(result.seen ?? null)}${result.error ? ` (${result.error})` : ''}`));
    }
    if (report.error) console.error(`${provider} driver error: ${report.error}`);
    if (report.results.length !== EXPECTED_CASES) {
      console.error(`${provider}: ${report.results.length} of ${EXPECTED_CASES} cases ran`);
    }
    passed = !report.error && report.results.length === EXPECTED_CASES
      && report.results.every((result) => result.shown);
  }
  if (!passed) console.error(output.split('\n').slice(-40).join('\n'));
  // Windows can keep a child process's cache file open briefly after Blanc
  // exits. A leftover temporary profile never fails the check.
  try {
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  } catch (error) {
    console.error(`left ${root} behind: ${error.code ?? error.message}`);
  }
  return passed;
}

let passed = true;
try {
  for (const provider of PROVIDERS) passed = (await run(provider)) && passed;
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
if (passed) console.log(`PDFs showed in all ${EXPECTED_CASES} cases with ${PROVIDERS.join(' and ')}`);
process.exitCode = passed ? 0 : 1;
