// Patch 0107: Blanc never shows Chromium's "Google API keys are missing" bar.
// Blanc ships without Google API keys on purpose; the bar showed on the first
// window of each launch (seen by the owner after a beta update, 2026-11-19).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const PATCH = 'patches/0107-blanc-no-api-keys-infobar.patch';

test('the API-key bar is skipped in every Blanc build, and nothing else at startup changes', () => {
  const patch = read(PATCH);
  assert.match(patch, /^\+\+\+ b\/chrome\/browser\/ui\/startup\/infobar_utils\.cc$/m);
  assert.match(patch, /^\+#include "blanc\/common\/island_mode\.h"$/m);
  assert.match(patch, /^-  if \(!google_apis::HasAPIKeyConfigured\(\)\) \{\n(\+  \/\/.*\n)*\+  if \(!blanc::IslandMode\(\) && !google_apis::HasAPIKeyConfigured\(\)\) \{$/m);
  // One condition: the bad-flags warning, session-crashed bubble and the
  // other startup bars stay Chromium's.
  assert.equal(patch.match(/^-[^-]/gm).length, 1);
  assert.equal(patch.match(/^@@ /gm).length, 2);
});

test('the desktop lane applies it, so the Mac and Windows builds both carry it', () => {
  assert.ok(JSON.parse(read('lanes/desktop.json')).patches.includes(PATCH));
});
