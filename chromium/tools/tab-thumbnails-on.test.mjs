// Rail hover previews (docs/superpowers/specs/2026-11-14-rail-hover-previews-design.md)
// need Chromium's tab thumbnails. Chromium 158 leaves kTabHoverCardImages off
// on macOS (Google turns it on for Apple Silicon through the
// TabHoverCardImagesMacArm field trial, which Blanc doesn't receive), and
// without it TabFeatures never creates a ThumbnailTabHelper. Owner,
// 2026-11-14: on in Blanc builds. Source-level: the reconstructed desktop
// lane's ui_features.cc, no Chromium build.
import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-tab-thumbnails-'));
after(() => fs.rmSync(staging, {recursive: true, force: true}));
const lane = JSON.parse(fs.readFileSync(path.join(root, 'chromium/lanes/desktop.json')));
fs.cpSync(path.join(root, 'chromium/upstream'), staging, {recursive: true});
for (const patch of lane.patches) execFileSync('git', ['apply', path.join(root, 'chromium', patch)], {cwd: staging});
const features = fs.readFileSync(path.join(staging, 'chrome/browser/ui/ui_features.cc'), 'utf8');

test('tab hover card images are on by default in Blanc builds on every platform', () => {
  const start = features.indexOf('BASE_FEATURE(kTabHoverCardImages,');
  assert.ok(start > 0, 'the feature is declared');
  const declaration = features.slice(start, features.indexOf(');', start) + 2);
  assert.match(declaration,
    /#if BUILDFLAG\(IS_MAC\) && !__has_include\("blanc\/browser\/ui\/blanc_prototype_ui\.h"\)\n\s+base::FEATURE_DISABLED_BY_DEFAULT\n#else\n\s+base::FEATURE_ENABLED_BY_DEFAULT\n#endif/,
    'disabled only on a Mac build without Blanc');
});
