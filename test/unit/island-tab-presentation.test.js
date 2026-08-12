'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(
  path.join(__dirname, '../../src/renderer/renderer.js'),
  'utf8'
);

function extractFunction(name) {
  const start = source.indexOf(`function ${name}()`);
  assert.notEqual(start, -1, `${name} not found in renderer.js`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`could not extract ${name} from renderer.js`);
}

const activeGroupMembers = extractFunction('activeGroupMembers');

function visibleDots(tabs, activeTabId) {
  const sandbox = {
    state: { tabs, activeTabId },
    DOT_CAP: 8,
    activeTab: () => tabs.find((tab) => tab.id === activeTabId) || null,
  };
  vm.runInNewContext(`${activeGroupMembers}\nthis.result = activeGroupMembers();`, sandbox);
  return sandbox.result;
}

test('ungrouped pins stay in the Island dots when a loose tab is active', () => {
  const { shown, hidden } = visibleDots([
    { id: 'loose', groupId: null, pinned: false },
    { id: 'pinned-a', groupId: null, pinned: true },
    { id: 'grouped', groupId: 'work', pinned: true },
    { id: 'pinned-b', groupId: null, pinned: true },
  ], 'loose');

  assert.deepEqual(
    shown.map((tab) => tab.id),
    ['pinned-a', 'pinned-b', 'loose'],
    'all ungrouped tabs remain switchable, with pins first'
  );
  assert.equal(hidden, 0);
});
