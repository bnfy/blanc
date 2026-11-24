// Owner, 2026-11-21 ("Turn it off"): after a Windows beta updated itself
// (158.0.8127.903 → .904), Chromium showed its non-milestone update toast, a
// dark toast with Chromium's product icon and the fixed text "Chrome was
// updated". Patch 0112 turns kNonMilestoneUpdateToast off in Blanc builds, so
// an update is quiet; About Blanc Beta still shows the version and whether it
// is up to date. Upstream builds without Blanc's sources keep Chromium's default.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';

const file = rel => fileURLToPath(new URL(`../${rel}`, import.meta.url));
const NAME = '0112-blanc-no-update-toast.patch';
const patch = fs.existsSync(file(`patches/${NAME}`)) ? fs.readFileSync(file(`patches/${NAME}`), 'utf8') : '';

test('patch 0112 follows 0111 in the desktop lane', () => {
  const lane = JSON.parse(fs.readFileSync(file('lanes/desktop.json'), 'utf8')).patches.map(p => p.split('/').pop());
  assert.equal(lane.indexOf(NAME), lane.indexOf('0111-blanc-windows-about-updates.patch') + 1);
});

test('the non-milestone update toast is off in Blanc builds only', () => {
  assert.match(patch, /^\+\+\+ b\/chrome\/browser\/ui\/ui_features\.cc$/m);
  assert.match(patch, /^-BASE_FEATURE\(kNonMilestoneUpdateToast, base::FEATURE_ENABLED_BY_DEFAULT\);$/m);
  const added = patch.split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++')).join('\n');
  assert.match(added, /BASE_FEATURE\(kNonMilestoneUpdateToast,/);
  assert.match(added, /__has_include\("blanc\/browser\/ui\/blanc_prototype_ui\.h"\)[\s\S]*FEATURE_DISABLED_BY_DEFAULT[\s\S]*FEATURE_ENABLED_BY_DEFAULT/);
});
