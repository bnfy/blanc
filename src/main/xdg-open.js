'use strict';

// Open a URL with xdg-open on Linux and report whether it worked. Electron's
// shell.openExternal launches xdg-open without waiting for it, so it resolves
// even when no app handles the URL (a mailto: link with no mail app set up,
// found in the v1.36.0 hand checks). This waits for xdg-open's exit status
// instead: 0 is opened, anything else rejects.
//
// Generic xdg-open waits for the app it runs, such as a terminal mail client,
// so an xdg-open still running after XDG_OPEN_SETTLE_MS has launched
// something and counts as opened. It keeps running, detached from Blanc.

const childProcess = require('node:child_process');

const XDG_OPEN_SETTLE_MS = 5000;

function xdgOpen(url, { spawn = childProcess.spawn, env = process.env, settleMs = XDG_OPEN_SETTLE_MS } = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer = null;
    const settle = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };
    // The same environment Chromium gives xdg-open: mailcap must never want a
    // terminal, since Blanc has none.
    const child = spawn('xdg-open', [url], { stdio: 'ignore', detached: true, env: { ...env, MM_NOTTTY: '1' } });
    child.on('error', (error) => settle(reject, error));
    child.on('exit', (code, signal) => {
      if (code === 0) settle(resolve);
      else settle(reject, new Error(signal ? `xdg-open was stopped by ${signal}` : `xdg-open exited with ${code}`));
    });
    timer = setTimeout(() => {
      child.unref();
      settle(resolve);
    }, settleMs);
  });
}

module.exports = { xdgOpen, XDG_OPEN_SETTLE_MS };
