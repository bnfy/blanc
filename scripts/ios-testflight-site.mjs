#!/usr/bin/env node
// Writes site/src/data/ios-testflight.json, the TestFlight build the Download
// page's iPhone and iPad beta row names, from App Store Connect: the newest
// build that the public TestFlight group (the joinUrl in ios-availability.json)
// is testing now. It also rewrites the row's claim in the Download page's
// ledger, so the page text and its evidence move together.
//
// Run on the owner's Mac after a build reaches the public group (never in CI;
// the API key comes from 1Password through `op run`):
//
//   npm run site:ios-testflight
//   npm run site:ios-testflight -- --check   # fail if it would change

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { appStoreJwt } from './ios-changelog.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..');
const OUTPUT = path.join(ROOT, 'site', 'src', 'data', 'ios-testflight.json');
const LEDGER = path.join(ROOT, 'docs', 'website-download-redesign-2026-11-14-claims.json');
const APP_ID = '6828027794';
const API = 'https://api.appstoreconnect.apple.com/v1';
export const CLAIM_FIELD = 'testflight-build';

// rows: [{ build, version, uploaded (ISO), expired, state }] for the public group.
export function latestPublicBuild(rows) {
  const live = rows.filter((row) => !row.expired && row.state === 'IN_BETA_TESTING' && /^\d+$/.test(row.build));
  if (!live.length) throw new Error('the public TestFlight group has no build in testing');
  const top = live.reduce((best, row) => (BigInt(row.build) > BigInt(best.build) ? row : best));
  return { version: top.version, build: top.build, uploaded: new Date(top.uploaded).toISOString().slice(0, 10) };
}

export const claimText = (data) => `${data.version} (${data.build})`;

// The ledger is written by hand with one claim per line, so only that claim's
// line is replaced; the rest of the file keeps its layout.
export function applyToLedger(text, data) {
  const lines = text.split('\n');
  const index = lines.findIndex((line) => line.includes(`"field": "${CLAIM_FIELD}"`));
  if (index === -1) throw new Error(`the Download ledger has no ${CLAIM_FIELD} claim`);
  const [, indent, body, comma] = lines[index].match(/^(\s*)(\{.*\})(,?)$/);
  const claim = JSON.parse(body);
  claim.exactWording = claimText(data);
  claim.evidence = `App Store Connect: build ${data.version} (${data.build}), uploaded ${data.uploaded} (UTC), is the newest build in testing (IN_BETA_TESTING, not expired) in the Public beta group, which the TestFlight link in ios-availability.json joins.`;
  const value = (v) => (Array.isArray(v) ? `[${v.map((x) => JSON.stringify(x)).join(', ')}]` : JSON.stringify(v));
  const inline = `{${Object.entries(claim).map(([k, v]) => `${JSON.stringify(k)}: ${value(v)}`).join(', ')}}`;
  lines[index] = `${indent}${inline}${comma}`;
  return lines.join('\n');
}

async function fetchRows(env) {
  for (const name of ['ASC_KEY_ID', 'ASC_ISSUER_ID', 'ASC_KEY_P8']) {
    if (!env[name]) throw new Error(`${name} is missing; run through npm run site:ios-testflight`);
  }
  const token = appStoreJwt({ keyId: env.ASC_KEY_ID, issuerId: env.ASC_ISSUER_ID, p8: env.ASC_KEY_P8 });
  const get = async (url) => {
    const response = await fetch(`${API}${url}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(`App Store Connect answered ${response.status} for ${url}`);
    return response.json();
  };
  const groups = await get(`/apps/${APP_ID}/betaGroups?limit=50`);
  const group = groups.data.find((g) => !g.attributes.isInternalGroup && g.attributes.publicLinkEnabled);
  if (!group) throw new Error('no public TestFlight group');
  const builds = await get(`/builds?filter[betaGroups]=${group.id}&include=preReleaseVersion,buildBetaDetail&limit=200`);
  const included = new Map((builds.included || []).map((item) => [`${item.type}:${item.id}`, item]));
  return builds.data.map((b) => {
    const pre = included.get(`preReleaseVersions:${b.relationships?.preReleaseVersion?.data?.id}`);
    const detail = included.get(`buildBetaDetails:${b.relationships?.buildBetaDetail?.data?.id}`);
    return {
      build: b.attributes.version, version: pre?.attributes.version, uploaded: b.attributes.uploadedDate,
      expired: b.attributes.expired, state: detail?.attributes.externalBuildState,
    };
  });
}

async function run(argv = process.argv.slice(2), env = process.env) {
  const check = argv.includes('--check');
  const data = latestPublicBuild(await fetchRows(env));
  const json = `${JSON.stringify(data, null, 2)}\n`;
  const ledgerBefore = fs.readFileSync(LEDGER, 'utf8');
  const ledger = applyToLedger(ledgerBefore, data);
  const current = fs.existsSync(OUTPUT) ? fs.readFileSync(OUTPUT, 'utf8') : '';
  const changed = current !== json || ledgerBefore !== ledger;
  if (check) {
    if (changed) throw new Error(`the site names an older TestFlight build; newest is ${claimText(data)}`);
    console.log(`up to date: ${claimText(data)}`);
    return;
  }
  fs.writeFileSync(OUTPUT, json);
  fs.writeFileSync(LEDGER, ledger);
  console.log(`${changed ? 'wrote' : 'unchanged'}: ${claimText(data)}, uploaded ${data.uploaded}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  run().catch((error) => { console.error(error.message); process.exit(1); });
}
