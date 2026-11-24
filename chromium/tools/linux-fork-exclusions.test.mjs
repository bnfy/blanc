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
  const decisions = [
    [4, 'private-tabs', 40, /security key.*phone/i],
    [5, 'settings-and-theming', 12, /stored.*icon/i],
    [5, 'supporter-and-session', 7, /sunrise-dark/i],
    [5, 'supporter-and-session', 12, /patron.*ember/i],
    [6, 'island-and-commands', 320, /caption buttons/i],
  ];
  for (const [number, file, line, subject] of decisions) {
    const [id] = feature(file, line);
    const reason = linuxForkExclusions[id] ?? '';
    assert.match(reason, new RegExp('Linux L2 decision ' + number));
    assert.match(reason, subject);
    expected[id] = reason;
  }
  assert.deepEqual(linuxForkExclusions, expected);
});
