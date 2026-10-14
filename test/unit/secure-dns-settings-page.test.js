'use strict';

// Encrypted DNS's Custom provider address row meets the same standard as the
// Custom search address row (search-engine-settings-page.test.js).
const assert = require('node:assert/strict');
const { withoutInterfaceKeys } = require('../support/without-interface-keys');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const html = withoutInterfaceKeys(fs.readFileSync(path.join(__dirname, '../../src/renderer/pages/settings.html'), 'utf8'));

test('the provider address field is named by its label and announces its error', () => {
  // A screen reader would otherwise name the field by its placeholder and
  // never hear that an address was refused. A provider address can carry a
  // personal profile id, so the browser's own form history stays off.
  const input = html.match(/<input id="secureDnsTemplate"[^>]*>/)[0];
  assert.match(html, /<span id="secureDnsTemplateLabel">Custom provider address<\/span>/);
  assert.match(html, /<span class="hint" id="secureDnsTemplateHint">/);
  assert.match(html, /<span class="hint field-error" id="secureDnsError" role="alert" hidden>/);
  assert.match(input, /aria-labelledby="secureDnsTemplateLabel"/);
  assert.match(input, /aria-describedby="secureDnsTemplateHint"/);
  assert.match(input, /autocomplete="off"/);
  assert.match(input, /spellcheck="false"/);
  assert.match(input, / placeholder="https:\/\/your-provider\.example\/dns-query"/);
});

test('the error joins the field description only while it shows', () => {
  // Chromium reads a hidden element named by aria-describedby, so a static
  // link would read "That address isn't valid" on a perfectly good field.
  const js = fs.readFileSync(path.join(__dirname, '../../src/renderer/pages/settings.js'), 'utf8');
  const block = js.match(/\/\/ --- Encrypted DNS \(DoH\) ---([\s\S]*?)\/\/ --- 1Password/)[1];
  assert.match(block, /secureDnsTemplate\.setAttribute\('aria-describedby', shown \? 'secureDnsTemplateHint secureDnsError' : 'secureDnsTemplateHint'\)/);
  assert.match(block, /secureDnsError\.hidden = !shown;/);
  // Every place the error is shown or hidden goes through that one helper.
  assert.doesNotMatch(block, /secureDnsError\.hidden = (true|false)/);
  assert.doesNotMatch(block, /setAttribute\('aria-invalid', '(true|false)'\)/);
});
