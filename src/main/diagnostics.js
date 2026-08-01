const { app, dialog } = require('electron');
const os = require('node:os');
const path = require('node:path');
const { JsonStore } = require('./store');
const { buildDiagnosticsReport, createCrashLedger } = require('./diagnostics-model');
const { writeDiagnosticsFile } = require('./diagnostics-export');

let store = null;
let ledger = null;
let started = false;
let quitting = false;

function ensureLedger() {
  if (!store) {
    store = new JsonStore('crash-ledger', { version: 1, currentRun: null, events: [] });
  }
  if (!ledger) {
    ledger = createCrashLedger(store);
  }
  return ledger;
}

function start() {
  if (started) return;
  started = true;
  ensureLedger().startSession();
  app.on('child-process-gone', (_event, details) => {
    if (quitting || details?.reason === 'clean-exit') return;
    ensureLedger().recordChildProcess(details);
  });
  app.on('before-quit', () => { quitting = true; });
  app.on('will-quit', () => { ensureLedger().endSession(); });
}

function recordRendererCrash(surface, details = {}) {
  if (!started || quitting || details.reason === 'clean-exit') return false;
  return ensureLedger().recordRenderer({
    surface,
    reason: details.reason,
    exitCode: details.exitCode,
  });
}

function status() {
  const events = ensureLedger().snapshot();
  return {
    count: events.length,
    lastEventAt: events.at(-1)?.at ?? null,
  };
}

function clear() {
  const ok = ensureLedger().clear();
  return { ok, ...status() };
}

function report() {
  return buildDiagnosticsReport({
    generatedAt: Date.now(),
    appInfo: {
      version: app.getVersion(),
      packaged: app.isPackaged,
      electron: process.versions.electron,
      chromium: process.versions.chrome,
      node: process.versions.node,
    },
    systemInfo: {
      platform: process.platform,
      architecture: process.arch,
      release: os.release(),
    },
    events: ensureLedger().snapshot(),
  });
}

async function exportReport(parent) {
  try {
    const date = new Date().toISOString().slice(0, 10);
    const picked = await dialog.showSaveDialog(parent ?? undefined, {
      title: 'Export Blanc diagnostics',
      defaultPath: path.join(app.getPath('downloads'), `Blanc-Diagnostics-${date}.json`),
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (picked.canceled || !picked.filePath) return { ok: false, cancelled: true };
    await writeDiagnosticsFile(picked.filePath, report());
    return { ok: true };
  } catch (error) {
    console.warn('[diagnostics] export failed:', error.message);
    return { ok: false, error: 'write-failed' };
  }
}

module.exports = { clear, exportReport, recordRendererCrash, report, start, status };
