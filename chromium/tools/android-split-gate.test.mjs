// split-gate.sh runs one gate across the build server's two emulators: lane 2 takes LANE2's steps,
// lane 1 every other, through gate-lib.sh's gate_wants. The two lanes must add up to the whole gate.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const dir = fileURLToPath(new URL('../tests/android/', import.meta.url));
const wants = (name, env) => {
  try {
    execFileSync('bash', ['-c', `source "${dir}gate-lib.sh"; gate_wants "$1"`, '_', name], {env: {PATH: process.env.PATH, ...env}});
    return true;
  } catch { return false; }
};
const LANE2 = /LANE2=\$\{BLANC_LANE2_STEPS:-"([^"]+)"\}/.exec(fs.readFileSync(`${dir}split-gate.sh`, 'utf8'))[1];
// Every step a gate names literally (`run <name> …`), and the A2 gate's looped checks.
const steps = fs.readdirSync(dir).filter(f => /^a\d\w*-gate\.sh$/.test(f)).flatMap(f => {
  const text = fs.readFileSync(dir + f, 'utf8');
  const literal = [...text.matchAll(/^\s*run ([a-z][\w-]*) /gm)].map(m => m[1]);
  const looped = [...text.matchAll(/^for check in ([^;]+); do/gm)].flatMap(m => m[1].trim().split(/\s+/));
  return [...literal, ...looped];
});

test('with no choice made, a gate runs every step, as before', () => {
  for (const name of ['sync', 'pages', 'a4-gate']) assert.equal(wants(name, {}), true);
});

test('lane 1 and lane 2 each run every step exactly once between them', () => {
  for (const name of steps.filter(s => !s.endsWith('-gate'))) {
    const one = wants(name, {BLANC_GATE_SKIP: LANE2}), two = wants(name, {BLANC_GATE_ONLY: LANE2});
    assert.equal(one !== two, true, `${name}: lane 1 ${one}, lane 2 ${two}`);
  }
});

test('both lanes go down through every lower gate', () => {
  for (const name of steps.filter(s => s.endsWith('-gate'))) {
    assert.equal(wants(name, {BLANC_GATE_SKIP: LANE2}), true);
    assert.equal(wants(name, {BLANC_GATE_ONLY: LANE2}), true);
  }
});

test('lane 2 names only steps the gates have, so it never runs empty by a typo', () => {
  for (const name of LANE2.split(/\s+/)) assert.ok(steps.includes(name), `${name} is no gate's step`);
});

test('a name that only contains another isn\'t taken for it', () => {
  assert.equal(wants('spaces', {BLANC_GATE_ONLY: 'shared-spaces'}), false);
  assert.equal(wants('shared-spaces', {BLANC_GATE_SKIP: 'spaces'}), true);
});
