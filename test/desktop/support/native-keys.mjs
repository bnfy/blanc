// Real OS key and mouse input for the most-recent Ctrl+Tab scenario in
// browser-shortcuts-smoke.mjs. A consumed key press loses the following key
// releases on the native input path, which Electron's sendInputEvent skips,
// so only native input can prove the Control release arrives (spec §3.4, §10
// of docs/superpowers/specs/2026-10-24-mru-tab-switcher-design.md).
//
// Linux: xdotool (X11). Windows: native-keys-win.ps1 (keybd_event). macOS:
// native-keys-mac.swift (CGEvent), which needs Accessibility permission.
//
// Steps are ['down', key], ['up', key], ['key', key] (down then up), a number
// of milliseconds to wait, or ['click', x, y] in window content coordinates.
// Keys: ctrl, shift, tab, escape, w.
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const X11_KEYS = { ctrl: 'ctrl', shift: 'shift', tab: 'Tab', escape: 'Escape', w: 'w' };

/** A line-protocol helper process: each run() writes its steps and waits for "done". */
function lineHelper(command, args, label) {
  const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'inherit'] });
  let buffered = '';
  const waiters = [];
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', chunk => {
    buffered += chunk;
    let index;
    while ((index = buffered.indexOf('\n')) >= 0) {
      const line = buffered.slice(0, index).trim();
      buffered = buffered.slice(index + 1);
      waiters.shift()?.resolve(line);
    }
  });
  child.on('exit', code => {
    for (const waiter of waiters.splice(0)) waiter.reject(new Error(`${label} exited (${code})`));
  });
  const nextLine = (timeout = 60_000) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} did not answer`)), timeout);
    waiters.push({ resolve: line => { clearTimeout(timer); resolve(line); }, reject: error => { clearTimeout(timer); reject(error); } });
  });
  return {
    child,
    nextLine,
    async send(lines) {
      const done = nextLine();
      child.stdin.write(`${[...lines, 'done'].join('\n')}\n`);
      const answer = await done;
      if (answer !== 'done') throw new Error(`${label} answered ${answer}`);
    },
    close() { child.stdin.end(); },
  };
}

function expand(steps, toScreen) {
  const lines = [];
  for (const step of steps) {
    if (typeof step === 'number') lines.push(`sleep ${step}`);
    else if (step[0] === 'key') lines.push(`down ${step[1]}`, `up ${step[1]}`);
    else if (step[0] === 'click') {
      const point = toScreen(step[1], step[2]);
      lines.push(`click ${point.x} ${point.y}`);
    } else lines.push(`${step[0]} ${step[1]}`);
  }
  return lines;
}

/**
 * Opens the platform's native input for `app`'s chrome window. Returns null,
 * with the reason, when this machine can't post real input; on CI that is an
 * error instead, so the scenario never passes by being skipped.
 */
export async function openNativeKeys(app) {
  const platform = process.platform;
  const unavailable = (reason) => {
    if (process.env.GITHUB_ACTIONS) throw new Error(`Real key input is required on CI: ${reason}`);
    return { keys: null, reason };
  };
  const windowInfo = () => app.evaluate(({ BrowserWindow, screen }) => {
    const win = BrowserWindow.getAllWindows().find(w => w.webContents.getURL() === 'blanc-chrome://index/');
    const handle = win.getNativeWindowHandle();
    const bounds = win.getContentBounds();
    const scale = screen.getDisplayMatching(bounds).scaleFactor;
    return {
      xid: process.platform === 'linux' ? String(handle.length >= 8 ? handle.readBigUInt64LE(0) : handle.readUInt32LE(0)) : null,
      bounds,
      scale,
    };
  });
  // Win/macOS: Electron raises its own window (it knows the OS rules for
  // taking focus), then the helper's keys go to whatever is focused.
  const focusApp = async () => {
    await app.evaluate(({ app, BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows().find(w => w.webContents.getURL() === 'blanc-chrome://index/');
      if (process.platform === 'darwin') app.focus({ steal: true });
      win.show();
      win.focus();
    });
    const deadline = Date.now() + 5000;
    while (!(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getFocusedWindow()?.webContents.getURL() === 'blanc-chrome://index/'))) {
      if (Date.now() > deadline) throw new Error('Blanc\'s window did not take focus for real key input');
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    await new Promise(resolve => setTimeout(resolve, 200));
  };

  if (platform === 'linux') {
    try { execFileSync('xdotool', ['version'], { stdio: 'ignore' }); } catch { return unavailable('xdotool is not installed'); }
    const { xid } = await windowInfo();
    return {
      keys: {
        async run(...steps) {
          try { execFileSync('xdotool', ['windowfocus', '--sync', xid]); } catch { execFileSync('xdotool', ['windowfocus', xid]); }
          await new Promise(resolve => setTimeout(resolve, 200));
          for (const step of steps) {
            if (typeof step === 'number') await new Promise(resolve => setTimeout(resolve, step));
            else if (step[0] === 'click') execFileSync('xdotool', ['mousemove', '--window', xid, String(Math.round(step[1])), String(Math.round(step[2])), 'click', '1']);
            else execFileSync('xdotool', [{ down: 'keydown', up: 'keyup', key: 'key' }[step[0]], X11_KEYS[step[1]]]);
          }
        },
        close() {},
      },
    };
  }

  if (platform === 'win32') {
    const helper = lineHelper('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(here, 'native-keys-win.ps1')], 'native-keys-win.ps1');
    const first = await helper.nextLine();
    if (first !== 'ready') { helper.close(); return unavailable(`native-keys-win.ps1 answered ${first}`); }
    return {
      keys: {
        async run(...steps) {
          await focusApp();
          const { bounds, scale } = await windowInfo();
          // The helper is DPI-aware, so it clicks in physical pixels.
          await helper.send(expand(steps, (x, y) => ({ x: Math.round((bounds.x + x) * scale), y: Math.round((bounds.y + y) * scale) })));
        },
        close: () => helper.close(),
      },
    };
  }

  if (platform === 'darwin') {
    const binary = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-native-keys-')), 'native-keys-mac');
    try {
      execFileSync('xcrun', ['swiftc', '-O', '-o', binary, path.join(here, 'native-keys-mac.swift')], { stdio: 'inherit' });
    } catch (error) {
      return unavailable(`could not compile native-keys-mac.swift (${error.message})`);
    }
    const helper = lineHelper(binary, [], 'native-keys-mac');
    const first = await helper.nextLine();
    if (first !== 'ready') {
      helper.close();
      return unavailable(first === 'untrusted'
        ? 'posting key events needs Accessibility permission (System Settings → Privacy & Security → Accessibility) for the process running the test'
        : `native-keys-mac answered ${first}`);
    }
    return {
      keys: {
        async run(...steps) {
          await focusApp();
          const { bounds } = await windowInfo();
          // CGEvent and Electron both use global points with a top-left origin.
          await helper.send(expand(steps, (x, y) => ({ x: Math.round(bounds.x + x), y: Math.round(bounds.y + y) })));
        },
        close: () => helper.close(),
      },
    };
  }

  return unavailable(`no native input for ${platform}`);
}
