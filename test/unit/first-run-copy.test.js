'use strict';

// Copy the walkthrough and Settings show a new person: it must name real
// commands, and label the same thing the same way everywhere.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '../..');
const read = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
const LOCALES = ['en', 'de', 'es', 'fr', 'it', 'pt-BR'];
const catalogs = Object.fromEntries(LOCALES.map((locale) => [locale, read(`copy/messages/${locale}.json`)]));
const commands = new Set(JSON.stringify(read('copy/slash-commands.json')).match(/\/[a-z][a-z-]*/g));

test('every command the walkthrough mentions exists, in every language', () => {
  for (const [locale, catalog] of Object.entries(catalogs)) {
    for (const [key, entry] of Object.entries(catalog)) {
      if (!key.startsWith('onboarding.') || typeof entry?.message !== 'string') continue;
      for (const mention of entry.message.match(/(?<![\w/:.])\/[a-z][a-z-]+/g) ?? []) {
        assert.ok(commands.has(mention), `${locale} ${key} mentions ${mention}, which is not a command`);
      }
    }
  }
});

test('Settings names the Start Page layouts as the Start Page does', () => {
  for (const [locale, catalog] of Object.entries(catalogs)) {
    for (const layout of ['ledger', 'billboard', 'shelf', 'tally']) {
      assert.equal(
        catalog[`settings.general.newtabLayout.${layout}`].message,
        catalog[`newtab.layout.${layout}`].message,
        `${locale} ${layout}`,
      );
    }
  }
});

test('the walkthrough labels are capitalized like the rest of the app', () => {
  const keys = [
    'onboarding.skip', 'onboarding.step.default', 'onboarding.step.import', 'onboarding.step.island',
    'onboarding.step.blocking', 'onboarding.step.privacy', 'onboarding.step.theme',
    'onboarding.theme.light', 'onboarding.theme.dark',
  ];
  for (const [locale, catalog] of Object.entries(catalogs)) {
    for (const key of keys) {
      const first = catalog[key].message.replace(/^[^\p{L}]+/u, '')[0];
      assert.equal(first, first.toLocaleUpperCase(locale), `${locale} ${key}: ${catalog[key].message}`);
    }
  }
});

test('the walkthrough names the Island with a capital I, as the app does', () => {
  for (const [locale, catalog] of Object.entries(catalogs)) {
    for (const key of ['onboarding.step.island', 'onboarding.island.title']) {
      assert.doesNotMatch(catalog[key].message, /\bisland\b/, `${locale} ${key}`);
    }
  }
});

test('the Theme hint names no particular operating system', () => {
  for (const [locale, catalog] of Object.entries(catalogs)) {
    assert.doesNotMatch(catalog['settings.general.theme.hint'].message, /macOS|Windows|Linux/, locale);
  }
});
