'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  LEAVE_GRACE_MS, CARD_SLACK_PX, initialLeaveState, pointNearCard, leaveStep,
} = require('../../src/renderer/hover-panel-leave');

const opened = (hoverOpened = true) => leaveStep(initialLeaveState(), { type: 'open', hoverOpened });
const move = (state, inside) => leaveStep(state, { type: 'move', inside });

test('only a hover-opened panel is watched', () => {
  assert.equal(opened(true).state.watching, true);
  const clicked = opened(false);
  assert.equal(clicked.state.watching, false);
  assert.equal(move(clicked.state, false).effect, null);
  assert.equal(leaveStep(clicked.state, { type: 'exit' }).effect, null);
});

test('leaving the card starts one grace period; returning cancels it', () => {
  const out = move(opened().state, false);
  assert.equal(out.effect, 'start');
  assert.equal(move(out.state, false).effect, null, 'motion outside does not restart the grace');
  const back = move(out.state, true);
  assert.equal(back.effect, 'cancel');
  assert.equal(back.state.watching, true);
  assert.equal(leaveStep(back.state, { type: 'fired' }).effect, null);
});

test('a grace period that runs out closes the panel once', () => {
  const out = move(opened().state, false);
  const fired = leaveStep(out.state, { type: 'fired' });
  assert.equal(fired.effect, 'close');
  assert.equal(fired.state.watching, false);
  assert.equal(leaveStep(fired.state, { type: 'fired' }).effect, null);
});

test('leaving the overlay view counts as leaving the card', () => {
  const exited = leaveStep(opened().state, { type: 'exit' });
  assert.equal(exited.effect, 'start');
  assert.equal(leaveStep(exited.state, { type: 'fired' }).effect, 'close');
});

test('typing or clicking in the panel keeps it open for good', () => {
  const out = move(opened().state, false);
  const used = leaveStep(out.state, { type: 'interact' });
  assert.equal(used.effect, 'cancel');
  assert.equal(used.state.watching, false);
  assert.equal(move(used.state, false).effect, null);
  assert.equal(leaveStep(used.state, { type: 'fired' }).effect, null);
  assert.equal(leaveStep(opened().state, { type: 'interact' }).effect, null, 'nothing pending to cancel');
});

test('closing the overlay any other way stops the watch', () => {
  const out = move(opened().state, false);
  const closed = leaveStep(out.state, { type: 'close' });
  assert.equal(closed.effect, 'cancel');
  assert.equal(closed.state.watching, false);
  assert.equal(leaveStep(closed.state, { type: 'fired' }).effect, null);
});

test('reopening by click after a hover open is no longer watched', () => {
  const out = move(opened().state, false);
  const reopened = leaveStep(out.state, { type: 'open', hoverOpened: false });
  assert.equal(reopened.effect, 'cancel');
  assert.equal(reopened.state.watching, false);
});

test('the card counts its slack, and nothing counts without a card', () => {
  const card = { left: 100, top: 10, right: 500, bottom: 300 };
  assert.equal(pointNearCard({ x: 300, y: 100 }, card), true);
  assert.equal(pointNearCard({ x: 100 - CARD_SLACK_PX, y: 10 - CARD_SLACK_PX }, card), true);
  assert.equal(pointNearCard({ x: 100 - CARD_SLACK_PX - 1, y: 100 }, card), false);
  assert.equal(pointNearCard({ x: 300, y: 300 + CARD_SLACK_PX + 1 }, card), false);
  assert.equal(pointNearCard({ x: 300, y: 100 }, null), false);
  assert.equal(pointNearCard({ x: 300, y: 100 }, { left: 0, top: 0, right: 0, bottom: 0 }), false);
  assert.equal(pointNearCard(null, card), false);
});

test('the grace is short enough to reach the strip and grab it', () => {
  assert.ok(LEAVE_GRACE_MS > 0 && LEAVE_GRACE_MS <= 250);
});

test('wiring: main marks hover opens; the overlay watches and closes them', () => {
  const root = path.join(__dirname, '../../src');
  const main = fs.readFileSync(path.join(root, 'main/main.js'), 'utf8');
  const overlay = fs.readFileSync(path.join(root, 'renderer/overlay.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'renderer/overlay.html'), 'utf8');
  assert.match(main, /if \(fired\.effect === 'open'\) showOverlay\('panel', \{ purpose: \{ hoverOpened: true \} \}\);/);
  assert.match(html, /<script src="hover-panel-leave\.js"><\/script>\s*(<script[^>]*><\/script>\s*)*<script src="overlay\.js"><\/script>/);
  assert.match(overlay, /hoverOpened: next === 'panel' && purpose\?\.hoverOpened === true/);
  assert.match(overlay, /window\.browserAPI\.closeOverlay\('hover-leave'\)/);
  // The pointer has already left the panel; a retract would keep the overlay
  // view over the strip for OVERLAY_RETRACT_MS, swallowing the next press.
  assert.match(main, /const retracts = \(closingMode === 'panel' \|\| closingMode === 'palette'\) && reason !== 'hover-leave';/);
});
