// W3 Task B1: Chromium's updater, branded for Blanc Beta on Windows. Every
// value Chromium's fallback branding sets gets a Blanc value, and none is
// Chromium's (or would collide with another Chromium-based app that bundles
// the same updater: names, app ids, COM class and interface GUIDs, mutexes).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
// `name = "value"` pairs, a value possibly on the next line.
const values = text => Object.fromEntries([...text.matchAll(/^\s*([A-Za-z_0-9]+)\s*=\s*\n?\s*"([^"]*)"/gm)].map(m => [m[1], m[2]]));
const upstream = read('../upstream/chrome/updater/branding.gni');
const chromium = values(upstream.slice(upstream.indexOf('} else {'), upstream.indexOf('\n}\n', upstream.indexOf('} else {'))));
const blanc = values(read('../blanc/branding/win-beta/updater.gni'));
const patch = read('../patches/0099-blanc-windows-updater-branding.patch');

// Values Blanc keeps on purpose: the strings resource and the branding flag
// (Blanc is not Chrome-branded). crx_pkhash is Blanc's publisher key hash
// (W3 Task B3, tools/windows-update-keys.test.mjs).
const SAME = new Set(['grdfile_name', 'extra_args_is_chrome_branded']);

test('Blanc\'s updater branding sets every value Chromium\'s does', () => {
  assert.ok(Object.keys(chromium).length >= 80, 'the upstream fallback branding was read');
  assert.deepEqual(Object.keys(blanc).sort(), Object.keys(chromium).sort());
});
test('no Blanc updater value is Chromium\'s, and every id is unique', () => {
  for (const [key, value] of Object.entries(blanc))
    if (!SAME.has(key)) assert.notEqual(value.toLowerCase(), chromium[key].toLowerCase(), key);
  const ids = Object.entries(blanc).filter(([key]) => /GUID$|appid$|_mutex|mutex_prefix/.test(key)).map(([, value]) => value.toLowerCase());
  assert.equal(new Set(ids).size, ids.length, 'every GUID, app id and mutex is unique');
  for (const id of ids) assert.match(id, /^\{?[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}\}?$/, id);
});
test('the updater names Blanc and checks blanc.day', () => {
  assert.equal(blanc.updater_product_full_display_name, 'Blanc Updater');
  assert.equal(blanc.updater_company_full_name, 'Bananify Creative');
  assert.equal(blanc.browser_name, 'Blanc Beta');
  assert.equal(blanc.update_check_url, 'https://blanc.day/update/win/v4');
  for (const key of ['crash_upload_url', 'help_center_url', 'app_logo_url', 'updater_event_logging_url'])
    assert.match(blanc[key], /^https:\/\/blanc\.day\//, key);
});
test('the branding applies to the Windows beta only', () => {
  assert.match(patch, /^\+\} else if \(blanc_channel == "beta" && target_os == "win"\) \{$/m);
  assert.match(patch, /^\+  import\("\/\/blanc\/branding\/win-beta\/updater\.gni"\)$/m);
});
