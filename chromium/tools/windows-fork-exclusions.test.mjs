import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {windowsForkExclusions} from '../tests/windows-fork-exclusions.mjs';
import {macosForkExclusions} from '../tests/macos-fork-exclusions.mjs';

const feature = (name, ...lines) => lines.map(line => `spec/acceptance/${name}.feature:${line}`);
// W2 Task B1: the owner's product decisions, which hold on every platform,
// and the one Linux-only case. The Mac's three "Windows/Linux-only UI"
// exclusions are not here: on Windows they are work (Task C2).
const EXPECTED = [
  ...feature('glance', '187:plain', '197:plain'),
  ...feature('platform-services', '50:plain', '64:plain', '76:plain', '88:plain', '98:plain', '105:plain', '112:plain'),
  ...feature('reader-mode', '7:plain', '13:plain', '20:plain'),
  ...feature('settings-and-theming', '49:plain', '57:plain', '65:plain', '74:plain'),
  ...feature('platform-services', '25:plain'),
  ...feature('navigation-and-context-menu', '83:plain'),
  ...feature('local-profiles', '17:plain'),
  ...feature('quiet-tabs', '28:example-45'),
  ...feature('private-tabs', '40:plain'),
  ...feature('arc-spaces-import', '53:plain'),
  // W2 C2: the Island draws no window buttons on Windows (owner, W1).
  ...feature('island-and-commands', '320:plain'),
  // W2 B4: Windows has no app icon catalog (owner, 2026-10-19; approved as
  // exclusions 2026-11-18).
  ...feature('settings-and-theming', '12:plain'),
  ...feature('supporter-and-session', '7:plain', '12:plain'),
];
// A case that ran and failed on Windows may be excluded only where the
// failure is the decided behavior itself.
const EXECUTED_BY_DECISION = new Set([...feature('navigation-and-context-menu', '83:plain'),
  ...feature('settings-and-theming', '12:plain'), ...feature('supporter-and-session', '7:plain', '12:plain')]);

test('Windows excludes exactly the owner\'s product decisions and the Linux-only case', () => {
  assert.deepEqual(Object.keys(windowsForkExclusions).sort(), [...EXPECTED].sort());
});
test('each Windows exclusion was not a pass on Windows and names its decision', () => {
  const baseline = JSON.parse(fs.readFileSync(new URL('../scenarios/baseline-windows-x64-e42f9e5a532cdf96.json', import.meta.url)));
  const cases = new Map(baseline.scenarios.flatMap(s => s.cases).map(c => [c.id, c]));
  for (const [id, reason] of Object.entries(windowsForkExclusions)) {
    assert.equal(cases.get(id)?.result, EXECUTED_BY_DECISION.has(id) ? 'fail' : 'undefined', id);
    assert.match(reason, /Owner decision|V1[28]|Linux|Electron WebContents/, id);
    if (macosForkExclusions[id] && !/Windows\/Linux-only|Touch ID/.test(macosForkExclusions[id])) assert.equal(reason, macosForkExclusions[id], id);
  }
});
