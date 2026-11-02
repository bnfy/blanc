'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

// WebKit's long-press Save to Photos (and the share sheet's Save Image) write
// to the photo library, and iOS kills an app that does so without this prompt
// (TestFlight crash, October 31, 2026). Add-only: the full-library key stays
// out, because Apple's default-browser rules restrict it.
const root = path.join(__dirname, '../..');
const en = require('../../copy/messages/en.json');

test('InfoPlist.xcstrings carries the Photos prompt in all six languages', () => {
  const catalog = JSON.parse(fs.readFileSync(path.join(root, 'ios/Blanc/Blanc/InfoPlist.xcstrings'), 'utf8'));
  const entry = catalog.strings.NSPhotoLibraryAddUsageDescription;
  assert.ok(entry, 'NSPhotoLibraryAddUsageDescription is in the catalog');
  assert.deepEqual(Object.keys(entry.localizations).sort(), ['de', 'en', 'es', 'fr', 'it', 'pt-BR']);
  for (const locale of ['en', 'de', 'es', 'fr', 'it', 'pt-BR']) {
    const message = require(`../../copy/messages/${locale}.json`)['ios.photos.addUsage'].message;
    assert.equal(entry.localizations[locale].stringUnit.value, message, locale);
  }
});

test('Info.plist declares add-only Photos access with the English prompt', () => {
  const plist = fs.readFileSync(path.join(root, 'ios/Blanc/Info.plist'), 'utf8');
  const match = plist.match(/<key>NSPhotoLibraryAddUsageDescription<\/key>\s*<string>([^<]*)<\/string>/);
  assert.ok(match, 'NSPhotoLibraryAddUsageDescription is declared');
  assert.equal(match[1], en['ios.photos.addUsage'].message);
  assert.ok(!plist.includes('<key>NSPhotoLibraryUsageDescription</key>'));
});
