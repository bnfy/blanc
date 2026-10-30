'use strict';
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { createLaunchSunrise } = require('./shipping-launch-sunrise.cjs');

let seed = 0x5eed1234;
function rand() { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed >>> 0; }
const cases = [];
const fixed = [
  [[0, 0, 1, 0, 1], [1, 1, 1, 0, 1]],
  [[0, 0, 1, 1, 1], [0, 1, 1, 0, 1], [1, 2, 1, 0, 1]],
  [[0, 0, 1, 0, 0], [0, 1, 1, 0, 1], [1, 2, 1, 0, 1]],
  [[0, 30000, 1, 0, 1]], [[0, 30001, 1, 0, 1], [1, -5, 1, 0, 1]],
  [[0, -100, 1, 0, 1]], [[0, 0, 0, 0, 1], [1, 1, 1, 0, 1]],
];
for (const actions of fixed) cases.push({ start: 100000, actions });
for (let i = 0; i < 10000; i++) {
  const start = 1_000_000 + (rand() % 100000);
  const count = 1 + rand() % 20;
  const actions = [];
  for (let j = 0; j < count; j++) {
    actions.push([rand() % 5, (rand() % 50001) - 10000,
      rand() % 2, rand() % 2, rand() % 2]);
  }
  cases.push({ start, actions });
}
const input = cases.map(({ start, actions }, i) => [i, start, actions.length,
  ...actions.flatMap(([page, delta, enabled, privatePage, visible]) =>
    [page, start + delta, enabled, privatePage, visible])].join(' ')).join('\n') + '\n';
const run = spawnSync(process.argv[2] || path.join(__dirname, 'gate-driver'), { input, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
assert.equal(run.status, 0, run.stderr);
const actual = run.stdout.trimEnd().split('\n');
assert.equal(actual.length, cases.length);
for (const [i, { start, actions }] of cases.entries()) {
  const gate = createLaunchSunrise({ startedAt: start });
  const asked = new Set();
  const expected = actions.map(([page, delta, enabled, privatePage, visible]) => {
    if (asked.has(page)) return '0';
    asked.add(page);
    return gate.take(start + delta, () => ({ enabled: !!enabled, private: !!privatePage, visible: !!visible })) ? '1' : '0';
  }).join('');
  assert.equal(actual[i], expected, `scenario ${i}`);
}
console.log(`${cases.length} shipping-derived sequences matched (boundary, disabled, hidden, private, repeat, multi-page and backward clock included)`);
