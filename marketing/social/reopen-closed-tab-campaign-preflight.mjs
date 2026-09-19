#!/usr/bin/env node

/**
 * Read-only Reopen Closed Tab campaign preflight.
 *
 * This does not launch Blanc, close or reopen a tab, seed a profile, render
 * creative, or write files. It verifies the installed public build and the
 * exact v1.9.1 shortcut, live-hold, bounded-recovery, private-tab exclusion,
 * and public feature-copy sources used by the campaign brief.
 */
import { execFileSync } from 'node:child_process';

const TAG = 'v1.9.1';
const EXPECTED_VERSION = '1.9.1';
const APP_PLIST = '/Applications/Blanc.app/Contents/Info.plist';

function fail(message) {
  throw new Error(`Reopen Closed Tab campaign preflight: ${message}`);
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

const policy = gitShow('src/main/closed-tabs.js');
const main = gitShow('src/main/main.js');
const menuModel = gitShow('src/main/tab-context-menu-model.js');
const featurePage = gitShow('site/src/pages/features.astro');
const unitTests = gitShow('test/unit/closed-tabs.test.js');

const policyMarkers = [
  ['const CLOSED_GRACE_MS = 30_000;', '30-second live-hold window'],
  ['const CLOSED_ENTRY_TTL_MS = 60 * 60 * 1000;', 'one-hour undo-entry expiry'],
  ['const MAX_CLOSED_ENTRIES = 25;', '25-entry undo-buffer cap'],
  ['const MAX_HELD_VIEWS = 1;', 'one live held view per window'],
  ["if (!url || tab?.private || url.startsWith('blanc://newtab')) return 'refuse';", 'private/new-tab exclusion'],
  ["return demoted ? 'snapshot' : 'hold';", 'qualified live-hold decision'],
  ['.filter((m) => !m.private)', 'private-member exclusion'],
];
for (const [marker, label] of policyMarkers) requireMarker(policy, marker, label);

const mainMarkers = [
  ['function parkTabView(tab, entry)', 'live-view parking'],
  ['view.setVisible(false);', 'hidden parked view'],
  ['wc.setAudioMuted(true);', 'muted parked page'],
  ['entry.view = view;', 'held view ownership'],
  ['function reopenClosedTab()', 'reopen command'],
  ['if (entry) reopenEntry(entry);', 'most-recent entry consumption'],
  ['adoptView: entry.view', 'same-view restoration'],
  ['restoreHistory: entry.snapshot', 'snapshot fallback'],
];
for (const [marker, label] of mainMarkers) requireMarker(main, marker, label);

requireMarker(menuModel, "reopen: 'CmdOrCtrl+Shift+T'", 'Command/Control Shift T shortcut');
requireMarker(
  featurePage,
  'reopen a recently closed tab or group without rebuilding your place.',
  'public recovery benefit copy'
);
requireMarker(
  unitTests,
  "test('eligibility: hold only for a clean, snapshot-bearing, family-free tab'",
  'tagged hold-eligibility unit coverage'
);
requireMarker(
  unitTests,
  "test('expireHolds names only entries whose hold has aged out'",
  'tagged hold-expiry unit coverage'
);
requireMarker(
  unitTests,
  "test('expireEntries removes old undo records regardless of recovery tier'",
  'tagged undo-expiry unit coverage'
);

console.log(JSON.stringify({
  ok: true,
  tag: TAG,
  installedAppVersion: appVersion,
  verified: {
    shortcut: 'CmdOrCtrl+Shift+T',
    liveHoldWindowMs: 30_000,
    undoEntryTtlMs: 3_600_000,
    maxClosedEntriesPerWindow: 25,
    maxLiveHeldViewsPerWindow: 1,
    sameLiveViewForEligibleImmediateReopen: true,
    snapshotOrUrlFallback: true,
    privateTabsRecorded: false,
  },
  captureGuardrails: [
    'Demonstrate only an eligible ordinary page inside the live-hold window.',
    'Say about 30 seconds and eligible; never promise exact recovery for every page.',
    'Use the installed public v1.9.1 build and real shipped Blanc chrome.',
    'Keep private-tab language scoped to Blanc recently closed records.',
  ],
}, null, 2));
