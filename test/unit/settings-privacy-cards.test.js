'use strict';

// Privacy & Security reads as five titled cards instead of one card with five
// sub-sections (spec 2026-09-26 §5.5). Every id settings.js reads survives.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const html = fs.readFileSync(path.join(__dirname, '../../src/renderer/pages/settings.html'), 'utf8');
const privacy = html.match(/<section class="settings-group" id="group-privacy">([\s\S]*?)<\/section>/)[1];

test('Privacy & Security is five titled cards, in order', () => {
  const titles = [...privacy.matchAll(/<h3 class="card-title">([^<]+)<\/h3>/g)].map((m) => m[1]);
  assert.deepEqual(titles, ['Blocking', 'Calls and connections', '1Password', 'Site permissions', 'Usage and data']);
  assert.equal((privacy.match(/class="settings-card"/g) || []).length, 5);
  assert.doesNotMatch(privacy, /class="group-subsection"/);
});

test('every control id the page script uses is still present', () => {
  for (const id of ['adblockEnabled', 'exceptionInput', 'exceptionAdd', 'exceptionList', 'webrtcPolicy',
    'webrtcAudioBuffer', 'secureDns', 'secureDnsCustomRow', 'secureDnsTemplate', 'secureDnsError',
    'onePasswordSettings', 'onePasswordAppHint', 'onePasswordOpenApp', 'onePasswordEnabled',
    'onePasswordAccount', 'onePasswordVerify', 'onePasswordVerifyState', 'permissionList', 'usagePing',
    'resetInstallId', 'resetInstallIdStatus', 'clearBrowsingData', 'clearBrowsingDataStatus']) {
    assert.match(privacy, new RegExp(`id="${id}"`), id);
  }
});

// iOS sends a capabilities list and settings.js removes unsupported controls,
// often by walking up to a wrapper class. A wrapper renamed in the markup
// makes that removal silently do nothing, so every class it walks to must
// still exist in the page.
test('every wrapper class settings.js removes through exists in settings.html', () => {
  const js = fs.readFileSync(path.join(__dirname, '../../src/renderer/pages/settings.js'), 'utf8');
  const walked = [...js.matchAll(/\.closest\('\.([a-z0-9-]+)'\)\?\.remove\(\)/g)].map((m) => m[1]);
  assert.ok(walked.length > 0, 'no closest(...).remove() calls found — update this test');
  const missing = [...new Set(walked)].filter((cls) => !new RegExp(`class="[^"]*\\b${cls}\\b`).test(html));
  assert.deepEqual(missing, []);
});

test('every element settings.js removes by id exists in settings.html', () => {
  const js = fs.readFileSync(path.join(__dirname, '../../src/renderer/pages/settings.js'), 'utf8');
  const ids = [...js.matchAll(/getElementById\('([A-Za-z0-9-]+)'\)\?\.remove\(\)/g)].map((m) => m[1]);
  assert.ok(ids.includes('sitePermissionsCard') && ids.includes('adblockExceptionsBlock'),
    'the Privacy card removals are found — update this test if they move');
  const missing = [...new Set(ids)].filter((id) => !html.includes(`id="${id}"`));
  assert.deepEqual(missing, []);
});
