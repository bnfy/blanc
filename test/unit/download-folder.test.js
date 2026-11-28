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
  checkDownloadFolder,
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
  const ok = () => 'ok';
  assert.deepEqual(downloadFolderState('', system, ok), {
    path: system, name: 'Downloads', custom: false, missing: false, unwritable: false,
  });
  assert.deepEqual(downloadFolderState(chosen, system, ok), {
    path: chosen, name: 'Incoming', custom: true, missing: false, unwritable: false,
  });
  // A folder that's gone or can't be written is reported, never swapped.
  assert.equal(downloadFolderState(chosen, system, () => { throw new Error('ENOENT'); }).missing, true);
  assert.equal(downloadFolderState(chosen, system, () => 'missing').missing, true);
  const locked = downloadFolderState(chosen, system, () => 'unwritable');
  assert.deepEqual([locked.path, locked.missing, locked.unwritable], [chosen, false, true]);
});

test('the real check tells a missing folder from one Blanc cannot write to', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-folder-check-'));
  try {
    assert.equal(checkDownloadFolder(fs, dir), 'ok');
    assert.equal(checkDownloadFolder(fs, path.join(dir, 'gone')), 'missing');
    const file = path.join(dir, 'a-file');
    fs.writeFileSync(file, '');
    assert.equal(checkDownloadFolder(fs, file), 'missing');
    const denied = { ...fs, constants: fs.constants, statSync: fs.statSync, accessSync: () => { throw new Error('EACCES'); } };
    assert.equal(checkDownloadFolder(denied, dir), 'unwritable');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
