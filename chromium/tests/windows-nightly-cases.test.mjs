// The four cases the first Windows nightly (20261122-0400, build 905) passed
// only on its rerun: glance:337, island-and-commands:61 and :115 and
// vertical-tabs:146. Each is a harness or Island difference Windows shares
// with Linux, not with the Mac.
import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePointer, pointerProbe} from './lib/real-pointer.mjs';
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
