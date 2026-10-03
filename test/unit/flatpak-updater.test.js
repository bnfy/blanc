const test = require('node:test');
const assert = require('node:assert/strict');

test('Flatpak setup and manual checks never touch feeds, downloads or installer handoff', async (t) => {
  const originals = new Map();
  function stub(name, exports) {
    const id = require.resolve(name); originals.set(id, require.cache[id]);
    require.cache[id] = { id, filename: id, loaded: true, exports };
  }
  const calls = [], dialogs = [];
  stub('electron', { app: { isPackaged: true, on: () => calls.push('focus-listener') },
    BrowserWindow: { getFocusedWindow: () => null, getAllWindows: () => [] },
    dialog: { showMessageBox: async (options) => { dialogs.push(options); return { response: 0 }; } },
  });
  stub('electron-updater', { autoUpdater: new Proxy({}, {
    get(_target, name) { return () => { calls.push(name); throw Error(`Forbidden updater operation: ${String(name)}`); }; },
    set(_target, name) { calls.push(name); return true; },
  }) });
  stub('../../src/main/linux-distribution', { linuxDistribution: { flatpak: true, appId: 'com.blancbrowser.Blanc' } });
  for (const file of ['../../src/main/updater', '../../src/main/updater-policy']) delete require.cache[require.resolve(file)];
  t.after(() => {
    for (const [id, original] of originals) { if (original) require.cache[id] = original; else delete require.cache[id]; }
    for (const file of ['../../src/main/updater', '../../src/main/updater-policy']) delete require.cache[require.resolve(file)];
  });
  const updater = require('../../src/main/updater');
  updater.setupAutoUpdater();
  await updater.checkForUpdatesManually();
  await updater.checkForUpdatesManually();
  assert.deepEqual(calls, []);
  assert.equal(dialogs.length, 2);
  assert.equal(dialogs[0].message, 'Updates are managed by Flatpak');
});
