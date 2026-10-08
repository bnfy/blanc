'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { sourceLabel, splitFileName } = require('../../src/renderer/pages/downloads-row-model');

test('the source line is the site, not the whole URL', () => {
  assert.equal(sourceLabel('https://www.example.com/files/report.pdf?x=1'), 'example.com');
  assert.equal(sourceLabel('blob:https://app.example.org/123'), 'blob:https://app.example.org/123');
  assert.equal(sourceLabel(''), '');
});

test('long names keep their extension visible', () => {
  assert.deepEqual(splitFileName('annual-report-2026.pdf'), { stem: 'annual-report-2026', ext: '.pdf' });
  assert.deepEqual(splitFileName('backup.tar.gz'), { stem: 'backup.tar', ext: '.gz' });
  assert.deepEqual(splitFileName('.env'), { stem: '.env', ext: '' });
  assert.deepEqual(splitFileName('README'), { stem: 'README', ext: '' });
  assert.deepEqual(splitFileName('weird.extension-too-long'), { stem: 'weird.extension-too-long', ext: '' });
});

test('interrupted rows offer Resume when possible, otherwise Retry for web sources', () => {
  const { rowActions } = require('../../src/renderer/pages/downloads-row-model');
  const url = 'https://uc1.dl.dropboxusercontent.com/zip_download_get/x';
  assert.deepEqual(rowActions({ state: 'progressing', url }), ['cancel']);
  assert.deepEqual(rowActions({ state: 'completed', url }), ['open', 'show']);
  assert.deepEqual(rowActions({ state: 'cancelled', url }), []);
  assert.deepEqual(rowActions({ state: 'interrupted', url, canResume: true, inFlight: true }), ['resume', 'cancel']);
  assert.deepEqual(rowActions({ state: 'interrupted', url, canResume: false, inFlight: true }), ['retry', 'cancel']);
  assert.deepEqual(rowActions({ state: 'interrupted', url }), ['retry']);
  assert.deepEqual(rowActions({ state: 'interrupted', url: 'blob:https://a.example/1' }), []);
});
