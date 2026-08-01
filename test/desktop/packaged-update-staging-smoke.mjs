import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { _electron } from 'playwright';
import { inspectUpdateMetadata } from '../../scripts/prepare-staging-update-feed.mjs';

if (process.platform !== 'darwin') {
  throw new Error('the first N-1 staging update smoke targets signed Squirrel.Mac packages');
}

const sourceApp = process.env.BLANC_N_MINUS_ONE_APP;
const feedDir = process.env.BLANC_STAGING_UPDATE_FEED;
for (const [name, value] of [
  ['BLANC_N_MINUS_ONE_APP', sourceApp],
  ['BLANC_STAGING_UPDATE_FEED', feedDir],
]) {
  if (!value) throw new Error(`${name} is required`);
}
if (!fs.statSync(sourceApp, { throwIfNoEntry: false })?.isDirectory()) {
  throw new Error(`N-1 app bundle does not exist: ${sourceApp}`);
}
if (!fs.statSync(feedDir, { throwIfNoEntry: false })?.isDirectory()) {
  throw new Error(`staging feed does not exist: ${feedDir}`);
}

const metadataPath = path.join(feedDir, 'staging-mac.yml');
const metadata = inspectUpdateMetadata(fs.readFileSync(metadataPath, 'utf8'));
const expectedVersion = process.env.BLANC_EXPECTED_UPDATE_VERSION || metadata.version;
assert.equal(metadata.version, expectedVersion, 'staging metadata version mismatch');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-n-minus-one-update-'));
const appPath = path.join(tempDir, 'Blanc.app');
const executablePath = path.join(appPath, 'Contents', 'MacOS', 'Blanc');
const userDataDir = path.join(tempDir, 'profile');
const statusFile = path.join(tempDir, 'updater-status.json');
let electronApp = null;
let server = null;

const appVersion = () => execFileSync(
  '/usr/bin/plutil',
  ['-extract', 'CFBundleShortVersionString', 'raw', path.join(appPath, 'Contents', 'Info.plist')],
  { encoding: 'utf8' }
).trim();

const waitFor = async (read, predicate, message, timeoutMs = 180_000) => {
  const deadline = Date.now() + timeoutMs;
  let value;
  while (Date.now() < deadline) {
    value = await read();
    if (predicate(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.fail(`${message}; last value: ${JSON.stringify(value)}`);
};

function serveFeed(directory) {
  const instance = http.createServer((request, response) => {
    let name;
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      name = pathname.slice(1);
    } catch {
      response.writeHead(400).end();
      return;
    }
    if (!name || path.basename(name) !== name) {
      response.writeHead(404).end();
      return;
    }
    const filePath = path.join(directory, name);
    const stat = fs.statSync(filePath, { throwIfNoEntry: false });
    if (!stat?.isFile()) {
      response.writeHead(404).end();
      return;
    }

    const headers = {
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store',
      'Content-Type': name.endsWith('.yml') ? 'text/yaml' : 'application/octet-stream',
    };
    const range = request.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
    let start = 0;
    let end = stat.size - 1;
    let status = 200;
    if (range) {
      start = Number(range[1]);
      end = range[2] ? Math.min(Number(range[2]), end) : end;
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end) {
        response.writeHead(416, { 'Content-Range': `bytes */${stat.size}` }).end();
        return;
      }
      status = 206;
      headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
    }
    headers['Content-Length'] = String(end - start + 1);
    response.writeHead(status, headers);
    if (request.method === 'HEAD') {
      response.end();
      return;
    }
    fs.createReadStream(filePath, { start, end }).pipe(response);
  });
  return new Promise((resolve, reject) => {
    instance.once('error', reject);
    instance.listen(0, '127.0.0.1', () => resolve(instance));
  });
}

try {
  execFileSync('/usr/bin/ditto', [path.resolve(sourceApp), appPath]);
  fs.mkdirSync(userDataDir, { recursive: true });
  const oldVersion = appVersion();
  assert.notEqual(oldVersion, expectedVersion, 'N-1 app already has the feed version');

  server = await serveFeed(path.resolve(feedDir));
  const address = server.address();
  assert.equal(typeof address, 'object');
  const feedUrl = `http://127.0.0.1:${address.port}/`;

  electronApp = await _electron.launch({
    executablePath,
    args: [`--user-data-dir=${userDataDir}`],
    env: {
      ...process.env,
      BLANC_TEST: '0',
      BLANC_UPDATE_CHANNEL: 'staging',
      BLANC_UPDATE_STAGING_URL: feedUrl,
      BLANC_UPDATE_STAGING_ALLOW_HTTP: '1',
      BLANC_UPDATE_STAGING_AUTO_INSTALL: '1',
      BLANC_UPDATE_STAGING_STATUS_FILE: statusFile,
    },
  });
  await electronApp.firstWindow();
  const processExit = new Promise((resolve) => electronApp.process().once('exit', resolve));

  await waitFor(
    () => fs.existsSync(statusFile)
      ? JSON.parse(fs.readFileSync(statusFile, 'utf8'))
      : null,
    (status) => {
      if (status?.phase === 'error') throw new Error(status.error);
      return status?.phase === 'installing' && status.updateVersion === expectedVersion;
    },
    'N-1 app did not download the staged update'
  );
  await Promise.race([
    processExit,
    new Promise((_, reject) => setTimeout(
      () => reject(new Error('N-1 app did not exit for update installation')),
      60_000
    )),
  ]);
  electronApp = null;

  await waitFor(
    appVersion,
    (version) => version === expectedVersion,
    'the staged update did not replace the app bundle',
    60_000
  );

  // Launch the replaced bundle once more and ask Electron itself for the
  // running version. An unsupported channel disables the background updater,
  // keeping this verification isolated from the production GitHub feed.
  electronApp = await _electron.launch({
    executablePath,
    args: [`--user-data-dir=${userDataDir}`],
    env: { ...process.env, BLANC_TEST: '0', BLANC_UPDATE_CHANNEL: 'smoke-complete' },
  });
  await electronApp.firstWindow();
  assert.equal(
    await electronApp.evaluate(({ app }) => app.getVersion()),
    expectedVersion,
    'relaunch did not execute the staged version'
  );
  console.log(`packaged-update-staging-smoke OK: ${oldVersion} -> ${expectedVersion}`);
} finally {
  if (electronApp) await electronApp.close().catch(() => {});
  if (server) await new Promise((resolve) => server.close(resolve));
  fs.rmSync(tempDir, { recursive: true, force: true });
}
