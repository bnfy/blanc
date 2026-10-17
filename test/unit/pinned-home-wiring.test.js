const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const main = fs.readFileSync(path.join(ROOT, 'src/main/main.js'), 'utf8');
const hook = fs.readFileSync(path.join(ROOT, 'src/main/test-hook.js'), 'utf8');

function namedSection(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.notEqual(from, -1, `missing ${start}`);
  assert.notEqual(to, -1, `missing ${end}`);
  return source.slice(from, to);
}

function callSignatures(source, name) {
  const calls = [];
  const needle = `${name}(`;
  let cursor = 0;
  while ((cursor = source.indexOf(needle, cursor)) !== -1) {
    const start = cursor;
    let depth = 0;
    let quote = null;
    let lineComment = false;
    let blockComment = false;
    let escaped = false;
    for (let index = cursor + name.length; index < source.length; index += 1) {
      const char = source[index];
      const next = source[index + 1];
      if (lineComment) {
        if (char === '\n') lineComment = false;
        continue;
      }
      if (blockComment) {
        if (char === '*' && next === '/') { blockComment = false; index += 1; }
        continue;
      }
      if (quote) {
        if (escaped) { escaped = false; continue; }
        if (char === '\\') { escaped = true; continue; }
        if (char === quote) quote = null;
        continue;
      }
      if (char === '/' && next === '/') { lineComment = true; index += 1; continue; }
      if (char === '/' && next === '*') { blockComment = true; index += 1; continue; }
      if (char === "'" || char === '"' || char === '`') { quote = char; continue; }
      if (char === '(') depth += 1;
      if (char === ')' && --depth === 0) {
        calls.push(source.slice(start, index + 1));
        cursor = index + 1;
        break;
      }
    }
  }
  return calls;
}

test('startup decides clean recovery once and substitutes homes before filtering', () => {
  const startup = namedSection(
    main,
    'const { windows, activeWindowId, readOnly } = loadWorkspace',
    'if (!savedWindows.length)'
  );
  const decision = startup.indexOf('const cleanStart = !diagnostics.sessionRecoveryPending();');
  const inventory = startup.indexOf('const savedWindows = windows');
  const substitution = startup.indexOf('applyPinnedHomes(saved, { cleanStart })');
  const filtering = startup.indexOf('filterRestoredSession(');
  assert.ok(decision !== -1 && decision < inventory);
  assert.ok(substitution !== -1 && substitution < filtering);
  assert.equal((main.match(/diagnostics\.sessionRecoveryPending\(\)/g) ?? []).length, 1);
});

test('every createTab path carrying a custom title also carries its pinned home', () => {
  const relevant = callSignatures(main, 'createTab').filter((call) => call.includes('customTitle'));
  assert.ok(relevant.length >= 5, 'expected the createTab signature and all restore paths');
  for (const call of relevant) assert.match(call, /pinnedHomeUrl/);

  const duplicate = namedSection(main, 'function duplicateTab(id)', '// --- Quiet Tabs hooks');
  assert.match(duplicate, /pinnedHomeUrl:\s*source\.pinnedHomeUrl/);
});

test('the tab record and acceptance hook expose the home only inside main', () => {
  const create = namedSection(main, 'function createTab(', 'function startPageViewVisible(');
  assert.match(create, /const pinnedHome = pinned\s*\?/);
  assert.match(create, /pinnedHomeUrl:\s*pinnedHome/);
  assert.match(hook, /pinnedHome\(tabId\)[\s\S]*?pinnedHomeUrl/);

  const serialize = namedSection(main, 'function serializeTabs()', 'function broadcastTabs()');
  assert.doesNotMatch(serialize, /pinnedHomeUrl/);
});
