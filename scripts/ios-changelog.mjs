#!/usr/bin/env node
// Writes site/src/data/ios-releases.json, the changelog's Blanc for iPhone and
// iPad entries, from App Store Connect: every version that went on sale and its
// en-US What's New text, word for word.
//
// Run on the owner's Mac after a version goes on sale (never in CI; the API key
// comes from 1Password through `op run`):
//
//   npm run site:ios-changelog
//   npm run site:ios-changelog -- --date 1.0.1=2026-11-10   # backfill a date
//   npm run site:ios-changelog -- --check                   # fail if it would change
//
// A version already in the file keeps its date, and its text is never replaced
// unless --force says so: App Store text edited later must not rewrite history.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { humanDate, machineDate, parseInline } from './generate-site-changelog.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..');
const OUTPUT = path.join(ROOT, 'site', 'src', 'data', 'ios-releases.json');
const LISTING = path.join(ROOT, 'docs', 'ios', 'app-store-listing.md');
const APP_ID = '6828027794';
const STORE_URL = `https://apps.apple.com/app/id${APP_ID}`;
const API = 'https://api.appstoreconnect.apple.com/v1';
// States a version reaches only after it went on sale.
const ON_SALE = new Set(['READY_FOR_SALE', 'READY_FOR_DISTRIBUTION', 'REPLACED_WITH_NEW_VERSION']);
// 1.0.3 was the first App Store version that runs on iPad
// (docs/ios/app-store-connect.md, item 24).
const FIRST_IPAD_VERSION = '1.0.3';

function compareVersions(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff) return diff;
  }
  return 0;
}

function iosDevices(version) {
  return compareVersions(version, FIRST_IPAD_VERSION) >= 0 ? ['iphone', 'ipad'] : ['iphone'];
}

// The quoted block under "**What's New in <version>**" in app-store-listing.md.
// Version 1.0 has no What's New in App Store Connect (a first version can't
// carry one), so its line comes from there.
function notesFromListing(markdown, version) {
  const lines = String(markdown).split(/\r?\n/);
  const marker = `**What's New in ${version}**`;
  const start = lines.findIndex((line) => line.startsWith(marker));
  if (start === -1) return null;
  const quoted = [];
  for (const line of lines.slice(start + 1)) {
    if (/^>\s?/.test(line)) quoted.push(line.replace(/^>\s?/, ''));
    else if (quoted.length) break;
  }
  return quoted.length ? quoted.join('\n') : null;
}

// App Store text is plain: "•" (or "-") bullets, and paragraphs. A line that
// isn't a bullet continues the bullet or paragraph above it until a blank line.
function parseAppStoreNotes(value) {
  const blocks = [];
  let list = null;
  let open = null; // the text being collected: { kind: 'item'|'paragraph', parts }
  const flush = () => {
    if (!open) return;
    const spans = parseInline(open.parts.join(' '));
    if (open.kind === 'item') list.items.push({ spans, url: null });
    else blocks.push({ type: 'paragraph', spans });
    open = null;
  };
  for (const raw of String(value || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    const bullet = line.match(/^[•\-*]\s+(.*)$/);
    if (bullet) {
      flush();
      if (!list) blocks.push(list = { type: 'list', items: [] });
      open = { kind: 'item', parts: [bullet[1]] };
    } else if (open) {
      open.parts.push(line);
    } else {
      list = null;
      open = { kind: 'paragraph', parts: [line] };
    }
  }
  flush();
  return blocks.length ? [{ heading: null, blocks }] : [];
}

function dateFor(day) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(day))) throw new Error(`Not a date: ${day}`);
  // Noon in New York, so the rendered day never slips across midnight.
  return new Date(`${day}T17:00:00.000Z`).toISOString();
}

