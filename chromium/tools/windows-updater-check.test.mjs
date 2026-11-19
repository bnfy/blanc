// W3 Task B2's runner check reads the updater's names from the one file that
// brands it, and reads the updater's own records to see the beta registered.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {updaterNames, clientsKey, updaterFolder, registeredApps} from '../windows/updater-check.mjs';

const gni = fs.readFileSync(new URL('../blanc/branding/win-beta/updater.gni', import.meta.url), 'utf8');

test('the updater\'s names come from blanc/branding/win-beta/updater.gni', () => {
  const names = updaterNames(gni);
  assert.equal(names.company, 'Bananify');
  assert.equal(names.product, 'BlancUpdater');
  assert.match(names.browserAppId, /^\{[0-9a-f-]{36}\}$/);
  assert.equal(clientsKey(names), `HKEY_CURRENT_USER\\Software\\Bananify\\Update\\Clients\\${names.browserAppId}`);
  assert.equal(updaterFolder('C:\\Users\\a\\AppData\\Local', names), 'C:\\Users\\a\\AppData\\Local\\Bananify\\BlancUpdater');
  assert.throws(() => updaterNames('browser_appid = "{x}"'), /updater_company_short_name/);
});
test('registered apps are read from the updater\'s prefs, ids in lower case', () => {
  // PersistedData (chrome/updater/persisted_data.cc): "updateclientdata" ->
  // "apps" -> one dictionary per lower-cased app id.
  const prefs = JSON.stringify({updateclientdata: {apps: {'{ABC-1}': {pv: '1.0'}, other: {}}}});
  assert.deepEqual(registeredApps(prefs), ['{abc-1}', 'other']);
  assert.deepEqual(registeredApps('{}'), []);
  assert.deepEqual(registeredApps('not json'), []);
});
test('the online installer\'s tag names the beta, per user (needsadmin is true, false or prefers in tag.cc)', async () => {
  const {installTag} = await import('../windows/updater-check.mjs');
  const names = updaterNames(gni);
  assert.equal(installTag(names), `appguid=${names.browserAppId}&appname=Blanc%20Beta&needsadmin=false`);
  assert.doesNotMatch(installTag(names), /[ "]/, 'one command-line argument, no quoting needed');
});
