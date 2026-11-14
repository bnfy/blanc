// Desktop spec §6.1 (default-off Google traffic) is a release gate. Beta.3's
// outbound check (2026-11-14) found Chromium's default Safe Browsing fetching
// Google's lists (safebrowsing.googleapis.com/v5/hashLists) after a relaunch;
// shipping Blanc has no Safe Browsing. Owner, 2026-11-14: off by default.
// With the pref off for every profile, Chromium neither updates the lists nor
// sends download or real-time checks. Source-level: the reconstructed desktop
// lane's browser_prefs.cc, no Chromium build.
import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-safe-browsing-'));
after(() => fs.rmSync(staging, {recursive: true, force: true}));
const lane = JSON.parse(fs.readFileSync(path.join(root, 'chromium/lanes/desktop.json')));
fs.cpSync(path.join(root, 'chromium/upstream'), staging, {recursive: true});
for (const patch of lane.patches) execFileSync('git', ['apply', path.join(root, 'chromium', patch)], {cwd: staging});
const prefs = fs.readFileSync(path.join(staging, 'chrome/browser/prefs/browser_prefs.cc'), 'utf8');

test('Safe Browsing is off by default in Blanc builds, set after its prefs exist', () => {
  const body = prefs.slice(prefs.indexOf('\nvoid RegisterProfilePrefs(user_prefs::PrefRegistrySyncable* registry,'));
  const registered = body.indexOf('safe_browsing::RegisterProfilePrefs(registry);');
  const off = body.indexOf('registry->SetDefaultPrefValue(prefs::kSafeBrowsingEnabled, base::Value(false));');
  assert.ok(registered > 0, 'Safe Browsing registers its profile prefs');
  assert.ok(off > registered, 'the default changes only after the pref is registered');
  const guard = body.lastIndexOf('#if __has_include("blanc/browser/ui/blanc_prototype_ui.h")', off);
  assert.ok(guard > registered && body.indexOf('#endif', guard) > off, 'only in Blanc builds');
  assert.equal(prefs.match(/kSafeBrowsingEnabled, base::Value\(/g)?.length, 1, 'set once');
});
