import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { linuxForkExclusions } from '../tests/linux-fork-exclusions.mjs';
import { windowsForkExclusions } from '../tests/windows-fork-exclusions.mjs';

test('each Linux exclusion names an inventory case and gives a reason', () => {
  const inventory = JSON.parse(fs.readFileSync(new URL('../scenarios/inventory.json', import.meta.url)));
  const ids = new Set(inventory.scenarios.flatMap(scenario => scenario.cases.map(c => c.id)));
  for (const [id, reason] of Object.entries(linuxForkExclusions)) {
    assert.ok(ids.has(id), id);
    assert.match(reason, /\S/, id);
  }
});

test('Linux excludes exactly the shared decisions and gives its own updater reason', () => {
  const feature = (name, ...lines) => lines.map(line => `spec/acceptance/${name}.feature:${line}:plain`);
  const shared = [
    ...feature('glance', 187, 197),
    ...feature('platform-services', 50, 64, 76, 88, 98, 105, 112),
    ...feature('reader-mode', 7, 13, 20),
    ...feature('settings-and-theming', 49, 57, 65, 74),
    ...feature('navigation-and-context-menu', 83),
    ...feature('local-profiles', 17),
    'spec/acceptance/quiet-tabs.feature:28:example-45',
  ];
  const expected = Object.fromEntries(shared.map(id => [id, windowsForkExclusions[id]]));
  expected['spec/acceptance/platform-services.feature:25:plain'] =
    "The test build has no updater; Linux betas update through apt and dnf from Blanc's repository (spec owner decision 2), proven at L3.";
  assert.deepEqual(linuxForkExclusions, expected);
});
