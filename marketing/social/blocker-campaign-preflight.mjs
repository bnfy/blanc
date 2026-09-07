#!/usr/bin/env node

/**
 * Read-only blocker-campaign capture preflight.
 *
 * This does not launch Blanc, make network requests, render creative, or write
 * files. It proves that the installed packaged app and the local Ghostery
 * matcher align with v1.9.1, verifies the release-pinned EasyList/EasyPrivacy
 * bytes, and checks the exact three synthetic requests used for the eventual
 * clean-profile product capture.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { FiltersEngine, Request } = require('@ghostery/adblocker');

const TAG = 'v1.9.1';
const EXPECTED_VERSION = '1.9.1';
const APP_PLIST = '/Applications/Blanc.app/Contents/Info.plist';
const LISTS = ['easylist.txt', 'easyprivacy.txt'];
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function fail(message) {
  throw new Error(`blocker campaign preflight: ${message}`);
}

function gitShow(path) {
  return execFileSync('git', ['show', `${TAG}:${path}`], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
}

const appVersion = execFileSync('/usr/bin/plutil', [
  '-extract', 'CFBundleShortVersionString', 'raw', '-o', '-', APP_PLIST,
], { encoding: 'utf8' }).trim();
if (appVersion !== EXPECTED_VERSION) {
  fail(`installed Blanc is ${appVersion || 'unknown'}, expected ${EXPECTED_VERSION}`);
}

const lock = JSON.parse(gitShow('package-lock.json'));
const releaseEngineVersion = lock.packages?.['node_modules/@ghostery/adblocker']?.version;
const installedEngineVersion = JSON.parse(readFileSync(
  new URL('../../node_modules/@ghostery/adblocker/package.json', import.meta.url),
  'utf8'
)).version;
if (releaseEngineVersion !== installedEngineVersion) {
  fail(`Ghostery matcher is ${installedEngineVersion}, release used ${releaseEngineVersion}`);
}

const manifest = JSON.parse(gitShow('adblock/sources/pinned.json'));
const sourceByFile = new Map(manifest.lists.map((entry) => [entry.file, entry]));
const rawParts = LISTS.map((file) => {
  const text = gitShow(`adblock/sources/${file}`);
  const expected = sourceByFile.get(file)?.sha256;
  if (sha256(text) !== expected) fail(`${file} does not match the release manifest`);
  return text;
});
const raw = rawParts.join('\n');
const snapshotDigest = sha256(raw);
if (snapshotDigest !== manifest.combinedSha256) fail('combined release snapshot hash mismatch');

const engine = FiltersEngine.parse(raw);
const sourceUrl = 'https://example.com/';
const candidates = [
  { type: 'image', url: 'https://ad.doubleclick.net/ddm/clk/blanc-capture-1' },
  { type: 'script', url: 'https://static.doubleclick.net/instream/ad_status.js?blanc=2' },
  { type: 'image', url: 'https://g.doubleclick.net/pagead/id?blanc=3' },
];

const results = candidates.map((candidate) => {
  const result = engine.match(Request.fromRawDetails({ ...candidate, sourceUrl }));
  if (!result.match || result.exception) fail(`expected blocked request did not match: ${candidate.url}`);
  return { ...candidate, filter: result.filter?.toString() ?? null };
});

const controlUrl = 'https://example.com/ordinary.png';
const control = engine.match(Request.fromRawDetails({ type: 'image', url: controlUrl, sourceUrl }));
if (control.match && !control.exception) fail(`ordinary control request unexpectedly matched: ${controlUrl}`);

console.log(JSON.stringify({
  ok: true,
  tag: TAG,
  installedAppVersion: appVersion,
  ghosteryVersion: installedEngineVersion,
  snapshotDate: manifest.date,
  snapshotDigest,
  sourceUrl,
  blockedRequests: results,
  unblockedControl: controlUrl,
}, null, 2));
