#!/usr/bin/env node
// Asks the live icon server for icons and fails unless every one answers 200
// with an image. Before the redesigned /bangs page ships, all 19 featured
// (popular) hosts must pass; --popular reads them from the same site's
// /bang-hosts.json, so it checks what that site actually features:
//
//   node cloudflare/bang-icons-worker/scripts/check-icons.mjs --popular
//   node cloudflare/bang-icons-worker/scripts/check-icons.mjs --origin=https://blanc.day maps.apple.com

const args = process.argv.slice(2);
const origin = args.find((arg) => arg.startsWith('--origin='))?.slice('--origin='.length) ?? 'https://blanc.day';
let hosts = args.filter((arg) => !arg.startsWith('--'));
if (args.includes('--popular')) {
  const response = await fetch(`${origin}/bang-hosts.json`);
  if (!response.ok) {
    console.error(`${origin}/bang-hosts.json answered ${response.status}; deploy the site first.`);
    process.exit(2);
  }
  hosts = hosts.concat((await response.json()).popular ?? []);
}
if (!hosts.length) {
  console.error('Name hosts, or pass --popular.');
  process.exit(2);
}

let failed = 0;
for (const host of new Set(hosts)) {
  const response = await fetch(`${origin}/bang-icons/${host}`);
  const type = response.headers.get('content-type') ?? '';
  const ok = response.status === 200 && type.startsWith('image/');
  if (!ok) failed += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${response.status} ${type || '-'} ${host}`);
}
process.exit(failed ? 1 : 0);