function buildIosEntries({ versions, localizations, existing = [], today, dates = {}, force = false, listing = '' }) {
  const byVersion = new Map(existing.map((entry) => [entry.version, entry]));
  for (const version of (versions || [])) {
    const { versionString, appStoreState } = version.attributes || {};
    if (!ON_SALE.has(appStoreState) || !versionString) continue;
    const english = (localizations[version.id] || []).find((loc) => loc.attributes?.locale === 'en-US');
    const notes = english?.attributes?.whatsNew || notesFromListing(listing, versionString);
    if (!notes) throw new Error(`Blanc for iPhone ${versionString} is on sale but has no en-US What's New text`);
    const sections = parseAppStoreNotes(notes);
    const previous = byVersion.get(versionString);
    if (previous && !force && JSON.stringify(previous.sections) !== JSON.stringify(sections)) {
      throw new Error(`Blanc for iPhone ${versionString}'s App Store text changed since it was recorded; run again with --force to replace it`);
    }
    const publishedAt = dates[versionString] ? dateFor(dates[versionString]) : (previous?.publishedAt || dateFor(today));
    byVersion.set(versionString, {
      tag: `ios-${versionString}`,
      product: 'ios',
      devices: iosDevices(versionString),
      version: versionString,
      name: versionString,
      publishedAt,
      humanDate: humanDate(publishedAt),
      machineDate: machineDate(publishedAt),
      url: STORE_URL,
      anchor: `ios-${versionString}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      compareUrl: null,
      sections,
    });
  }
  for (const version of Object.keys(dates)) {
    if (!byVersion.has(version)) throw new Error(`--date ${version}: no such version on sale`);
  }
  return [...byVersion.values()].sort((a, b) => (Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
    || compareVersions(b.version, a.version));
}

function appStoreJwt({ keyId, issuerId, p8, now = Math.floor(Date.now() / 1000) }) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = `${encode({ alg: 'ES256', kid: keyId, typ: 'JWT' })}.${encode({ iss: issuerId, iat: now, exp: now + 1140, aud: 'appstoreconnect-v1' })}`;
  const signature = crypto.sign('sha256', Buffer.from(unsigned), { key: p8, dsaEncoding: 'ieee-p1363' });
  return `${unsigned}.${signature.toString('base64url')}`;
}

async function fetchAll(url, token) {
  const items = [];
  for (let next = url; next;) {
    const response = await fetch(next, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(`App Store Connect answered ${response.status} for ${new URL(next).pathname}`);
    const body = await response.json();
    items.push(...(body.data || []));
    next = body.links?.next || null;
  }
  return items;
}

async function fetchAppStore(env) {
  for (const name of ['ASC_KEY_ID', 'ASC_ISSUER_ID', 'ASC_KEY_P8']) {
    if (!env[name]) throw new Error(`${name} is not set; run through npm run site:ios-changelog`);
  }
  const token = appStoreJwt({ keyId: env.ASC_KEY_ID, issuerId: env.ASC_ISSUER_ID, p8: env.ASC_KEY_P8 });
  const versions = await fetchAll(`${API}/apps/${APP_ID}/appStoreVersions?filter[platform]=IOS&limit=200`, token);
  const localizations = {};
  for (const version of versions) {
    if (!ON_SALE.has(version.attributes?.appStoreState)) continue;
    localizations[version.id] = await fetchAll(`${API}/appStoreVersions/${version.id}/appStoreVersionLocalizations?limit=200`, token);
  }
  return { versions, localizations };
}

function parseArgs(argv) {
  const options = { check: false, force: false, dates: {} };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--check') options.check = true;
    else if (arg === '--force') options.force = true;
    else if (arg === '--date') {
      const match = String(argv[++i] || '').match(/^([\d.]+)=(\d{4}-\d{2}-\d{2})$/);
      if (!match) throw new Error('--date takes <version>=<YYYY-MM-DD>');
      options.dates[match[1]] = match[2];
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

// The recorded file, or '' when there is none yet. One read, no separate
// existence check that the file could change after.
function readOutput() {
  try {
    return fs.readFileSync(OUTPUT, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return '';
    throw error;
  }
}

async function run(argv = process.argv.slice(2), env = process.env) {
  const options = parseArgs(argv);
  const current = readOutput();
  const existing = current ? JSON.parse(current) : [];
  const { versions, localizations } = await fetchAppStore(env);
  const entries = buildIosEntries({
    versions, localizations, existing,
    today: machineDate(new Date().toISOString()),
    dates: options.dates, force: options.force,
    listing: fs.readFileSync(LISTING, 'utf8'),
  });
  const text = JSON.stringify(entries, null, 2) + '\n';
  if (options.check) {
    if (current !== text) {
      console.error(`${path.relative(ROOT, OUTPUT)} is behind App Store Connect. Run: npm run site:ios-changelog`);
      return 1;
    }
    console.log(`iPhone release data is current (${entries.length} versions).`);
    return 0;
  }
  fs.writeFileSync(OUTPUT, text);
  console.log(`Wrote ${entries.length} Blanc for iPhone versions to ${path.relative(ROOT, OUTPUT)}.`);
  return 0;
}

export { appStoreJwt, buildIosEntries, iosDevices, notesFromListing, parseAppStoreNotes, run };

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  run().then((code) => { process.exitCode = code; }, (error) => {
    console.error(`Could not write the iPhone changelog: ${error.message}`);
    process.exitCode = 1;
  });
}
