// Shared pieces of the installed-public capture scripts
// (scripts/capture-installed-*.mjs): the installed-app version check, the
// disposable profile's synthetic fixtures, polling, and output handling.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

export const run = promisify(execFile);

/** The installed Blanc.app, asserted to be the expected public version. */
export async function installedBlanc(expectedVersion) {
  if (process.platform !== 'darwin') throw new Error('The installed-public capture helpers currently require macOS.');
  const executablePath = path.resolve(process.env.BLANC_PACKAGED_EXECUTABLE || '/Applications/Blanc.app/Contents/MacOS/Blanc');
  const appPath = executablePath.slice(0, executablePath.lastIndexOf('.app/') + 4);
  assert.ok(fs.existsSync(executablePath) && appPath.endsWith('.app'), 'An installed Blanc.app executable is required.');
  const plist = path.join(appPath, 'Contents/Info.plist');
  const read = async (key) => (await run('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, plist])).stdout.trim();
  const version = await read('CFBundleShortVersionString');
  const build = await read('CFBundleVersion');
  assert.equal(version, expectedVersion, `Installed Blanc must be ${expectedVersion}; found ${version}`);
  return { executablePath, appPath, version, build };
}

/**
 * Where captures go. Captures carry a live clock and date, so a rerun never
 * reproduces the bytes a capture ledger pins: write to a fresh temporary
 * directory unless BLANC_CAPTURE_OUTPUT_DIR asks for a specific one (for
 * example site/public/feature-captures, after the owner approves new images).
 */
export function captureOutputDirectory(label) {
  const directory = process.env.BLANC_CAPTURE_OUTPUT_DIR
    ? path.resolve(process.env.BLANC_CAPTURE_OUTPUT_DIR)
    : fs.mkdtempSync(path.join(os.tmpdir(), `blanc-${label}-captures-`));
  fs.mkdirSync(directory, { recursive: true });
  return directory;
}

export const writeProfileJson = (profile, name, value) =>
  fs.writeFileSync(path.join(profile, `${name}.json`), JSON.stringify(value, null, 2));

/**
 * Synthetic Start Page data: the first `bookmarked` favorites as Favorites,
 * a few visits to every favorite (most visited first), and a weekly
 * blocked-request total of 328.
 */
export function seedStartPageFixtures(profile, { favorites, bookmarked = favorites.length, now = Date.now() }) {
  writeProfileJson(profile, 'bookmarks', {
    items: favorites.slice(0, bookmarked).map(([id, url, title], index) => ({
      id: `capture-${id}`, url, title, favicon: null,
      addedAt: now - ((index + 1) * 60_000), updatedAt: now - ((index + 1) * 60_000), folder: null,
    })),
    tombstones: [],
  });
  writeProfileJson(profile, 'history', {
    entries: favorites.flatMap(([, url, title], siteIndex) =>
      Array.from({ length: favorites.length - siteIndex }, (_, visitIndex) => ({
        url, title, visitedAt: now - ((siteIndex * 10 + visitIndex) * 60_000),
      }))),
    siteIcons: [],
  });
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const days = [148, 180, 0, 0, 0, 0, 0];
  writeProfileJson(profile, 'adblock-stats', { weekStart: monday.getTime(), blocked: days.reduce((sum, value) => sum + value, 0), days });
}

export async function poll(read, accept, label, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let value;
  while (Date.now() < deadline) {
    value = await read();
    if (accept(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`${label}; last observation: ${String(value)}`);
}

export const settle = (ms = 700) => new Promise((resolve) => setTimeout(resolve, ms));
export const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
