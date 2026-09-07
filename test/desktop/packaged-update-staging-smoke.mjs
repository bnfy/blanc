import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { inspectUpdateMetadata } from '../../scripts/prepare-staging-update-feed.mjs';
import { launchPackagedOverCdp } from './support/packaged-cdp.mjs';

if (process.platform !== 'darwin') {
  throw new Error('the initial N-1 staging update smoke targets signed Squirrel.Mac packages');
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
let packagedApp = null;
let server = null;

const appVersion = () => execFileSync('/usr/bin/plutil', [
  '-extract', 'CFBundleShortVersionString', 'raw', path.join(appPath, 'Contents', 'Info.plist'),
], { encoding: 'utf8' }).trim();

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

const runningVersion = async (app) => {
  const page = app.pages().find((candidate) => candidate.url().startsWith('blanc://newtab'));
  if (!page) return null;
  try {
    return await page.evaluate(() => window.bowserPages?.appVersion?.() ?? null);
  } catch (error) {
    if (/Target page, context or browser has been closed/.test(error?.message ?? '')) return null;
    throw error;
  }
};

function installedFingerprint() {
  try {
    const version = appVersion();
    execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', appPath], {
      stdio: 'ignore',
    });
    const stat = fs.statSync(appPath);
    return `${version}:${stat.ino}:${stat.mtimeMs}`;
  } catch {
    return null;
  }
}

function cleanupTempDir() {
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch (error) {
    if (error?.code !== 'EACCES' || !fs.existsSync(appPath)) throw error;
    // Squirrel.Mac's privileged ShipIt service installs the replacement as
    // root:wheel, matching a real /Applications update, and may mark the app
    // non-renamable by the invoking user. Remove the isolated user profile and
    // status while retaining that bundle in place so cleanup cannot mask a
    // successful install/relaunch result or require a privilege workaround.
    for (const name of fs.readdirSync(tempDir)) {
      if (name !== path.basename(appPath)) {
        fs.rmSync(path.join(tempDir, name), { recursive: true, force: true });
      }
    }
    console.warn(`updated root-owned app retained for inspection: ${appPath}`);
  }
}

function serveFeed(directory) {
  const instance = http.createServer((request, response) => {
    let name;
    try {
      name = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).slice(1);
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
    if (request.method === 'HEAD') response.end();
    else fs.createReadStream(filePath, { start, end }).pipe(response);
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
  const feedUrl = `http://127.0.0.1:${server.address().port}/`;

  packagedApp = await launchPackagedOverCdp({
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
  const processExit = new Promise((resolve) => packagedApp.process.once(
    'exit',
    (code, signal) => resolve({ code, signal }),
  ));
  await waitFor(
    () => fs.existsSync(statusFile) ? JSON.parse(fs.readFileSync(statusFile, 'utf8')) : null,
    (status) => {
      if (status?.phase === 'error') throw new Error(status.error);
      return status?.phase === 'installing' && status.updateVersion === expectedVersion;
    },
    'N-1 app did not download the staged update',
  );
  const exit = await Promise.race([
    processExit,
    new Promise((_, reject) => setTimeout(() => reject(new Error('N-1 app did not exit for installation')), 60_000)),
  ]);
  assert.equal(exit.code, 0, `N-1 app exited abnormally for installation (${exit.code ?? exit.signal})`);
  packagedApp = null;
  let previousFingerprint = null;
  let stableChecks = 0;
  await waitFor(installedFingerprint, (fingerprint) => {
    if (!fingerprint?.startsWith(`${expectedVersion}:`)) {
      previousFingerprint = null;
      stableChecks = 0;
      return false;
    }
    if (fingerprint === previousFingerprint) stableChecks += 1;
    else {
      previousFingerprint = fingerprint;
      stableChecks = 1;
    }
    return stableChecks >= 4;
  }, 'the staged update did not finish replacing and signing the app bundle', 60_000);

  packagedApp = await launchPackagedOverCdp({
    executablePath,
    args: [`--user-data-dir=${userDataDir}`],
    env: { ...process.env, BLANC_TEST: '0', BLANC_UPDATE_CHANNEL: 'smoke-complete' },
  });
  const relaunchExit = new Promise((_, reject) => packagedApp.process.once(
    'exit',
    (code, signal) => reject(new Error(
      `updated app exited before version confirmation (${code ?? signal})\n${packagedApp.output()}`,
    )),
  ));
  await Promise.race([
    waitFor(
      () => runningVersion(packagedApp),
      (version) => version === expectedVersion,
      'the updated app did not relaunch with the staged version',
      30_000,
    ),
    relaunchExit,
  ]);
  console.log(`packaged-update-staging-smoke OK: ${oldVersion} -> ${expectedVersion}`);
} finally {
  if (packagedApp) await packagedApp.close().catch(() => {});
  if (server) await new Promise((resolve) => server.close(resolve));
  cleanupTempDir();
}
