// The Electron profile importer's plan builder (plan
// docs/superpowers/plans/2026-11-16-electron-profile-importer.md, task 1):
// the bundle the sandboxed runner executes turns an Electron data folder's
// files into one plan, checked here against the fixture's answer key. It runs
// in bare V8 with no host at all: it reads nothing and calls nothing.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {profileImportBundle, hashProfileImport} from './build-profile-import-bundle.mjs';
import {buildFixture} from './importer-fixtures.mjs';

const bundle = profileImportBundle();
const plain = value => JSON.parse(JSON.stringify(value));
// The fixture's files as the browser hands them over: paths under the data folder.
const sourceFiles = (change = files => files) => {
  const {files, expected} = buildFixture();
  const relative = Object.fromEntries(Object.entries(files).map(([name, text]) => [name.slice('userData/'.length), text]));
  return {files: change(relative) ?? relative, expected};
};
function plan(files, method = 'profile.plan') {
  const context = vm.createContext({});
  vm.runInContext(bundle, context);
  return new Promise(resolve => context.__call(method, JSON.stringify([files]),
    (ok, text) => resolve(ok ? JSON.parse(text) : {failed: text})));
}

test('the committed bundle is the generated one, with its pinned hash', () => {
  assert.equal(fs.readFileSync(new URL('../blanc/services/sync_runner/generated/profile-import-bundle.js', import.meta.url), 'utf8'), bundle);
  assert.match(fs.readFileSync(new URL('../blanc/services/sync_runner/profile_import_bundle_hash.h', import.meta.url), 'utf8'), new RegExp(hashProfileImport(bundle)));
});

test('the fixture becomes the answer key, store for store', async () => {
  const {files, expected} = sourceFiles();
  const result = await plan(files);
  assert.equal(result.ok, true);
  assert.equal(result.schema, 1);
  assert.equal(result.sourceVersion, '1.49.1');
  assert.deepEqual(result.errors, []);
  assert.deepEqual(Object.keys(result.profiles).sort(), Object.keys(expected.profiles).sort());
  for (const [id, stores] of Object.entries(expected.profiles)) {
    for (const [name, content] of Object.entries(stores)) assert.deepEqual(result.profiles[id].stores[name], plain(content), `${id}/${name}`);
    assert.deepEqual(Object.keys(result.profiles[id].stores).sort(), Object.keys(stores).sort(), id);
  }
  assert.deepEqual(result.profiles.personal.id, 'default');
  assert.deepEqual(result.profiles.personal.name, 'Personal');
  assert.deepEqual(result.profiles.profile_22222222222242228222222222222222.name, 'Fixture profile');
  assert.deepEqual(result.device, plain(expected.device));
});

test('what is left behind is listed with its reason, and matches the answer key', async () => {
  const {files, expected} = sourceFiles();
  const result = await plan(files);
  assert.deepEqual(result.notImported.map(row => row.source).sort(), expected.notImported.map(row => row.source).sort());
  for (const row of result.notImported) assert.ok(typeof row.reason === 'string' && row.reason.length > 10, row.source);
});

test('a damaged store fails its own profile and no other', async () => {
  for (const [change, reason] of [
    [files => { files['bookmarks.json'] = '{"items": [}'; }, 'invalid-json'],
    [files => { files['history.json'] = JSON.stringify({entries: 'none', siteIcons: []}); }, 'invalid-shape'],
    [files => { files['workspaces.json'] = '[]'; }, 'invalid-shape'],
    [files => { files['bookmarks.json'] = ' '.repeat(33 * 1024 * 1024); }, 'too-large'],
  ]) {
    const {files} = sourceFiles(change);
    const result = await plan(files);
    assert.equal(result.ok, true);
    assert.equal(result.profiles.personal, undefined, reason);
    assert.ok(result.profiles.profile_22222222222242228222222222222222, reason);
    assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0].profile, 'personal');
    assert.equal(result.errors[0].reason, reason);
    assert.ok(result.device, 'the device stores still import');
  }
  const {files} = sourceFiles(f => { f['profiles/profile_22222222222242228222222222222222/archive.json'] = 'not json'; });
  const result = await plan(files);
  assert.ok(result.profiles.personal);
  assert.equal(result.profiles.profile_22222222222242228222222222222222, undefined);
  assert.deepEqual(result.errors, [{profile: 'profile_22222222222242228222222222222222', store: 'archive.json', reason: 'invalid-json'}]);
});

