// Patch 0110 (owner, 2026-11-21: "fix the Restore pages button too"): the
// "Restore pages?" bubble's Restore button takes the Sunrise accent (the
// fork's Settings palette), not Chromium's Material blue. Only this button:
// Chromium's default color stays elsewhere.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';

const file = rel => fileURLToPath(new URL(`../${rel}`, import.meta.url));
const NAME = '0110-blanc-restore-pages-button.patch';
const patch = fs.existsSync(file(`patches/${NAME}`)) ? fs.readFileSync(file(`patches/${NAME}`), 'utf8') : '';
const added = patch.split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++')).join('\n');

test('patch 0110 follows 0109 in the desktop lane', () => {
  const lane = JSON.parse(fs.readFileSync(file('lanes/desktop.json'), 'utf8')).patches.map(p => p.split('/').pop());
  assert.equal(lane.indexOf(NAME), lane.indexOf('0109-blanc-default-browser-dialog.patch') + 1);
});

test('the Restore button takes the Sunrise accent in light and dark', () => {
  assert.match(patch, /^\+\+\+ b\/chrome\/browser\/ui\/views\/session_crashed_bubble_view\.cc$/m);
  assert.match(added, /GetOkButton\(\)/);
  assert.match(added, /SkColorSetRGB\(0x80, 0x5d, 0x28\)/, 'light accent #805d28');
  assert.match(added, /SkColorSetRGB\(0xd4, 0xad, 0x66\)/, 'dark accent #d4ad66');
  assert.match(added, /SkColorSetRGB\(0x17, 0x13, 0x0f\)/, 'dark on-accent #17130f');
  assert.match(added, /SetBgColorOverrideDeprecated/);
  assert.match(added, /SetEnabledTextColors/);
  assert.match(added, /color_utils::IsDark/, 'light or dark from the bubble\'s own background');
});
