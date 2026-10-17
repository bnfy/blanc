const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const main = fs.readFileSync(path.join(ROOT, 'src/main/main.js'), 'utf8');

test('the hover timer stays bound to its owning focused window', () => {
  assert.match(main, /runtime\.window\.isFocused\(\)/);
  assert.match(main, /setTimeout\(bindWindowRuntime\(runtime, \(\) => \{/);
  assert.match(main, /!islandHoverEligible\(runtime\) \|\| !pointInRect\(hover\.point, runtime\.islandRect\)/);
});

test('closing the panel samples and disarms a pointer already over the Island', () => {
  assert.match(main, /updateIslandHover\(rt\(\), point, \{ sampled: true \}\)/);
});

test('blur, disabled settings, and native menus suppress hover opening', () => {
  assert.match(main, /window\.on\('blur',[\s\S]*?suppressIslandHover\(runtime\)/);
  assert.match(main, /if \(!s\.islandHoverOpen\) \{[\s\S]*?suppressIslandHover\(runtime\)/);

  for (const file of ['src/main/tab-context-menu.js', 'src/main/group-context-menu.js']) {
    const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
    assert.match(source, /menu-will-show/);
    assert.match(source, /suppressIslandHover/);
  }
});
