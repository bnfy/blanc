// The real pointer and a test's simulated one are different things. When a
// view appears under the window (the Island panel opening), Chromium re-reads
// the real pointer; if it rests inside the test window, the host sees it
// leave the Island and a hover-opened panel closes, as it should for a
// person. So pointer scenarios move the test WINDOW out from under the real
// pointer. The pointer itself is only read, never moved.
import {execFileSync} from 'node:child_process';
import {nativeCall} from './test-driver.mjs';

// Tried in order: a comfortable gap first, a tight one when the screen is small.
const MARGINS = [40, 8];

// Where the real pointer is, in screen coordinates from the top left of the
// main display, or null where it can't be read.
export function realPointer() {
  if (process.platform !== 'darwin') return null;
  try {
    const out = execFileSync('/usr/bin/osascript', ['-l', 'JavaScript', '-e',
      'ObjC.import("AppKit");var p=$.NSEvent.mouseLocation;var h=$.NSScreen.screens.objectAtIndex(0).frame.size.height;p.x+","+(h-p.y)'],
      {encoding: 'utf8', timeout: 5000});
    const [x, y] = out.trim().split(',').map(Number);
    return Number.isFinite(x) && Number.isFinite(y) ? {x, y} : null;
  } catch { return null; }
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
  if (!to) return {pointer, moved: false, covered: clearOfPointer(pointer, bounds, {left: -1e9, top: -1e9, width: 2e9, height: 2e9}) !== null};
  await fixture.browser.send('Browser.setWindowBounds', {windowId, bounds: to});
  return {pointer, moved: true, to};
}
