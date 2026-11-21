#!/usr/bin/env node
// The update server's release.json (cloudflare/update-worker/src/release.json)
// from one signed package's package.json (W3 Task D1).
//
//   node chromium/release/windows-release-data.mjs PACKAGE_JSON > cloudflare/update-worker/src/release.json
//   node chromium/release/windows-release-data.mjs PACKAGE_JSON --origin=https://….workers.dev
// (the release gate's staging server, which serves the package itself)
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const BROWSER_APP_ID = '{459fd3cf-456c-4a06-8b37-2084cf64ddce}';
const PUBLISHER_KEY_SHA256 = crypto.createHash('sha256')
  .update(fs.readFileSync(fileURLToPath(new URL('../windows/keys/crx-public.der', import.meta.url)))).digest('hex');

const ORIGIN = /^https:\/\/(blanc\.day|[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev)$/;

export function releaseData(record, {origin = 'https://blanc.day'} = {}) {
  if (!ORIGIN.test(origin)) throw new Error(`Packages are served from blanc.day or a workers.dev staging server, not origin ${origin}`);
  if (record.publisherKeySha256 !== PUBLISHER_KEY_SHA256) throw new Error('The package is not signed with the committed publisher key');
  if (!/^[0-9a-f]{64}$/.test(record.sha256)) throw new Error('The package record has no sha256');
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(record.version)) throw new Error(`Not a Windows version: ${record.version}`);
  if (!Number.isInteger(record.size) || record.size <= 0) throw new Error('The package record has no size');
  return {appId: BROWSER_APP_ID, version: record.version, url: `${origin}/update/win/pkg/${record.sha256}.crx3`,
    size: record.size, sha256: record.sha256, run: record.run, arguments: '--do-not-launch-chrome --verbose-logging'};
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const [file, ...options] = process.argv.slice(2);
  const origin = options.find(o => o.startsWith('--origin='))?.slice('--origin='.length);
  if (!file || options.some(o => !o.startsWith('--origin='))) { console.error('usage: windows-release-data.mjs PACKAGE_JSON [--origin=https://…]'); process.exit(2); }
  console.log(JSON.stringify(releaseData(JSON.parse(fs.readFileSync(file, 'utf8')), origin ? {origin} : {}), null, 2));
}
