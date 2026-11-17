'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const { chooseDownloadPath, downloadReservationKey } = require('../../src/main/download-path');

const folder = path.join(path.sep, 'home', 'me', 'Downloads');
const at = (name) => path.join(folder, name);

function pick(filename, { taken = [], reserved = new Set() } = {}) {
  const onDisk = new Set(taken.map(at));
  return chooseDownloadPath({ folder, filename, exists: (p) => onDisk.has(p), reserved });
}

test('uses the suggested name when it is free', () => {
  assert.equal(pick('report.pdf'), at('report.pdf'));
});

test('numbers a taken name before the extension', () => {
  assert.equal(pick('report.pdf', { taken: ['report.pdf'] }), at('report (1).pdf'));
  assert.equal(pick('report.pdf', { taken: ['report.pdf', 'report (1).pdf'] }), at('report (2).pdf'));
});

test('keeps compound archive extensions together', () => {
  assert.equal(pick('site.tar.gz', { taken: ['site.tar.gz'] }), at('site (1).tar.gz'));
  assert.equal(pick('site.tar.bz2', { taken: ['site.tar.bz2'] }), at('site (1).tar.bz2'));
  assert.equal(pick('site.tar.xz', { taken: ['site.tar.xz'] }), at('site (1).tar.xz'));
  assert.equal(pick('site.TAR.ZST', { taken: ['site.TAR.ZST'] }), at('site (1).TAR.ZST'));
});

test('numbers a dotfile after its name', () => {
  assert.equal(pick('.env', { taken: ['.env'] }), at('.env (1)'));
});

test('a name without an extension gets the number at the end', () => {
  assert.equal(pick('README', { taken: ['README'] }), at('README (1)'));
});

test('skips reserved names, ignoring case', () => {
  const reserved = new Set([downloadReservationKey(at('Report.PDF'))]);
  assert.equal(pick('report.pdf', { reserved }), at('report (1).pdf'));
});

test('never leaves the folder', () => {
  for (const name of ['../../etc/passwd', 'a/b.txt', 'a\\b.txt', '..\\..\\boot.ini']) {
    const result = pick(name);
    assert.equal(path.dirname(result), folder, name);
  }
});

test('falls back to "download" for an empty or dot-only name', () => {
  for (const name of ['', '   ', '.', '..', undefined]) {
    assert.equal(pick(name), at('download'), String(name));
  }
});

test('returns null when every candidate is taken', () => {
  assert.equal(
    chooseDownloadPath({ folder, filename: 'x.zip', exists: () => true, reserved: new Set() }),
    null
  );
});
