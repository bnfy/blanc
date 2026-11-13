'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');

// On an iPad, SyncCopy reads a key's `<key>.ipad` wording where it has one, so
// nothing an iPad shows may name the phone. Every message that does needs that
// sibling, in every language, unless only the desktop draws it.
const messagesDir = path.join(__dirname, '../../copy/messages');
const en = require(path.join(messagesDir, 'en.json'));
const LOCALES = ['de', 'es', 'fr', 'it', 'pt-BR'];
const NAMES_THE_PHONE = /iphone|\bphone|pocket/i;
// The desktop's pairing copy waits for a public iPad build, and spaces.thisIPad
// predates the `.ipad` rule (TabSets picks between the two keys itself).
const NOT_DRAWN_ON_AN_IPAD = new Set([
  'settings.sync.devices.platform.ios',
  'settings.sync.sheet.yourIphone',
  'settings.sync.connectIphone',
  'settings.sync.sheet.scanIphone',
  'newtab.checklist.iphone',
  'slash.send.hint',
  'spaces.thisIPhone',
]);

// Blanc for Android's own wordings (their notes say so) are never on an iPad.
const ANDROID_ONLY = /^(Blanc for )?Android:/;

const phoneKeys = Object.keys(en).filter((key) => !key.endsWith('.ipad')
  && !NOT_DRAWN_ON_AN_IPAD.has(key)
  && !ANDROID_ONLY.test(en[key].note ?? '')
  && NAMES_THE_PHONE.test(en[key].message));

test('there are messages that name the phone to check', () => {
  assert.ok(phoneKeys.includes('ios.welcome.title'));
});

test('every message that names the phone has an iPad wording', () => {
  for (const key of phoneKeys) {
    const ipad = en[`${key}.ipad`];
    assert.ok(ipad, `${key} needs ${key}.ipad`);
    assert.doesNotMatch(ipad.message, NAMES_THE_PHONE, `${key}.ipad`);
  }
});

test('every language has the iPad wording, without the phone in it', () => {
  for (const locale of LOCALES) {
    const messages = require(path.join(messagesDir, `${locale}.json`));
    for (const key of phoneKeys) {
      const message = messages[`${key}.ipad`]?.message;
      assert.ok(message, `${locale}: ${key}.ipad`);
      assert.doesNotMatch(message, /iphone|telefon|teléfono|téléphone|tasche|bolsillo|bolso|poche|tasca/i, `${locale}: ${key}.ipad`);
    }
  }
});
