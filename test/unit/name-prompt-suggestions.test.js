'use strict';
// Typing a new group name is not a search: the name prompt must never send
// it to the search provider (spec 2026-10-16-island-lower-section §9.3).
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const overlay = fs.readFileSync(path.join(__dirname, '../../src/renderer/overlay.js'), 'utf8');
const source = overlay.match(/\n {2}function scheduleSearchSuggestions\(\) \{[\s\S]*?\n {2}\}\n/)?.[0];

test('scheduleSearchSuggestions could be lifted from overlay.js', () => {
  assert.ok(source, 'scheduleSearchSuggestions not found — update this test with it');
});

function schedule({ namePrompt }) {
  const timers = [];
  const sandbox = {
    resetSearchSuggestions: () => {},
    addressInput: { value: 'Divorce lawyers' },
    inputTouched: true,
    looksLikeAddress: () => false,
    activeTab: () => ({ private: false }),
    addressInputComposing: false,
    suppressProviderSuggestions: false,
    namePrompt,
    suggestionRequestGeneration: 0,
    suggestionDebounce: null,
    setTimeout: (fn) => { timers.push(fn); return 1; },
  };
  vm.runInNewContext(`${source}\nscheduleSearchSuggestions();`, sandbox);
  return timers.length;
}

test('ordinary typing schedules a suggestion request', () => {
  assert.equal(schedule({ namePrompt: null }), 1);
});

test('a name prompt never schedules one', () => {
  assert.equal(schedule({ namePrompt: { kind: 'group', id: 'g', prefill: 'Work', notice: '' } }), 0);
});