test('a store that was never written is simply absent', async () => {
  const {files} = sourceFiles(f => { delete f['archive.json']; delete f['reader-appearance.json']; });
  const result = await plan(files);
  assert.deepEqual(result.errors, []);
  assert.ok(!Object.hasOwn(result.profiles.personal.stores, 'archive.json'));
  assert.ok(Object.hasOwn(result.profiles.personal.stores, 'bookmarks.json'));
});

test('an unsupported or unrecognizable source is refused whole', async () => {
  const older = sourceFiles(f => { f['settings.json'] = JSON.stringify({...JSON.parse(f['settings.json']), lastRunVersion: '1.39.9'}); });
  assert.deepEqual(await plan(older.files), {ok: false, error: 'unsupported-version', sourceVersion: '1.39.9'});
  const unknown = sourceFiles(f => { f['settings.json'] = JSON.stringify({...JSON.parse(f['settings.json']), lastRunVersion: ''}); });
  assert.deepEqual(await plan(unknown.files), {ok: false, error: 'unknown-version', sourceVersion: ''});
  assert.deepEqual(await plan({}), {ok: false, error: 'no-source'});
  assert.deepEqual(await plan({'settings.json': '{'}), {ok: false, error: 'no-source'});
  assert.deepEqual(await plan('not files'), {ok: false, error: 'no-source'});
  for (const version of ['1.40.0', '1.49.1', '2.0.0', '1.100.3']) {
    const fine = sourceFiles(f => { f['settings.json'] = JSON.stringify({...JSON.parse(f['settings.json']), lastRunVersion: version}); });
    assert.equal((await plan(fine.files)).ok, true, version);
  }
});

test('profile folders are read only for profiles the registry still lists', async () => {
  const {files} = sourceFiles(f => {
    f['profiles/profile_33333333333343338333333333333333/bookmarks.json'] = JSON.stringify({items: [{id: 'x', url: 'https://gone.example/'}], tombstones: []});
    f['profiles/../escape/bookmarks.json'] = JSON.stringify({items: [], tombstones: []});
    f['profiles/not_listed/bookmarks.json'] = JSON.stringify({items: [], tombstones: []});
  });
  const result = await plan(files);
  assert.deepEqual(Object.keys(result.profiles).sort(), ['personal', 'profile_22222222222242228222222222222222']);
});

test('private downloads and unpromptable permissions never reach the plan', async () => {
  const {files} = sourceFiles(f => {
    const downloads = JSON.parse(f['downloads.json']);
    downloads.items.push({...downloads.items[0], id: 'private_one', private: true});
    f['downloads.json'] = JSON.stringify(downloads);
    const permissions = JSON.parse(f['site-permissions.json']);
    permissions.decisions['https://personal.example.com|midiSysex'] = 'allow';
    permissions.decisions['https://personal.example.com|media'] = 'allow';
    f['site-permissions.json'] = JSON.stringify(permissions);
  });
  const result = await plan(files);
  assert.deepEqual(result.profiles.personal.stores['downloads.json'].items.map(item => item.id), ['personal_download']);
  const kept = Object.keys(result.profiles.personal.stores['site-permissions.json'].decisions);
  assert.ok(!kept.some(key => /midiSysex|clipboard-read/.test(key)));
  assert.ok(kept.includes('https://personal.example.com|media'), 'a legacy broad media decision is kept for the applier to read as shipping does');
  assert.ok(result.notImported.some(row => row.source === 'userData/downloads.json#/items/1'));
});

test('only the plan call exists, and the bundle touches no host', async () => {
  const {files} = sourceFiles();
  assert.deepEqual(await plan(files, 'desktop.import'), {failed: 'forbidden'});
  assert.deepEqual(await plan(files, 'sync.start'), {failed: 'forbidden'});
  assert.ok(!/__host|require\(|fetch\(|XMLHttpRequest|import\(/.test(bundle));
});
