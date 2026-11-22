// The real pointer and a test's simulated one are different things. When a
// view appears under the window (the Island panel opening), Chromium re-reads
// the real pointer; if it rests inside the test window, the host sees it
// leave the Island and a hover-opened panel closes, as it should for a
// person. So pointer scenarios move the test WINDOW out from under the real
// pointer. The pointer itself is only read, never moved, except on a hosted
// Windows runner, where nobody is at the mouse and a pointer resting near the
// screen's middle leaves the window no room on any side.
import {execFileSync} from 'node:child_process';
import {nativeCall} from './test-driver.mjs';

// Tried in order: a comfortable gap first, a tight one when the screen is small.
const MARGINS = [40, 8];

// How to read the real pointer on this platform, or null where it can't be.
// Each prints "x,y" in the same units as Chromium's window bounds: macOS
// points from the top left of the main display, and on Windows the logical
// pixels of a process that hasn't declared itself DPI-aware (the hosted
// runners draw at 100%).
export function pointerProbe(platform = process.platform) {
  if (platform === 'darwin') return {file: '/usr/bin/osascript', args: ['-l', 'JavaScript', '-e',
    'ObjC.import("AppKit");var p=$.NSEvent.mouseLocation;var h=$.NSScreen.screens.objectAtIndex(0).frame.size.height;p.x+","+(h-p.y)'], timeout: 5000};
  // PowerShell takes a few seconds to start on a hosted runner.
  if (platform === 'win32') return {file: 'powershell.exe', args: ['-NoProfile', '-NonInteractive', '-Command',
    'Add-Type -AssemblyName System.Windows.Forms; $p = [System.Windows.Forms.Cursor]::Position; "$($p.X),$($p.Y)"'], timeout: 20000};
  return null;
}

export function parsePointer(text) {
  const [x, y] = String(text).trim().split(',').map(part => part.trim() === '' ? NaN : Number(part));
  return Number.isFinite(x) && Number.isFinite(y) ? {x, y} : null;
}

// Where the real pointer is, in screen coordinates from the top left of the
// main display, or null where it can't be read.
export function realPointer() {
  const probe = pointerProbe();
  if (!probe) return null;
  try {
    return parsePointer(execFileSync(probe.file, probe.args, {encoding: 'utf8', timeout: probe.timeout}));
  } catch { return null; }
}

// How to move the real pointer to a point, or null where a person may be at
// the mouse: only a GitHub-hosted Windows runner moves it.
export function pointerMover(platform = process.platform, env = process.env) {
  if (platform !== 'win32' || env.GITHUB_ACTIONS !== 'true') return null;
  return ({x, y}) => ({file: 'powershell.exe', args: ['-NoProfile', '-NonInteractive', '-Command',
    `Add-Type -AssemblyName System.Windows.Forms, System.Drawing; [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${Math.round(x)}, ${Math.round(y)})`],
    timeout: 20000});
}

// A screen corner clear of the window by the comfortable margin, or null.
export function clearPointerSpot(bounds, screen) {
  const margin = MARGINS[0];
  const right = screen.left + screen.width - 2, bottom = screen.top + screen.height - 2;
  return [{x: right, y: bottom}, {x: screen.left + 1, y: bottom}, {x: right, y: screen.top + 1}, {x: screen.left + 1, y: screen.top + 1}]
    .find(p => p.x < bounds.left - margin || p.x > bounds.left + bounds.width + margin ||
      p.y < bounds.top - margin || p.y > bounds.top + bounds.height + margin) ?? null;
}

// Where to put a window so the pointer is outside it (by 40px, or 8px when
// only that fits), staying on the screen: null when the pointer is already
// clear by 8px or nowhere fits.
export function clearOfPointer(pointer, bounds, screen) {
  if (!pointer || !bounds || !screen) return null;
  const tight = MARGINS.at(-1);
  const inside = pointer.x >= bounds.left - tight && pointer.x <= bounds.left + bounds.width + tight &&
    pointer.y >= bounds.top - tight && pointer.y <= bounds.top + bounds.height + tight;
  if (!inside) return null;
  const fits = ({left, top}) => left >= screen.left && top >= screen.top &&
    left + bounds.width <= screen.left + screen.width && top + bounds.height <= screen.top + screen.height;
  for (const margin of MARGINS) {
    const to = [
      {left: Math.floor(pointer.x - margin - bounds.width) - 1, top: bounds.top},
      {left: Math.ceil(pointer.x + margin) + 1, top: bounds.top},
      {left: bounds.left, top: Math.ceil(pointer.y + margin) + 1},
      {left: bounds.left, top: Math.floor(pointer.y - margin - bounds.height) - 1},
    ].find(fits);
    if (to) return to;
  }
  return null;
}

// Moves the fixture's window clear of the real pointer when it can. Returns
// what it found, for the case's record.
export async function avoidRealPointer(fixture) {
  const pointer = realPointer();
  if (!pointer) return {pointer: null, moved: false};
  const snapshot = await nativeCall(fixture.host, 'snapshot');
  const targets = await nativeCall(fixture.host, 'tabTargets');
  const {windowId, bounds} = await fixture.browser.send('Browser.getWindowForTarget', {targetId: targets[String(snapshot.activeTabId)]});
  const screen = await fixture.host.eval('({left:screen.availLeft,top:screen.availTop,width:screen.availWidth,height:screen.availHeight})');
  const to = clearOfPointer(pointer, bounds, screen);
  if (!to) {
    const covered = clearOfPointer(pointer, bounds, {left: -1e9, top: -1e9, width: 2e9, height: 2e9}) !== null;
    const mover = covered && pointerMover();
    const spot = mover && clearPointerSpot(bounds, screen);
    if (!spot) return {pointer, moved: false, covered};
    const move = mover(spot);
    try { execFileSync(move.file, move.args, {stdio: 'ignore', timeout: move.timeout}); } catch { return {pointer, moved: false, covered}; }
    return {pointer, moved: false, covered, pointerMovedTo: spot, now: realPointer()};
  }
  await fixture.browser.send('Browser.setWindowBounds', {windowId, bounds: to});
  return {pointer, moved: true, to};
}
