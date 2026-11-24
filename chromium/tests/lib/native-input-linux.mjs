// Screen coordinates here are X11 root pixels. Convert Chromium DIPs at the caller.
import { execFileSync } from 'node:child_process';

function xdotool(...args) {
  if (process.platform !== 'linux' || !process.env.DISPLAY)
    throw new Error('Native pointer input requires Linux and an X11 DISPLAY');
  return execFileSync('xdotool', args, { encoding: 'utf8', timeout: 5000 });
}

function pixels(...coordinates) {
  return coordinates.map(n => {
    if (!Number.isFinite(n)) throw new TypeError('Expected a finite screen coordinate');
    return String(Math.round(n));
  });
}

export function click(x, y) {
  xdotool('mousemove', ...pixels(x, y), 'click', '1');
}

export function doubleClick(x, y) {
  xdotool('mousemove', ...pixels(x, y), 'click', '--repeat', '2', '--delay', '100', '1');
}

export function drag(x1, y1, x2, y2) {
  const steps = ['mousemove', ...pixels(x1, y1), 'mousedown', '1', 'sleep', '0.1'];
  for (let i = 1; i <= 8; i++) {
    steps.push('mousemove', ...pixels(x1 + (x2 - x1) * i / 8, y1 + (y2 - y1) * i / 8), 'sleep', '0.04');
  }
  try { xdotool(...steps, 'mouseup', '1'); }
  catch (error) { xdotool('mouseup', '1'); throw error; }
}

export function windowGeometry(windowId) {
  if (!/^(?:[1-9][0-9]*|0x[0-9a-f]+)$/i.test(String(windowId))) throw new TypeError('Expected an X11 window ID');
  const output = xdotool('getwindowgeometry', '--shell', String(windowId));
  const values = Object.fromEntries([...output.matchAll(/^(X|Y|WIDTH|HEIGHT)=(-?\d+)$/gm)]
    .map(([, key, value]) => [key.toLowerCase(), Number(value)]));
  if (Object.keys(values).length !== 4 || values.width <= 0 || values.height <= 0)
    throw new Error('Incomplete X11 window geometry: ' + output);
  return values;
}
