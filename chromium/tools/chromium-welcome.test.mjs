// Patch 0104: no Blanc channel opens Chromium's welcome (chrome://intro).
// Blanc's own first run (the walkthrough, blanc/browser/ui/first_run.inc) is
// the only one. The native proof is tests/native-first-run-welcome.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const PATCH = 'patches/0104-blanc-skip-chromium-welcome.patch';

test('ShouldOpenFirstRun is false in every Blanc build, before any of Chromium\'s checks', () => {
  const patch = read(PATCH);
  assert.match(patch, /^\+\+\+ b\/chrome\/browser\/ui\/startup\/first_run_service\.cc$/m);
  assert.match(patch, /^\+#include "blanc\/common\/island_mode\.h"$/m);
  assert.match(patch, / bool ShouldOpenFirstRun\(Profile\* profile\) \{\n(\+.*\n)*\+  if \(blanc::IslandMode\(\)\) \{\n\+    return false;\n\+  \}\n   return IsFirstRunEligibleProcess\(\)/);
  // Only that helper: the sentinel, import and initial prefs stay Chromium's.
  assert.deepEqual(patch.match(/^@@ /gm).length, 2);
});

test('IslandMode is true in every channel', () => {
  assert.match(read('blanc/common/island_mode.h'), /inline bool IslandMode\(\) \{\n  return true;\n\}/);
});

test('the desktop lane applies it, so the Mac and Windows builds both carry it', () => {
  const lane = JSON.parse(read('lanes/desktop.json'));
  assert.ok(lane.patches.includes(PATCH));
});
