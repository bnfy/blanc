#!/usr/bin/env node

/**
 * Read-only Quick Switcher campaign capture preflight.
 *
 * This does not launch Blanc, browse the web, seed a profile, render creative,
 * or write files. It verifies the installed app version, the exact v1.9.1
 * switcher sources/ranking/labels, the public feature-page claim source, and
 * the deterministic four-source `docs` setup planned for the eventual real
 * product capture.
 */
import { execFileSync } from 'node:child_process';

const TAG = 'v1.9.1';
const EXPECTED_VERSION = '1.9.1';
const APP_PLIST = '/Applications/Blanc.app/Contents/Info.plist';
const QUERY = 'docs';

function fail(message) {
  throw new Error(`Quick Switcher campaign preflight: ${message}`);
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

const overlay = gitShow('src/renderer/overlay.js');
const main = gitShow('src/main/main.js');
const featurePage = gitShow('site/src/pages/features/command-palette.astro');

const requiredOverlayMarkers = [
  ['function switcherResults(query)', 'Quick Switcher result builder'],
  ["kind: 'group'", 'named-group results'],
  ["kind: 'tab'", 'open-tab results'],
  ["kind: 'favorite'", 'favorite results'],
  ["kind: 'history'", 'history results'],
  ["tag.textContent = result.kind === 'search' ? result.providerLabel : result.kind", 'visible result-source labels'],
  ['...local.slice(0, 3)', 'strong local-result placement'],
  ['...local.slice(3)', 'local-result backfill'],
  ['.slice(0, 6)', 'six-row result cap'],
];
for (const [marker, label] of requiredOverlayMarkers) {
  requireMarker(overlay, marker, label);
}
requireMarker(main, "accelerator: 'CmdOrCtrl+L'", 'Command/Control L shortcut');
requireMarker(
  featurePage,
  'The Quick Switcher matches across open tabs, favorites, browsing history, and named groups.',
  'release-backed public claim'
);

// Distinct URLs avoid the release's URL-keyed favorite/history deduplication.
// Each title or capped URL path contains the literal strong-match substring
// `docs`, so all four local records qualify for the strong result path.
const records = [
  {
    kind: 'group',
    title: 'docs',
    url: null,
    score: 2.3,
    setup: 'Create a user-directed named group called docs and place one tab in it.',
  },
  {
    kind: 'tab',
    title: 'MDN Web APIs',
    url: 'https://developer.mozilla.org/en-US/docs/Web/API',
    score: 2.2,
    setup: 'Keep this page open as an ordinary tab.',
  },
  {
    kind: 'favorite',
    title: 'GitHub Docs',
    url: 'https://docs.github.com/',
    score: 2.1,
    setup: 'Save this page as a favorite, then close its tab.',
  },
  {
    kind: 'history',
    title: 'Electron documentation',
    url: 'https://www.electronjs.org/docs/latest/',
    score: 2,
    setup: 'Visit this page, then navigate away so it remains only in history.',
  },
];

const uniqueUrls = records.filter((record) => record.url).map((record) => record.url);
if (new Set(uniqueUrls).size !== uniqueUrls.length) fail('capture records would deduplicate by URL');
for (const record of records) {
  const matchable = `${record.title} ${record.url ?? ''}`.toLowerCase();
  if (!matchable.includes(QUERY)) fail(`${record.kind} record is not a strong literal docs match`);
}

const rankedLocal = [...records].sort((a, b) => b.score - a.score);
// With search suggestions off, the release's strong-match blend is the first
// three local rows, one exact-search row, then remaining local rows. That keeps
// all four source types inside the six-row cap.
const visibleRows = [
  ...rankedLocal.slice(0, 3),
  { kind: 'search', title: QUERY, score: null, setup: 'Release-inserted exact search row.' },
  ...rankedLocal.slice(3),
].slice(0, 6);
const visibleKinds = new Set(visibleRows.map((row) => row.kind));
for (const kind of ['group', 'tab', 'favorite', 'history']) {
  if (!visibleKinds.has(kind)) fail(`${kind} would not appear within the six visible rows`);
}

console.log(JSON.stringify({
  ok: true,
  tag: TAG,
  installedAppVersion: appVersion,
  query: QUERY,
  searchSuggestionsForCapture: 'off',
  resultCap: 6,
  captureRecords: records,
  predictedVisibleOrder: visibleRows.map(({ kind, title }) => ({ kind, title })),
  assertions: [
    'Command/Control L is wired in v1.9.1.',
    'The v1.9.1 switcher builds group, tab, favorite, and history results.',
    'The real UI labels each result with its source kind.',
    'All four planned sources remain visible inside the six-row result cap.',
    'The feature-page claim matches the tagged implementation.',
  ],
}, null, 2));
