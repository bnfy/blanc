'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { UBLOCK_BRAND_URL, ublockBrandResourcePath } = require('../../src/main/ublock-brand-resource');
test('the first-party brand endpoint exposes the exact reserved PNG only', () => {
  assert.equal(ublockBrandResourcePath(UBLOCK_BRAND_URL), path.resolve(__dirname, '../../src/renderer/sunrise-hero-mark.png'));
  for (const url of [
    'blanc://ubo-brand/', 'blanc://ubo-brand/sunrise.png?x=1',
    'blanc://ubo-brand/sunrise.png#x', 'blanc://ubo-brand/%73unrise.png',
    'blanc://ubo-brand/pages.js', 'blanc://ubo-brand/../sunrise.png',
    'blanc://owner@ubo-brand/sunrise.png', 'blanc://ubo-brand:9/sunrise.png',
    'https://ubo-brand/sunrise.png',
  ]) assert.equal(ublockBrandResourcePath(url), null, url);
});
test('the extension references signed Blanc artwork without copying the image', () => {
  const { readVerifiedPackage, readHostSources, adaptPackage } = require('../../src/main/ublock-package');
  const root = path.resolve(__dirname, '../..');
  const { files } = readVerifiedPackage(path.join(root, 'ublock'));
  const adapted = adaptPackage(files, readHostSources(root));
  assert(!adapted.has('blanc-sunrise.png'));
  for (const member of ['blanc-popup.js', 'blanc-dashboard.js']) assert(adapted.get(member).toString().includes(UBLOCK_BRAND_URL));
  const mark = require('node:fs').readFileSync(path.join(root, 'src/renderer/sunrise-hero-mark.png'));
  assert(![...adapted.values()].some(bytes => bytes.equals(mark)), 'Reserved artwork copied into adapted extension');
});
