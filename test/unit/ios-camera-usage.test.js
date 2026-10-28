'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

// The iPhone camera prompt (design 2026-10-28 §7.2) comes from copy/messages
// like every other string: iOS reads it from the bundle, so copy:build writes
// InfoPlist.xcstrings, and the English base value in Info.plist must match.
const root = path.join(__dirname, '../..');
const en = require('../../copy/messages/en.json');

test('InfoPlist.xcstrings carries the camera prompt in all six languages', () => {
  const catalog = JSON.parse(fs.readFileSync(path.join(root, 'ios/Blanc/Blanc/InfoPlist.xcstrings'), 'utf8'));
  const entry = catalog.strings.NSCameraUsageDescription;
  assert.ok(entry, 'NSCameraUsageDescription is in the catalog');
  assert.deepEqual(Object.keys(entry.localizations).sort(), ['de', 'en', 'es', 'fr', 'it', 'pt-BR']);
  assert.equal(entry.localizations.en.stringUnit.value, en['ios.pair.cameraUsage'].message);
  for (const locale of ['de', 'es', 'fr', 'it', 'pt-BR']) {
    const message = require(`../../copy/messages/${locale}.json`)['ios.pair.cameraUsage'].message;
    assert.equal(entry.localizations[locale].stringUnit.value, message, locale);
  }
});

test('Info.plist declares the camera with the English prompt and no restricted key', () => {
  const plist = fs.readFileSync(path.join(root, 'ios/Blanc/Info.plist'), 'utf8');
  const match = plist.match(/<key>NSCameraUsageDescription<\/key>\s*<string>([^<]*)<\/string>/);
  assert.ok(match, 'NSCameraUsageDescription is declared');
  assert.equal(match[1].replace(/&apos;|&#8217;/g, '’'), en['ios.pair.cameraUsage'].message);
  // Apple's default-browser rules restrict these keys (design 2026-10-28 §3).
  for (const key of ['NSPhotoLibraryUsageDescription', 'NSLocationAlwaysAndWhenInUseUsageDescription', 'NSLocationAlwaysUsageDescription',
    'NSHomeKitUsageDescription', 'NSBluetoothAlwaysUsageDescription', 'NSHealthShareUsageDescription', 'NSHealthUpdateUsageDescription']) {
    assert.ok(!plist.includes(`<key>${key}</key>`), key);
  }
});
