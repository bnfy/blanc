// The clock gives way while Customize is open (shipping #1625, owner,
// 2026-11-18): Customize never covers the clock, so the clock scales down from
// its top, never below half size, just enough for Customize to show
// everything, and the line under it moves up with it. It grows back after
// Customize has faded, and at once for Font & color, whose sheet shows the
// clock at its real size. The iPhone's glass clock, placed from the clock's
// box on screen, is never drawn from a smaller or easing clock.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const island = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../blanc/island');
const js = fs.readFileSync(path.join(island, 'pages/newtab.js'), 'utf8');
const css = fs.readFileSync(path.join(island, 'pages/newtab-prototype.css'), 'utf8');
const body = name => js.match(new RegExp(`function ${name}\\([^)]*\\) \\{([\\s\\S]*?)\\n\\}`))?.[1] ?? '';

test('Customize is capped to the room under the smaller clock, with no floor', () => {
  const fit = body('fitCustomizeBelowClock');
  assert.doesNotMatch(fit, /Math\.max\(260/);
  assert.match(fit, /popover\.style\.maxHeight = `\$\{Math\.max\(0, Math\.floor\(roomAt\(scale\)\)\)\}px`;/);
});

test('the clock scales just enough for Customize, from its top, never below half', () => {
  const fit = body('fitCustomizeBelowClock');
  assert.match(js, /const CUSTOMIZE_CLOCK_MIN_SCALE = 0\.5;/);
  assert.match(fit, /if \(open && cols\) customizeNeeded = cols\.scrollHeight \+ \(popover\.offsetHeight - cols\.clientHeight\);/);
  // A later opening makes room before its first frame with the last height.
  assert.match(fit, /if \(\(open \|\| \(opening && customizeNeeded > 0\)\) && clockHeight > 0\) \{/);
  assert.match(js, /fitCustomizeBelowClock\(\{ opening: true \}\);/);
  assert.match(fit, /scale = Math\.min\(1, Math\.max\(CUSTOMIZE_CLOCK_MIN_SCALE, fits\)\);/);
  assert.match(fit, /setCustomizeClock\(scale, clockHeight \* \(1 - scale\)\);/);
  assert.match(css, /\.bb-clock-row \{\s*transform: translateX\(var\(--clock-optical, 0px\)\) scale\(var\(--customize-clock-scale, 1\)\);\s*transform-origin: top center;/);
  assert.match(css, /#bbBlocked \{ transform: translateY\(var\(--customize-clock-lift, 0px\)\); \}/);
  assert.match(css, /\.start-customize-popover\.closing-now \{ transition: none; \}/);
});

test('the clock grows back after Customize fades, and at once for Font & color', () => {
  assert.match(body('returnCustomizeClock'), /customizeClockReturn = setTimeout\(\(\) => \{[\s\S]*?\}, 170\);/);
  const sheet = body('openClockSheet');
  assert.ok(sheet.indexOf("customize.classList.add('closing-now')") < sheet.indexOf('customize.hidePopover()'));
  assert.ok(sheet.indexOf('returnCustomizeClock({ now: true })') < sheet.indexOf('clockPopover.showPopover()'));
  assert.match(css, /body\.customize-clock-easing \.bb-clock-row,\s*body\.customize-clock-easing #bbBlocked \{ transition: transform 240ms var\(--start-ease\); \}/);
});

test('the native glass clock is drawn only from the clock at rest', () => {
  assert.match(body('customizeClockAtRest'), /customizeClockScale === 1 && !document\.body\.classList\.contains\('customize-clock-easing'\)/);
  assert.match(js, /blancNativeClock\?\.render\(glass && customizeClockAtRest\(\) &&/);
  // Redrawn when the scale changes, and after the ease when it eases back.
  assert.match(body('setCustomizeClock'), /if \(changed && !document\.body\.classList\.contains\('customize-clock-easing'\)\) scheduleClockArt\(\);/);
  assert.match(body('returnCustomizeClock'), /classList\.remove\('customize-clock-easing'\);\s*scheduleClockArt\(\);/);
});

test('the Android copy carries the same page', () => {
  const android = path.resolve(island, '../android/pages/start');
  assert.equal(fs.readFileSync(path.join(android, 'newtab.js'), 'utf8'), js);
  assert.equal(fs.readFileSync(path.join(android, 'newtab-prototype.css'), 'utf8'), css);
});
