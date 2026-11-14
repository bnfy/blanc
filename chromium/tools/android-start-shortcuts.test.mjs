// The emulator check for Billboard's shortcuts (tests/android/start-shortcuts.mjs) fails each way
// the shortcuts can be wrong.
import test from 'node:test';
import assert from 'node:assert/strict';
import {SHORTCUTS, VISITS, shortcutProblems} from '../tests/android/start-shortcuts.mjs';

const want = {sites: ['c.example', 'a.example', 'b.example'], pinned: ['c.example'], pins: ['c.example']};

test('the shortcuts the page should show pass', () => {
  assert.deepEqual(shortcutProblems(structuredClone(want), want), []);
});

test('each way the shortcuts go wrong is reported', () => {
  assert.deepEqual(shortcutProblems(null, want), ['no Start Page to read']);
  assert.deepEqual(shortcutProblems({error: 'TypeError: x'}, want), ['the Start Page failed: TypeError: x']);
  assert.match(shortcutProblems({...want, sites: ['a.example', 'b.example', 'c.example']}, want)[0], /^sites are/);
  assert.match(shortcutProblems({...want, sites: [...want.sites, 'd.example']}, want)[0], /^sites are/);
  assert.match(shortcutProblems({...want, pinned: []}, want)[0], /^pinned are/);
  assert.match(shortcutProblems({...want, pins: []}, want)[0], /^pins are/);
});

test('the visits rank the sites apart, and the stepper shows fewer than were visited', () => {
  const counts = VISITS.map(([, times]) => times);
  assert.deepEqual(counts, [...counts].sort((a, b) => b - a));
  assert.equal(new Set(counts).size, counts.length);
  assert.ok(SHORTCUTS < VISITS.length);
});
