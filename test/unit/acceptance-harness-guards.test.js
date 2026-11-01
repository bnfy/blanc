'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

// The request-window reset hides the sync budget from the step that calls it,
// so only the measured steps may use it, and never a scenario that tests the
// budget or the automatic sync (design: 2026-10-27-acceptance-gate-speed, §1).
const stepsPath = path.join(__dirname, '..', 'desktop', 'steps', 'shared-spaces.steps.js');
const src = fs.readFileSync(stepsPath, 'utf8');

/** The source of one step definition, up to the next definition. */
function stepBody(name) {
  const start = src.indexOf(`'${name}'`);
  assert.notEqual(start, -1, `step "${name}" is defined`);
  const rest = src.slice(start);
  const next = rest.slice(1).search(/^(When|Then|Given)\(/m);
  return next === -1 ? rest : rest.slice(0, next + 1);
}

const RESETTING_STEPS = [
  'device B closes the background Work tab',
  'device B closes the active Work tab',
  'the restored client retries the missing index entry',
  'the relaunched client applies the held navigation and keeps every Work tab',
];

/** Helpers that reset for the steps calling them, and those steps. */
const RESETTING_HELPERS = ['sharedCopy'];
const SHARED_COPY_STEPS = [
  'the {string} group keeps the {word} Work tab here and in the shared copy',
  'the shared copy has the group {string} colored {string} holding the first Work tab',
  'the shared copy has the group {string} colored {string} holding both Work tabs',
  'a Shared Spaces fixture whose shared Work Space has the first Work tab in a group {string}',
];

/** The source of one helper function, up to the next top-level line. */
function helperBody(name) {
  const start = src.indexOf(`async function ${name}(`);
  assert.notEqual(start, -1, `helper ${name} is defined`);
  const rest = src.slice(start);
  return rest.slice(0, rest.indexOf('\n}') + 2);
}

/** Every file under test/desktop, so a caller in another step file or in
 * the peer driver cannot slip past the count. */
function desktopSources(dir = path.join(__dirname, '..', 'desktop')) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return desktopSources(full);
    return /\.(c?js|mjs)$/.test(entry.name) ? [full] : [];
  });
}

test('only the measured in-scenario budget waits reset the request window', () => {
  const callers = desktopSources().filter((file) => /resetRequestWindow/.test(fs.readFileSync(file, 'utf8')));
  assert.deepEqual(callers, [stepsPath]);
  assert.equal(src.match(/resetRequestWindow/g).length, RESETTING_STEPS.length + RESETTING_HELPERS.length);
  for (const step of RESETTING_STEPS) assert.ok(stepBody(step).includes('resetRequestWindow'), step);
  for (const helper of RESETTING_HELPERS) assert.ok(helperBody(helper).includes('resetRequestWindow'), helper);
  const copyCallers = [...src.matchAll(/^(?:When|Then|Given)\('([^']+)'/gm)].map((m) => m[1]).filter((name) => stepBody(name).includes('sharedCopy(this'));
  assert.deepEqual(copyCallers.sort(), [...SHARED_COPY_STEPS].sort());
});

test('the budget and automatic-sync scenarios never reset the window', () => {
  for (const step of [
    'the account storage is full and I delete Work',
    'the next encrypted write succeeds without waiting for retention expiry',
    'the complete clients stay within their request budgets',
    'both complete clients exchange quiet tabs in both directions',
  ]) {
    assert.ok(!stepBody(step).includes('resetRequestWindow'), step);
    assert.ok(!stepBody(step).includes('sharedCopy(this'), step);
  }
  assert.ok(!src.slice(src.indexOf('async function editPeer'), src.indexOf("When('device B adds a tab to Work'")).includes('resetRequestWindow'), 'editPeer, shared by every remote-edit step');
});
