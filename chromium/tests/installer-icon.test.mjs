// The online installer's taskbar icon (owner, 2026-11-21: "plain Sunrise"):
// once the install window shows its logo, its ICON_BIG must be the window's own
// IDI_APP icon, unbadged. The probe (chromium/windows/installer-window-icon.ps1)
// reports what it read; iconVerdict decides.
import test from 'node:test';
import assert from 'node:assert/strict';
import {iconVerdict} from './lib/installer-icon.mjs';

test('the plain app icon passes', () => {
  assert.deepEqual(iconVerdict({seen: true, size: 32, meanDifference: 0}), {ok: true, reason: 'the taskbar icon is the window\'s own app icon (32 px)'});
});

test('a badged icon fails', () => {
  const v = iconVerdict({seen: true, size: 32, meanDifference: 41.7});
  assert.equal(v.ok, false);
  assert.match(v.reason, /differs from the app icon/);
});

test('an install window never seen with its logo fails', () => {
  assert.deepEqual(iconVerdict(null), {ok: false, reason: 'the install window never showed its logo, so its taskbar icon was not read'});
});

test('a probe without a size or difference fails', () => {
  assert.equal(iconVerdict({seen: true}).ok, false);
});
