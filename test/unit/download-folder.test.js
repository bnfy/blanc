'use strict';

// #1780: the folder downloads go to, chosen in Settings.

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const {
  normalizeDownloadFolder,
  resolveDownloadFolder,
  downloadFolderState,
  MAX_FOLDER_LENGTH,
} = require('../../src/main/download-folder');

const system = path.resolve('/Users/me/Downloads');
const chosen = path.resolve('/Volumes/Archive/Incoming');

test('only an absolute path is kept', () => {
  assert.equal(normalizeDownloadFolder(chosen, system), chosen);
  for (const bad of ['', 'relative/folder', null, 42, {}, `${chosen}\0x`, `/${'a'.repeat(MAX_FOLDER_LENGTH)}`]) {
    assert.equal(normalizeDownloadFolder(bad, system), '', String(bad).slice(0, 40));
  }
});

test('the system Downloads folder is stored as the default', () => {
  assert.equal(normalizeDownloadFolder(system, system), '');
  assert.equal(normalizeDownloadFolder(`${system}${path.sep}`, system), '');
});

test('downloads go to the chosen folder, else the system one', () => {
  assert.equal(resolveDownloadFolder('', system), system);
  assert.equal(resolveDownloadFolder(chosen, system), chosen);
  assert.equal(resolveDownloadFolder('not/absolute', system), system);
});

test('what Settings shows', () => {
  assert.deepEqual(downloadFolderState('', system, () => true), {
    path: system, name: 'Downloads', custom: false, missing: false,
  });
  assert.deepEqual(downloadFolderState(chosen, system, () => true), {
    path: chosen, name: 'Incoming', custom: true, missing: false,
  });
  // A folder that's gone is reported, never swapped for another.
  assert.deepEqual(downloadFolderState(chosen, system, () => { throw new Error('ENOENT'); }), {
    path: chosen, name: 'Incoming', custom: true, missing: true,
  });
  assert.equal(downloadFolderState(chosen, system, () => false).missing, true);
});
