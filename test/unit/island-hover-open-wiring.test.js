const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const main = fs.readFileSync(path.join(ROOT, 'src/main/main.js'), 'utf8');

test('mouse moves use the cached hover setting instead of rereading settings', () => {
  const eligible = main.slice(
    main.indexOf('function islandHoverEligible(runtime)'),
    main.indexOf('function clearIslandHoverTimer(runtime)')
  );
  assert.match(eligible, /if \(!islandHoverOpen\) return false;/);
  assert.doesNotMatch(eligible, /settings\.getSettings\(\)/);
  assert.match(main, /islandHoverOpen = s\.islandHoverOpen === true;/);
});

test('the hover timer stays bound to its owning focused window', () => {
  assert.match(main, /runtime\.window\.isFocused\(\)/);
  assert.match(main, /setTimeout\(bindWindowRuntime\(runtime, \(\) => \{/);
  assert.match(main, /!islandHoverEligible\(runtime\) \|\| !pointInRect\(hover\.point, runtime\.islandHoverRect\)/);
});

test('closing the panel samples and disarms a pointer already over the Island', () => {
  assert.match(main, /updateIslandHover\(rt\(\), point, \{ sampled: true \}\)/);
});

test('the acceptance cursor override is gated and reset', () => {
  assert.match(main, /acceptanceTestMode && testCursorPoint/);
  assert.match(main, /setTestCursorPoint: \(point\) => \{\s*if \(!acceptanceTestMode\) return false;/);
  const hook = fs.readFileSync(path.join(ROOT, 'src/main/test-hook.js'), 'utf8');
  assert.match(hook, /getPermissionPrompts\(\)\.clear\(\);\s*setTestCursorPoint\(null\);/);
});

test('blur, disabled settings, and native menus suppress hover opening', () => {
  assert.match(main, /window\.on\('blur',[\s\S]*?suppressIslandHover\(runtime\)/);
  assert.match(main, /if \(!islandHoverOpen\) \{[\s\S]*?suppressIslandHover\(runtime\)/);

  for (const file of ['src/main/tab-context-menu.js', 'src/main/group-context-menu.js']) {
    const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
    assert.match(source, /menu-will-show/);
    assert.match(source, /suppressIslandHover/);
  }
});
