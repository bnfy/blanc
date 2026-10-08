// bench/translate/harness/native.js
// OS-level probes for the "engine behind the page" round: a real mouse click and
// key press, a screen capture, and an accessibility-tree search. Each returns
// { error } instead of throwing so an unavailable probe is recorded as
// not-measured, never as a pass.
'use strict';
const { execFile } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function run(cmd, args, timeoutMs = 60_000) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: timeoutMs, windowsHide: true }, (err, stdout, stderr) => {
      resolve(err ? { error: `${err.message} ${String(stderr).trim()}`.trim() } : { stdout: String(stdout).trim() });
    });
  });
}

function writeTemp(name, body) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-phase0-')), name);
  fs.writeFileSync(file, body);
  return file;
}

const MAC_INPUT = `
ObjC.import('CoreGraphics');
function run(argv) {
  const p = $.CGPointMake(Number(argv[0]), Number(argv[1]));
  const post = (e) => $.CGEventPost(0, e); // kCGHIDEventTap
  post($.CGEventCreateMouseEvent(null, 5, p, 0)); // mouse moved
  delay(0.1);
  post($.CGEventCreateMouseEvent(null, 1, p, 0)); // left down
  delay(0.05);
  post($.CGEventCreateMouseEvent(null, 2, p, 0)); // left up
  delay(0.3);
  post($.CGEventCreateKeyboardEvent(null, 0, true)); // "a" down
  delay(0.05);
  post($.CGEventCreateKeyboardEvent(null, 0, false));
  return 'ok';
}`;

const WIN_INPUT = (x, y) => `
Add-Type @"
using System; using System.Runtime.InteropServices;
public class BlancProbe {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(int f, int dx, int dy, int d, int e);
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, int flags, int extra);
}
"@
[BlancProbe]::SetCursorPos(${x}, ${y}) | Out-Null
Start-Sleep -Milliseconds 100
[BlancProbe]::mouse_event(2, 0, 0, 0, 0)
Start-Sleep -Milliseconds 50
[BlancProbe]::mouse_event(4, 0, 0, 0, 0)
Start-Sleep -Milliseconds 300
[BlancProbe]::keybd_event(0x41, 0, 0, 0)
Start-Sleep -Milliseconds 50
[BlancProbe]::keybd_event(0x41, 0, 2, 0)
'ok'`;

// point: screen coordinates in DIPs; scale: display scale factor.
async function clickAndType(point, scale) {
  if (process.platform === 'darwin') {
    return run('osascript', ['-l', 'JavaScript', writeTemp('input.js', MAC_INPUT), String(point.x), String(point.y)]);
  }
  if (process.platform === 'win32') {
    const file = writeTemp('input.ps1', WIN_INPUT(Math.round(point.x * scale), Math.round(point.y * scale)));
    return run('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', file]);
  }
  return { error: `no native input probe for ${process.platform}` };
}

// rect: screen rectangle in DIPs. Resolves { file } or { error }.
async function captureRect(rect, scale) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-phase0-')), 'capture.png');
  let res;
  if (process.platform === 'darwin') {
    res = await run('screencapture', ['-x', '-R', `${rect.x},${rect.y},${rect.width},${rect.height}`, file]);
  } else if (process.platform === 'win32') {
    const r = { x: Math.round(rect.x * scale), y: Math.round(rect.y * scale), w: Math.round(rect.width * scale), h: Math.round(rect.height * scale) };
    const ps = `Add-Type -AssemblyName System.Drawing
$b = New-Object System.Drawing.Bitmap ${r.w}, ${r.h}
$g = [System.Drawing.Graphics]::FromImage($b)
$g.CopyFromScreen(${r.x}, ${r.y}, 0, 0, $b.Size)
$b.Save('${file.replace(/'/g, "''")}', [System.Drawing.Imaging.ImageFormat]::Png)
'ok'`;
    res = await run('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', writeTemp('capture.ps1', ps)]);
  } else {
    return { error: `no capture probe for ${process.platform}` };
  }
  if (res.error) return res;
  return fs.existsSync(file) ? { file } : { error: 'capture produced no file' };
}

const MAC_AX = `
function run(argv) {
  const se = Application('System Events');
  const proc = se.processes.whose({ unixId: Number(argv[0]) })[0];
  const found = { engineFound: false, pageFound: false, elements: 0 };
  for (const w of proc.windows()) {
    for (const e of w.entireContents()) {
      found.elements++;
      let text = '';
      for (const read of [() => e.name(), () => e.description(), () => e.title(), () => e.value()]) {
        try { text += ' ' + read(); } catch (_) {}
      }
      if (text.includes('BLANC-ENGINE-AX-PROBE')) found.engineFound = true;
      if (text.includes('BLANC-PAGE-AX-PROBE')) found.pageFound = true;
    }
  }
  return JSON.stringify(found);
}`;

const WIN_AX = `Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
$root = [System.Windows.Automation.AutomationElement]::RootElement
function Has($name) {
  $c = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, $name)
  return [bool]$root.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $c)
}
'{"engineFound":' + (Has 'BLANC-ENGINE-AX-PROBE').ToString().ToLower() + ',"pageFound":' + (Has 'BLANC-PAGE-AX-PROBE').ToString().ToLower() + '}'`;

async function accessibilityProbe(pid) {
  let res;
  if (process.platform === 'darwin') res = await run('osascript', ['-l', 'JavaScript', writeTemp('ax.js', MAC_AX), String(pid)], 120_000);
  else if (process.platform === 'win32') res = await run('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', writeTemp('ax.ps1', WIN_AX)], 120_000);
  else return { error: `no accessibility probe for ${process.platform}` };
  if (res.error) return res;
  try {
    return JSON.parse(res.stdout.split('\n').pop());
  } catch (err) {
    return { error: `unparseable accessibility output: ${res.stdout.slice(0, 200)}` };
  }
}

module.exports = { clickAndType, captureRect, accessibilityProbe };
