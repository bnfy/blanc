// The four cases the first Windows nightly (20261122-0400, build 905) passed
// only on its rerun: glance:337, island-and-commands:61 and :115 and
// vertical-tabs:146. Each is a harness or Island difference Windows shares
// with Linux, not with the Mac.
import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePointer, pointerProbe, pointerMover, clearPointerSpot} from './lib/real-pointer.mjs';
import {quietTab} from './adapters/tabs.mjs';
import {windowLayoutSteps, moveOffSettledPanel} from './fork-steps/window-layout.mjs';

test('Windows reads the real pointer, so hover cases move the window clear of it', () => {
  const probe = pointerProbe('win32');
  assert.equal(probe.file, 'powershell.exe');
  assert.match(probe.args.join(' '), /Cursor\]::Position/);
  assert.ok(pointerProbe('darwin'));
  assert.equal(pointerProbe('linux'), null);
  assert.deepEqual(parsePointer('1215,183\r\n'), {x: 1215, y: 183});
  assert.equal(parsePointer(''), null);
  assert.equal(parsePointer('x,y'), null);
});

test('a hosted Windows runner moves the real pointer when no window placement clears it', () => {
  // Run 45036181468: the runner's pointer rested at (650, 570), inside the
  // 1280x800 window, with no room for the window on any side of it.
  const bounds = {left: 8, top: 8, width: 1280, height: 800};
  const screen = {left: 0, top: 0, width: 1920, height: 1080};
  const spot = clearPointerSpot(bounds, screen);
  assert.ok(spot.x > 8 + 1280 + 40 || spot.y > 8 + 800 + 40, JSON.stringify(spot));
  assert.ok(spot.x < 1920 && spot.y < 1080);
  assert.equal(clearPointerSpot({left: 0, top: 0, width: 1920, height: 1080}, screen), null);
  const mover = pointerMover('win32', {GITHUB_ACTIONS: 'true'});
  assert.equal(mover(spot).file, 'powershell.exe');
  assert.match(mover(spot).args.join(' '), new RegExp(`Point\\(${spot.x}, ${spot.y}\\)`));
  // Never a person's pointer: not outside Actions, never on the Mac.
  assert.equal(pointerMover('win32', {}), null);
  assert.equal(pointerMover('darwin', {GITHUB_ACTIONS: 'true'}), null);
  assert.equal(pointerMover('linux', {GITHUB_ACTIONS: 'true'}), null);
});

function quietWorld() {
  const sessions = {held: {cdp: {closed: false, close() { this.closed = true; }}, targetId: 'held'},
    quiet: {cdp: {closed: false, close() { this.closed = true; }}, targetId: 'quiet'}};
  const calls = [];
  const w = {
    heldLoadingPages: [sessions.held],
    native: async name => (assert.equal(name, 'tabTargets'), {7: 'quiet', 3: 'held'}),
    app: {refresh: async () => {}, windows: () => Object.values(sessions), releasePages() { calls.push('releasePages'); }},
    api: async (name, args) => (calls.push([name, ...args]), true),
  };
  return {w, sessions, calls};
}

test('quieting a tab on Windows keeps another tab\'s held loading response', async () => {
  const {w, sessions, calls} = quietWorld();
  assert.equal(await quietTab(w, '7', 'win32'), true);
  assert.equal(sessions.quiet.cdp, null, 'the quieted tab detaches');
  assert.equal(sessions.held.cdp.closed, false, 'the loading tab keeps its interception');
  assert.deepEqual(calls, [['quietTab', '7']]);
});

test('quieting a tab on the Mac still releases every page', async () => {
  const {w, calls} = quietWorld();
  assert.equal(await quietTab(w, '7', 'darwin'), true);
  assert.deepEqual(calls, ['releasePages', ['quietTab', '7']]);
});

test('Windows moves off a hover-opened panel only after it settles', () => {
  assert.equal(windowLayoutSteps('win32').get('I move the pointer off the panel'), moveOffSettledPanel);
  assert.equal(windowLayoutSteps('linux').get('I move the pointer off the panel'), moveOffSettledPanel);
  assert.equal(windowLayoutSteps('darwin').has('I move the pointer off the panel'), false);
  // The GTK Space-editor steps stay Linux's own.
  assert.equal(windowLayoutSteps('win32').has('I open the color picker for {string}'), false);
  assert.ok(windowLayoutSteps('linux').has('I open the color picker for {string}'));
});

// island-and-commands:49 on slower hosted runners (runs 45037224663 and
// 45039655461): each move waited for the host's state, so the shipping
// step's 600 ms ran out before the 300 ms dwell's panel was seen.
function motionWorld({openAfter = 4, slowMove = -1} = {}) {
  const moves = [];
  let modeCalls = 0;
  return {moves, world: {
    hoverIslandRect: {x: 300, y: 10, width: 120, height: 28},
    call: async (name, input) => {
      if (name === 'sendChromeMouseInput') {
        moves.push(input);
        if (moves.length === slowMove) await new Promise(resolve => setTimeout(resolve, 320));
        return true;
      }
      assert.equal(name, 'overlayMode');
      return ++modeCalls > openAfter ? 'panel' : null;
    },
  }};
}

test('Windows keeps moving inside the Island until the panel opens', async () => {
  const {world, moves} = motionWorld();
  const run = windowLayoutSteps('win32').get('I move within the Island every 50 milliseconds');
  await run.call(world);
  assert.equal(world.hoverOpenedDuringMotion, true);
  assert.ok(moves.length >= 4);
  assert.ok(moves.every(m => m.type === 'mouseMove' && m.y === 24 && Math.abs(m.x - 360) <= 10));
  assert.equal(windowLayoutSteps('darwin').has('I move within the Island every 50 milliseconds'), false);
});

test('a gap as long as the dwell between moves proves nothing, so it fails', async () => {
  const {world} = motionWorld({slowMove: 2});
  await assert.rejects(windowLayoutSteps('win32').get('I move within the Island every 50 milliseconds').call(world), /dwell/);
});

test('a panel that never opens while moves continue is reported, not passed', async () => {
  const {world} = motionWorld({openAfter: Infinity});
  await windowLayoutSteps('win32').get('I move within the Island every 50 milliseconds').call(world);
  assert.equal(world.hoverOpenedDuringMotion, false);
});

// Run 45040670757: a 330 ms gap, because each move waited for the panel check.
test('a slow panel check does not widen the gap between moves', async () => {
  let checks = 0;
  const world = {
    hoverIslandRect: {x: 300, y: 10, width: 120, height: 28},
    call: async name => {
      if (name === 'sendChromeMouseInput') return true;
      await new Promise(resolve => setTimeout(resolve, 280));
      return ++checks >= 2 ? 'panel' : null;
    },
  };
  await windowLayoutSteps('win32').get('I move within the Island every 50 milliseconds').call(world);
  assert.equal(world.hoverOpenedDuringMotion, true);
});
