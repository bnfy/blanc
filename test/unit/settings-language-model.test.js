'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { languageRow, needsRelaunch } = require('../../src/renderer/pages/settings-language-model');

const t = (key, params) => (key === 'settings.language.system' ? `System (${params.language})` : key);
const two = { active: 'de', system: 'de', options: [{ code: 'en', endonym: 'English' }, { code: 'de', endonym: 'Deutsch' }] };

test('hidden while only one language is selectable', () => {
  assert.deepEqual(languageRow({ uiLanguage: 'system', languages: { active: 'en', system: 'en', options: [{ code: 'en', endonym: 'English' }] }, t }),
    { visible: false, options: [] });
});

test('options: System naming what it resolves to, then endonyms', () => {
  const row = languageRow({ uiLanguage: 'system', languages: two, t });
  assert.equal(row.visible, true);
  assert.equal(row.selected, 'system');
  assert.deepEqual(row.options, [
    { value: 'system', label: 'System (Deutsch)' },
    { value: 'en', label: 'English' },
    { value: 'de', label: 'Deutsch' },
  ]);
});

test('a stored unavailable language shows English selected with no relaunch prompt', () => {
  const languages = { active: 'en', system: 'de', options: two.options };
  const row = languageRow({ uiLanguage: 'fr', languages, t });
  assert.equal(row.selected, 'en');
  assert.equal(needsRelaunch('en', languages), false);
});

test('relaunch is needed only when the choice resolves differently from this launch', () => {
  assert.equal(needsRelaunch('system', two), false);
  assert.equal(needsRelaunch('de', two), false);
  assert.equal(needsRelaunch('en', two), true);
});
