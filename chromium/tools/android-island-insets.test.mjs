// The Island placement check (tests/android/island-insets.mjs) must fail when
// the pill overlaps a system bar, crowds the sides, grows past 600dp or is
// missing, and pass where the iPhone would put it.
import test from 'node:test';
import assert from 'node:assert/strict';
import {barsOf, boundsOf, placementProblems} from '../tests/android/island-insets.mjs';

const screen = {width: 1080, height: 1920}, density = 3;
const bars = {navigation: {left: 0, top: 1848, right: 1080, bottom: 1920}, status: {left: 0, top: 0, right: 1080, bottom: 72}};
const at = (top, bottom, left = 48, right = 1032) => ({left, top, right, bottom});

test('where the iPhone puts it passes, bottom and top', () => {
  assert.deepEqual(placementProblems({pill: at(1674, 1818), screen, bars, density, position: 'bottom'}), []);
  assert.deepEqual(placementProblems({pill: at(102, 246), screen, bars, density, position: 'top'}), []);
});

test('overlapping a bar fails', () => {
  assert.match(placementProblems({pill: at(1700, 1880), screen, bars, density, position: 'bottom'})[0], /navigation bar/);
  assert.match(placementProblems({pill: at(60, 204), screen, bars, density, position: 'top'})[0], /status bar/);
});

test('crowding the sides or growing past 600dp fails', () => {
  assert.match(placementProblems({pill: at(1674, 1818, 10, 1070), screen, bars, density, position: 'bottom'}).join(), /16dp/);
  const wide = {width: 2400, height: 1080};
  assert.match(placementProblems({pill: at(800, 944, 100, 2300), screen: wide, bars: {}, density, position: 'bottom'}).join(), /600dp/);
});

test('a missing Island fails', () => {
  assert.deepEqual(placementProblems({pill: null, screen, bars, density, position: 'bottom'}), ['the Island is not on screen']);
});

test('reads UI Automator bounds and dumpsys bars', () => {
  assert.deepEqual(boundsOf('<node resource-id="me.bnfy.blanc.dev:id/blanc_island_pill" bounds="[48,1674][1032,1818]" />', 'blanc_island_pill'), at(1674, 1818));
  assert.equal(boundsOf('<node resource-id="x:id/other" bounds="[0,0][1,1]" />', 'blanc_island_pill'), null);
  const d = 'InsetsSource id=1 type=navigationBars frame=[0,1848][1080,1920] visible=true\nInsetsSource id=2 type=statusBars frame=[0,0][1080,72] visible=true';
  assert.deepEqual(barsOf(d), bars);
});
