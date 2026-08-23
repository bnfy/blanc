'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const PRELOAD_SOURCE = fs.readFileSync(
  path.join(__dirname, '../../src/main/tab-preload.js'),
  'utf8',
);

function loadForHost(host, protocol = 'blanc:') {
  let exposed = null;
  const invocations = [];
  const electron = {
    contextBridge: {
      exposeInMainWorld: (name, api) => { exposed = { name, api }; },
    },
    ipcRenderer: {
      invoke: (...args) => {
        invocations.push(args);
        return Promise.resolve(null);
      },
      on: () => {},
      removeListener: () => {},
    },
  };
  vm.runInNewContext(PRELOAD_SOURCE, {
    window: { location: { protocol, host } },
    require: (id) => {
      if (id === 'electron') return electron;
      throw new Error(`unexpected require: ${id}`);
    },
  });
  return { exposed, invocations };
}

test('tab-import preload exposes only the dedicated capability set', async () => {
  const loaded = loadForHost('tab-import');
  assert.equal(loaded.exposed.name, 'bowserPages');
  assert.deepEqual(
    Object.keys(loaded.exposed.api.tabImport).sort(),
    [
      'apply', 'cancel', 'openFile', 'openSource', 'selectFolder',
      'setSelection', 'sources', 'submitEmbeddings', 'suggestEmbed',
      'suggestFolders',
    ],
  );
  assert.equal('bookmarks' in loaded.exposed.api, false);
  assert.equal('settings' in loaded.exposed.api, false);

  await loaded.exposed.api.tabImport.selectFolder('session', 'folder');
  assert.deepEqual(loaded.invocations, [[
    'pages:tab-import:select-folder', 'session', 'folder',
  ]]);
});

test('other internal hosts never receive tab-import capabilities', () => {
  const bookmarks = loadForHost('bookmarks').exposed.api;
  assert.equal('tabImport' in bookmarks, false);
  assert.equal(loadForHost('tab-import', 'https:').exposed, null);
});
