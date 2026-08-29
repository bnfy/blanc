#!/usr/bin/env node

/**
 * Read-only Start here profile-trailer capture preflight.
 *
 * This does not launch Blanc, browse the web, seed a profile, capture footage,
 * render creative, or write files. It verifies the installed public app
 * version, the exact v1.9.1 Island/tab-switching implementation, the public
 * Island and availability claims, and the neutral two-page setup planned for
 * the eventual real product capture.
 */
import { execFileSync } from 'node:child_process';

const TAG = 'v1.9.1';
const EXPECTED_VERSION = '1.9.1';
const APP_PLIST = '/Applications/Blanc.app/Contents/Info.plist';

function fail(message) {
  throw new Error(`Start here trailer preflight: ${message}`);
}

function gitShow(path) {
  return execFileSync('git', ['show', `${TAG}:${path}`], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
}

function requireMarker(text, marker, label) {
  if (!text.includes(marker)) fail(`v1.9.1 is missing ${label}: ${marker}`);
}

const appVersion = execFileSync('/usr/bin/plutil', [
  '-extract', 'CFBundleShortVersionString', 'raw', '-o', '-', APP_PLIST,
], { encoding: 'utf8' }).trim();
if (appVersion !== EXPECTED_VERSION) {
  fail(`installed Blanc is ${appVersion || 'unknown'}, expected ${EXPECTED_VERSION}`);
}

const chromeHtml = gitShow('src/renderer/index.html');
const chromeRenderer = gitShow('src/renderer/renderer.js');
const main = gitShow('src/main/main.js');
const islandPage = gitShow('site/src/pages/features/island.astro');
const homePage = gitShow('site/src/pages/index.astro');

const requiredMarkers = [
  [chromeHtml, 'id="islandPill"', 'resting Island pill'],
  [chromeHtml, 'id="pillDots"', 'resting tab dots'],
  [chromeRenderer, 'window.browserAPI.openIsland()', 'real Island expansion gesture'],
  [chromeRenderer, 'window.browserAPI.switchTab(t.id)', 'real tab-switch gesture'],
  [main, 'function setActiveTab(id, { focusContent = true, focusAddress = false } = {})', 'main-process active-tab transition'],
  [main, 'rt().window.contentView.removeChildView(prev.view)', 'previous-tab detachment'],
  [main, 'rt().window.contentView.addChildView(next.view)', 'next-tab attachment'],
  [islandPage, 'Blanc does not pin a traditional tab strip and toolbar above every page.', 'public no-permanent-strip claim'],
  [islandPage, 'Open the Island to switch tabs', 'public tab-switching claim'],
  [homePage, 'Blanc is available for macOS, Windows, and Linux.', 'public platform-availability claim'],
  [homePage, 'Blanc is free', 'public free-product claim'],
];
for (const [text, marker, label] of requiredMarkers) {
  requireMarker(text, marker, label);
}

// These are public, accountless HTTPS pages chosen only to make the real tab
// switch visible. They carry no personal account, history, search query, or
// staged product claim. Recheck their rendered state immediately before an
// approved capture; replace either if it presents a login wall or sensitive
// content at that time.
const capturePages = [
  { title: 'Substack', url: 'https://substack.com/' },
  { title: 'MDN Web Docs', url: 'https://developer.mozilla.org/en-US/' },
];

const seenHosts = new Set();
for (const page of capturePages) {
  const parsed = new URL(page.url);
  if (parsed.protocol !== 'https:') fail(`${page.title} is not HTTPS`);
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    fail(`${page.title} URL contains credentials, query data, or a fragment`);
  }
  if (seenHosts.has(parsed.hostname)) fail('capture pages must use distinct hosts');
  seenHosts.add(parsed.hostname);
}

console.log(JSON.stringify({
  ok: true,
  tag: TAG,
  installedAppVersion: appVersion,
  captureProfile: 'temporary clean profile',
  capturePages,
  captureSequence: [
    'Open both public pages as ordinary tabs in the temporary profile.',
    'Frame the full resting Island with visible top margin.',
    'Expand the real Island without typing or exposing any personal data.',
    'Switch to the other real tab using Blanc UI.',
    'Close the temporary profile after the approved capture.',
  ],
  assertions: [
    'The installed packaged app is the public v1.9.1 build.',
    'The v1.9.1 chrome contains the resting Island and tab dots.',
    'The shipped UI opens the Island and switches real tabs.',
    'The public v1.9.1 site supports the no-permanent-tab-strip claim.',
    'The public v1.9.1 site supports free macOS, Windows, and Linux availability.',
    'The planned page setup contains no personal account or query data.',
  ],
}, null, 2));
