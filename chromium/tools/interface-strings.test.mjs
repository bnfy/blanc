// The Island's and the pages' strings.js must be shipping's catalogs at the recorded release.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {generate} from './interface-strings.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('the committed catalogs are the generated ones', () => {
  assert.equal(fs.readFileSync(path.join(root, 'blanc/island/strings.js'), 'utf8'), generate());
});

// Blanc's pages (Start Page and the sheets) use the same catalogs and the
// same language choice, keeping the fork's page status messages.
test('the pages\' catalogs are generated, pinned and keep their status messages', async () => {
  const {generatePages, pagesOutput} = await import('./interface-strings.mjs');
  const source = fs.readFileSync(pagesOutput, 'utf8');
  assert.equal(source, generatePages());
  const vm = await import('node:vm');
  const run = (languages, pin) => {
    const context = {navigator: {languages, language: languages[0]}, __blancUiLanguage: pin, Intl};
    context.self = context;
    vm.runInNewContext(source, context);
    return context.blancStrings;
  };
  assert.equal(run(['de-DE'], null).locale, 'de');
  const french = run(['en-US'], 'fr');
  assert.equal(french.locale, 'fr');
  assert.equal(french.messages['start.pins.unavailable'], 'Impossible d’actualiser les sites épinglés.');
  assert.equal(run(['en-US'], null).messages['settings.general.islandSize.label'], 'Island size');
});
