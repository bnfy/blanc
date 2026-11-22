// The phones' Start Page shrinks its clock about the clock's middle. The shared page (desktop's
// Customize, #1622) scales the clock row from its top and lifts the line under it; the phones keep
// their own layout, so a shrunk clock rode up over the date whenever shortcuts were on show
// (Android 1.0.0-beta.4, iOS 1.1 before release).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

// The declarations of the phone's resting-layout rule for `selector`.
function rule(css, platform, selector) {
  const head = `html[data-platform="${platform}"] body:not(:has(#clockPopover:popover-open)) ${selector} {`;
  const start = css.indexOf(head);
  assert.notEqual(start, -1, `${platform}: no resting rule for ${selector}`);
  return css.slice(start + head.length, css.indexOf('}', start));
}

const phones = [
  ['android', 'chromium/blanc/android/pages-adapter/android-start.css'],
  ['ios', 'ios/Blanc/Blanc/StartPage/ios-start.css'],
];

for (const [platform, file] of phones) {
  test(`${platform}: the clock shrinks about its middle`, () => {
    const row = rule(read(file), platform, '.bb-clock-row');
    assert.match(row, new RegExp(`transform:\\s*translateY\\(-50%\\)\\s*scale\\(var\\(--${platform}-clock-fit, 1\\)\\)`));
    assert.match(row, /transform-origin:\s*center\s*;/);
  });

  test(`${platform}: the line under the clock isn't lifted by desktop's Customize`, () => {
    assert.match(rule(read(file), platform, '.bb-blocked'), /transform:\s*none\s*;/);
  });
}

test('the shared page still scales from the top, which is why the phones set their own origin', () => {
  const shared = read('chromium/blanc/android/pages/start/newtab-prototype.css');
  assert.match(shared, /\.bb-clock-row\s*\{[^}]*transform-origin:\s*top center/);
  assert.match(shared, /#bbBlocked\s*\{\s*transform:\s*translateY\(var\(--customize-clock-lift/);
});
