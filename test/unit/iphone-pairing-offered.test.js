'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

// iPhone wording ships only with Blanc for iPhone (design 2026-10-28 §9).
// isIphonePairingOffered() lives in main.js, which needs a live Electron, so
// the rule is pinned as source, the way isSharedSpacesOffered() is.
const root = path.join(__dirname, '../..');
const main = fs.readFileSync(path.join(root, 'src/main/main.js'), 'utf8');

const constant = () => {
  const match = main.match(/^const IPHONE_PAIRING_FROM = (null|'(\d+\.\d+)');/m);
  assert.ok(match, 'IPHONE_PAIRING_FROM is a top-level constant: null or a quoted major.minor');
  return match[2] ?? null;
};

test('offered unpackaged, and packaged only from IPHONE_PAIRING_FROM', () => {
  const at = main.indexOf('function isIphonePairingOffered()');
  assert.ok(at >= 0);
  const body = main.slice(at, main.indexOf('\n}', at));
  assert.match(body, /!app\.isPackaged/);
  assert.match(body, /IPHONE_PAIRING_FROM/);
  constant();
});

test('setting IPHONE_PAIRING_FROM needs the iPhone app public and the /pair page built', () => {
  const from = constant();
  if (from === null) return;
  const availability = path.join(root, 'site/src/data/ios-availability.json');
  assert.ok(fs.existsSync(availability), 'site/src/data/ios-availability.json records the iPhone release');
  assert.equal(JSON.parse(fs.readFileSync(availability, 'utf8')).public, true);
  assert.ok(fs.existsSync(path.join(root, 'site/src/pages/pair.astro')), 'the Camera-app fallback page exists');
});

test('the packaged default is not offered while the iPhone app is unreleased', () => {
  if (fs.existsSync(path.join(root, 'site/src/data/ios-availability.json'))) return;
  assert.equal(constant(), null);
});

test('a pending open-the-sheet request never outlives the Settings sheet it was for', () => {
  const at = main.indexOf('function hideUtilitySheet(');
  const body = main.slice(at, main.indexOf('\n}', at));
  assert.match(body, /runtime\.syncPairSheetPending = false;/);
});
