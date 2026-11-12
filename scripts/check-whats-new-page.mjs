#!/usr/bin/env node
// Release gate: a feature release (X.Y.0) publishes only once its What's New
// page answers 200 at blanc.day/whats-new/X.Y, or its release is listed in
// site/src/data/whats-new.json's noPage. Blanc asks for the page once per
// launch after a feature update, and people update within a minute of
// publication, so the page must be live first (v1.39.0's first launches came
// before its page deployed). The request matches the app's own check
// (src/main/whats-new-check.js): HEAD, no redirects, only a 200 counts.
//
//   node scripts/check-whats-new-page.mjs --version 1.40.0
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'https://blanc.day';
const TIMEOUT_MS = 10_000;

export function whatsNewGate({ version, noPage = [] }) {
  const match = /^(\d+)\.(\d+)\.(\d+)(-.+)?$/.exec(version ?? '');
  if (!match) throw new Error(`not a release version: ${version}`);
  const [, major, minor, patch, pre] = match;
  const release = `${major}.${minor}`;
  if (pre) return { skip: `${version} is a pre-release; the app never opens What's New for one` };
  if (patch !== '0') return { skip: `${version} is a bug-fix release; ${release}'s page was checked when ${release}.0 shipped` };
  if (noPage.includes(release)) return { skip: `${release} is in noPage in site/src/data/whats-new.json` };
  return { url: `${ORIGIN}/whats-new/${release}` };
}

export async function pageIsLive(url, { fetch = globalThis.fetch } = {}) {
  try {
    const response = await fetch(url, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS) });
    return response.status === 200;
  } catch {
    return false;
  }
}

async function main(argv) {
  const at = argv.indexOf('--version');
  const version = at >= 0 ? argv[at + 1] : undefined;
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'site/src/data/whats-new.json'), 'utf8'));
  const gate = whatsNewGate({ version, noPage: data.noPage ?? [] });
  if (gate.skip) {
    console.log(`What's New page not required: ${gate.skip}.`);
    return 0;
  }
  if (await pageIsLive(gate.url)) {
    console.log(`What's New page is live: ${gate.url}`);
    return 0;
  }
  console.error(`${gate.url} does not answer 200. Deploy the owner-approved What's New page`);
  console.error('(npm run site:deploy from origin/main) before releasing, or list the release in');
  console.error("noPage in site/src/data/whats-new.json with the owner's approval.");
  return 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (error) => {
    console.error(error.message);
    process.exit(1);
  });
}
