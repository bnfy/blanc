// The Android search-engine list (A5a) is the shared schema's, in its order, in both places it is spelled.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const schema = JSON.parse(fs.readFileSync(new URL('../../settings-schema/schema.json', import.meta.url), 'utf8'));
const java = file => fs.readFileSync(new URL(`../blanc/android/java/src/org/chromium/blanc/${file}`, import.meta.url), 'utf8');
// Everything the phone offers: the schema's engines except `custom`, which the iPhone doesn't offer either.
const offered = schema.searchEngines.filter(e => e.id !== 'custom');

test('SearchEngines.java lists the schema\'s engines, in order, with their labels', () => {
  const found = [...java('settings/SearchEngines.java').matchAll(/new Engine\("([a-z]+)", "([^"]+)", "([^"]+)"\)/g)].map(m => ({id: m[1], label: m[2]}));
  assert.deepEqual(found, offered.map(e => ({id: e.id, label: e.label})));
});

test('SyncedSettings accepts exactly those engine ids', () => {
  const m = /"searchEngine", List\.of\(([^)]+)\)/.exec(java('sync/SyncedSettings.java'));
  assert.ok(m, 'the searchEngine key is there');
  assert.deepEqual([...m[1].matchAll(/"([a-z]+)"/g)].map(x => x[1]), offered.map(e => e.id));
});

test('the default engine is the schema\'s', () => {
  assert.equal(schema.defaults.searchEngine, 'duckduckgo');
  assert.match(java('settings/SearchEngines.java'), /DEFAULT = "duckduckgo"/);
});
