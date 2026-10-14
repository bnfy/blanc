'use strict';

// The Custom search address row reuses the Encrypted DNS pattern: hidden
// until Custom… is chosen, an error line, and a placeholder showing %s.
const assert = require('node:assert/strict');
const { withoutInterfaceKeys } = require('../support/without-interface-keys');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const pages = path.join(__dirname, '../../src/renderer/pages');
const html = withoutInterfaceKeys(fs.readFileSync(path.join(pages, 'settings.html'), 'utf8'));
const js = fs.readFileSync(path.join(pages, 'settings.js'), 'utf8');
const en = require('../../copy/messages/en.json');

test('the custom search address row follows the search engine select, hidden', () => {
  const select = html.indexOf('<select id="searchEngine">');
  const row = html.indexOf('<div class="setting" id="searchEngineCustomRow" hidden>');
  assert.ok(select > 0 && row > select, 'row comes right after the engine select');
  assert.ok(row < html.indexOf('id="searchSuggestions"'), 'and before Search suggestions');
  assert.match(html, /<span class="hint field-error" id="searchEngineTemplateError" role="alert" hidden>/);
  assert.match(html, /<input id="searchEngineTemplate" type="url"[^>]* placeholder="https:\/\/search\.example\.com\/search\?q=%s"/);
});

test('the address field is named by its label and announces its error', () => {
  // A screen reader would otherwise name the field by its placeholder and
  // never hear that an address was refused. The field can hold a Kagi
  // token, so the browser's own form history stays off.
  const input = html.match(/<input id="searchEngineTemplate"[^>]*>/)[0];
  assert.match(html, /<span id="searchEngineTemplateLabel">Custom search address<\/span>/);
  assert.match(html, /<span class="hint" id="searchEngineTemplateHint">/);
  assert.match(input, /aria-labelledby="searchEngineTemplateLabel"/);
  assert.match(input, /aria-describedby="searchEngineTemplateHint"/);
  assert.match(input, /autocomplete="off"/);
  assert.match(input, /spellcheck="false"/);
});

test('the error joins the field description only while it shows', () => {
  // Chromium reads a hidden element named by aria-describedby, so a static
  // link would read "That address isn't valid" on a perfectly good field.
  const block = js.match(/\/\/ --- Search engine, with the Custom address[\s\S]*?\/\/ --- Tab presentation/)[0];
  assert.match(block, /searchTemplate\.setAttribute\('aria-describedby', shown \? 'searchEngineTemplateHint searchEngineTemplateError' : 'searchEngineTemplateHint'\)/);
  assert.match(block, /searchTemplateError\.hidden = !shown;/);
  // Every place the error is shown or hidden goes through that one helper.
  assert.doesNotMatch(block, /searchTemplateError\.hidden = (true|false)/);
  assert.doesNotMatch(block, /setAttribute\('aria-invalid', '(true|false)'\)/);
});

test('the page script reads every new id and gates Custom on its capability', () => {
  for (const id of ['searchEngineCustomRow', 'searchEngineTemplate', 'searchEngineTemplateError']) {
    assert.match(js, new RegExp(`getElementById\\('${id}'\\)`), id);
  }
  assert.match(js, /supports\('searchEngineTemplate'\)/);
  assert.match(js, /t\('settings\.general\.searchEngine\.custom'\)/);
});

test('a field error inside a setting label is drawn in the danger colour', () => {
  // `.setting .label .hint` (three classes) sets the dim hint colour, so the
  // generic `.hint.field-error` (two) loses; the error needs its own rule.
  const css = fs.readFileSync(path.join(pages, 'pages.css'), 'utf8');
  assert.match(css, /\.setting \.label \.hint\.field-error\s*\{\s*color:\s*var\(--danger\);\s*\}/);
});

test('the new strings exist in English with notes', () => {
  for (const key of [
    'settings.general.searchEngine.custom',
    'settings.general.searchEngineTemplate.label',
    'settings.general.searchEngineTemplate.hint',
    'settings.general.searchEngineTemplateError',
  ]) {
    assert.equal(typeof en[key]?.message, 'string', key);
    assert.equal(typeof en[key]?.note, 'string', key);
  }
  assert.match(en['settings.general.searchEngineTemplate.hint'].message, /%s/);
});
