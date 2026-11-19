#!/usr/bin/env node
// The update server's release.json (cloudflare/update-worker/src/release.json)
// from one signed package's package.json (W3 Task D1).
//
//   node chromium/release/windows-release-data.mjs PACKAGE_JSON > cloudflare/update-worker/src/release.json
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const BROWSER_APP_ID = '{459fd3cf-456c-4a06-8b37-2084cf64ddce}';
const PUBLISHER_KEY_SHA256 = crypto.createHash('sha256')
  .update(fs.readFileSync(fileURLToPath(new URL('../windows/keys/crx-public.der', import.meta.url)))).digest('hex');

export function releaseData(record) {
  if (record.publisherKeySha256 !== PUBLISHER_KEY_SHA256) throw new Error('The package is not signed with the committed publisher key');
  if (!/^[0-9a-f]{64}$/.test(record.sha256)) throw new Error('The package record has no sha256');
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(record.version)) throw new Error(`Not a Windows version: ${record.version}`);
  if (!Number.isInteger(record.size) || record.size <= 0) throw new Error('The package record has no size');
  return {appId: BROWSER_APP_ID, version: record.version, url: `https://blanc.day/update/win/pkg/${record.sha256}.crx3`,
    size: record.size, sha256: record.sha256, run: record.run, arguments: '--do-not-launch-chrome --verbose-logging'};
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  if (process.argv.length !== 3) { console.error('usage: windows-release-data.mjs PACKAGE_JSON'); process.exit(2); }
  console.log(JSON.stringify(releaseData(JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))), null, 2));
}
