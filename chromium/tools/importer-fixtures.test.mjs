import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {execFileSync, spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {buildFixture, writeFixture} from './importer-fixtures.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const cli = fileURLToPath(new URL('./importer-fixtures.mjs', import.meta.url));
const sourceCache = new Map();
function shipping(file) {
  if (!sourceCache.has(file)) sourceCache.set(file,
    execFileSync('git', ['show', `v1.49.1:${file}`], {cwd: root, encoding: 'utf8'}));
  return sourceCache.get(file);
}
const plain = value => JSON.parse(JSON.stringify(value));
function literal(file, pattern, bindings = {}) {
  const match = shipping(file).match(pattern);
  assert.ok(match, `missing shipping schema: ${file} ${pattern}`);
  return plain(vm.runInNewContext(`(${match[1]})`, bindings));
}
const constant = (file, name) => literal(`src/main/${file}`,
  new RegExp(`const ${name} = ([^;]+);`));

// Load only the pinned pure models, never Electron, native code, the app or
// working-tree product modules. Unexpected non-relative imports fail closed.
const modelCache = new Map();
function model(file) {
  if (modelCache.has(file)) return modelCache.get(file).exports;
  const module = {exports: {}};
  modelCache.set(file, module);
  vm.runInNewContext(shipping(file), {module, exports: module.exports, Buffer, URL, URLSearchParams,
    require(specifier) {
      assert.ok(specifier.startsWith('.'), `unexpected model dependency: ${specifier}`);
      return model(path.posix.normalize(path.posix.join(path.posix.dirname(file), `${specifier}.js`)));
    },
  }, {filename: `v1.49.1:${file}`});
  return module.exports;
}
const input = (fixture, file) => JSON.parse(fixture.files[`userData/${file}`]);
function profileInputs(fixture) {
  return Object.entries(fixture.expected.profiles).map(([id, expected]) => {
    const prefix = id === 'personal' ? 'userData' : `userData/profiles/${id}`;
    return {id, prefix, expected,
      read: name => JSON.parse(fixture.files[`${prefix}/${name}`])};
  });
}
function temporary(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-importer-fixtures-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  return dir;
}
function tree(dir, prefix = '') {
  const entries = {};
  for (const name of fs.readdirSync(path.join(dir, prefix)).sort()) {
    const relative = path.posix.join(prefix, name);
    if (fs.statSync(path.join(dir, relative)).isDirectory()) Object.assign(entries, tree(dir, relative));
    else entries[relative] = fs.readFileSync(path.join(dir, relative));
  }
  return entries;
}
function run(args) {
  return spawnSync(process.execPath, [cli, ...args], {cwd: root, encoding: 'utf8'});
}

test('pure builds and independent writes produce identical trees, including expected.json', t => {
  const first = buildFixture();
  assert.deepEqual(first, buildFixture());
  const parent = temporary(t);
  const a = path.join(parent, 'a');
  const b = path.join(parent, 'b');
  assert.deepEqual(writeFixture(a), {out: a, files: Object.keys(first.files).length + 1});
  writeFixture(b);
  const actual = tree(a);
  assert.deepEqual(actual, tree(b));
  assert.deepEqual(JSON.parse(actual['expected.json']), first.expected);
  assert.equal(actual['expected.json'].toString('utf8'), `${JSON.stringify(first.expected, null, 2)}\n`);
  assert.deepEqual(Object.keys(actual).sort(), [...Object.keys(first.files), 'expected.json'].sort());
  for (const [name, content] of Object.entries(first.files)) {
    assert.equal(typeof content, 'string', name);
    assert.deepEqual(actual[name], Buffer.from(content, name.endsWith('.jpg') ? 'latin1' : 'utf8'), name);
  }
});

test('all JSON parses, uses two-space indentation and ends with a newline', () => {
  const fixture = buildFixture();
  for (const [name, content] of Object.entries(fixture.files)) {
    if (name.endsWith('.json')) assert.equal(content, `${JSON.stringify(JSON.parse(content), null, 2)}\n`, name);
  }
  assert.equal(fixture.expected.schema, 1);
  assert.equal(fixture.expected.source, 'v1.49.1');
});

test('Favorites drop real tombstones and keep live insertion order rather than alphabetizing', () => {
  for (const {read, expected} of profileInputs(buildFixture())) {
    const before = read('bookmarks.json');
    const after = expected['bookmarks.json'];
    assert.ok(before.tombstones.length > 0);
    assert.deepEqual(after.tombstones, []);
    assert.deepEqual(after.items, before.items);
    assert.deepEqual(after.items.map(item => item.title), ['Zeta', 'Alpha']);
    for (const removed of before.tombstones) assert.ok(!JSON.stringify(after).includes(removed.url));
  }
});

test('history keeps the newest shipping-cap visits and the stored site icons', () => {
  const cap = constant('history.js', 'MAX_ENTRIES');
  for (const {read, expected} of profileInputs(buildFixture())) {
    const before = read('history.json');
    const after = expected['history.json'];
    assert.equal(before.entries.length, cap + 1);
    assert.equal(after.entries.length, cap);
    assert.deepEqual(after.entries, before.entries.slice(0, cap));
    assert.ok(!after.entries.some(entry => entry.url === before.entries[cap].url));
    assert.ok(before.entries.every((entry, index) => !index || before.entries[index - 1].visitedAt > entry.visitedAt));
    assert.deepEqual(after.siteIcons, before.siteIcons);
  }
});

test('only shipping-promptable permission types survive, including separate audio/video decisions', () => {
  const prompted = literal('src/main/permissions.js', /const PROMPTED = new Set\((\[[^;]+\])\);/);
  for (const {read, expected} of profileInputs(buildFixture())) {
    const before = read('site-permissions.json').decisions;
    const after = expected['site-permissions.json'].decisions;
    const unsupported = Object.keys(before).filter(name => !prompted.includes(name.split('|')[1]));
    assert.ok(unsupported.length > 0);
    assert.ok(unsupported.every(name => !Object.hasOwn(after, name)));
    assert.deepEqual(after, Object.fromEntries(Object.entries(before).filter(([name]) => prompted.includes(name.split('|')[1]))));
    assert.deepEqual([...new Set(Object.keys(after).map(name => name.split('|')[1]))].sort(), [...prompted].sort());
    assert.ok(Object.keys(after).some(name => name.endsWith('|media|audio') && after[name] === 'allow'));
    assert.ok(Object.keys(after).some(name => name.endsWith('|media|video') && after[name] === 'deny'));
  }
});

test('pending deletion changes both the registry and marker, never importing the removed identity', () => {
  const fixture = buildFixture();
  const pending = input(fixture, 'profile-deletions.json').profileIds;
  const registry = input(fixture, 'profiles.json');
  assert.ok(pending.length > 0);
  assert.ok(pending.every(id => registry.profiles.some(profile => profile.id === id)));
  assert.deepEqual(fixture.expected.device['profile-deletions.json'].profileIds, []);
  assert.deepEqual(fixture.expected.device['profiles.json'].profiles,
    registry.profiles.filter(profile => !pending.includes(profile.id)));
  for (const id of pending) {
    assert.ok(!Object.hasOwn(fixture.expected.profiles, id));
    assert.ok(!JSON.stringify(fixture.expected.profiles).includes(id));
  }
});

test('session v2 preserves two windows, zipped metadata, a colored group and a two-pane split', () => {
  const fixture = buildFixture();
  const session = input(fixture, 'session.json');
  const workspace = model('src/main/session-workspace.js');
  assert.equal(session.version, workspace.SESSION_WORKSPACE_VERSION);
  assert.equal(session.windows.length, 2);
  assert.deepEqual(fixture.expected.device['session.json'], session);
  assert.deepEqual(plain(workspace.buildSaveShape(session.windows, {}, {activeWindowId: session.activeWindowId})), session);
  assert.deepEqual(plain(workspace.loadWorkspace(session).windows), session.windows);
  for (const window of session.windows) {
    for (const name of ['meta', 'groupIds', 'pinned', 'inheritsDocumentPolicy']) assert.equal(window[name].length, window.urls.length, name);
    assert.ok(window.meta.every(meta => meta.title && meta.favicon));
  }
  const first = session.windows[0];
  const group = first.groups[0];
  assert.ok(group.name && group.color);
  assert.deepEqual(plain(model('src/main/group-color.js').groupRecord(group)), group);
  const split = first.splits[0];
  assert.equal(first.splitIds.filter(id => id === split.id).length, 2);
  assert.deepEqual(split.layout, {kind: 'columns', widths: [0.5, 0.5]});
  assert.equal(split.focusedIndex, 1);
  assert.deepEqual(plain(model('src/main/split-model.js').restoreSplits(first.splits, first.splitIds, ['a', 'b', 'c']))[0].tabIds, ['b', 'c']);
});

test('shipping cannot serialize a private session tab: exercise the writer, do not invent a disk field', () => {
  const snapshot = model('src/main/session-snapshot.js');
  const normal = {id: 'normal', url: 'https://example.com/normal', private: false};
  const privateTab = {id: 'private_fixture', url: 'https://example.com/private-fixture', private: true};
  assert.deepEqual(plain(snapshot.persistableEntries([normal, privateTab])),
    [{id: 'normal', url: normal.url, groupId: null, pinned: false}]);
  const fixture = buildFixture();
  for (const session of [input(fixture, 'session.json'), fixture.expected.device['session.json']]) {
    assert.ok(!JSON.stringify(session).includes(privateTab.url));
    assert.ok(!JSON.stringify(session).includes('"private"'));
  }
});

test('schema-for-schema stores, download metadata, device maps and install identity are carried unchanged', () => {
  const fixture = buildFixture();
  for (const {read, expected} of profileInputs(fixture)) {
    for (const name of ['start-page-pins.json', 'archive.json', 'workspaces.json', 'shared-spaces.json', 'synced-closed.json', 'reader-appearance.json', 'downloads.json']) {
      assert.deepEqual(expected[name], read(name), name);
    }
    assert.deepEqual(plain(model('src/main/workspaces-model.js').normalizeFile(read('workspaces.json'))), read('workspaces.json'));
    const record = read('downloads.json').items[0];
    assert.equal(record.state, 'completed');
    assert.ok(record.savePath);
    assert.ok(!Object.keys(fixture.files).some(name => name.includes('synthetic-downloads')));
  }
  const ownId = input(fixture, 'sync.json').deviceId;
  for (const name of ['tab-sync.json', 'tab-icons.json', 'sends.json', 'install.json', 'wallpaper.json']) {
    assert.deepEqual(fixture.expected.device[name], input(fixture, name), name);
    if (name !== 'install.json' && name !== 'wallpaper.json') assert.ok(Object.hasOwn(fixture.expected.device[name].devices, ownId), name);
  }
  assert.equal(fixture.expected.device['install.json'].id, input(fixture, 'install.json').id);
});

test('every copied schema version and Settings/Reader default equals pinned shipping source', () => {
  const fixture = buildFixture();
  for (const {read} of profileInputs(fixture)) {
    assert.equal(read('start-page-pins.json').version,
      literal('src/main/start-page-pins.js', /'start-page-pins', (\{[^\n]+\}), \{ scope/).version);
    assert.equal(read('archive.json').version,
      literal('src/main/archive.js', /'archive', (\{[^\n]+\}), \{ scope/).version);
    assert.equal(read('workspaces.json').version, constant('workspaces-model.js', 'WORKSPACES_VERSION'));
    assert.equal(read('workspaces.json').groupNamesRecased,
      literal('src/main/workspaces-model.js', /const EMPTY_FILE = \(\) => \((\{[^\n]+\})\);/,
        {WORKSPACES_VERSION: constant('workspaces-model.js', 'WORKSPACES_VERSION')}).groupNamesRecased);
    const shared = literal('src/main/shared-spaces.js', /const empty=\(\)=>\((\{[\s\S]*?\})\);/);
    assert.deepEqual(read('shared-spaces.json'), shared);
    assert.deepEqual(read('reader-appearance.json'), plain(model('src/main/reader-model.js').DEFAULT_APPEARANCE));
    assert.equal(read('archive.json').entries[0].documentPolicy, constant('document-policy.js', 'DOCUMENT_POLICY_VERSION'));
    assert.equal(read('workspaces.json').workspaces[0].documentPolicy, constant('document-policy.js', 'DOCUMENT_POLICY_VERSION'));
  }
  assert.equal(input(fixture, 'profiles.json').version, constant('local-profile-model.js', 'LOCAL_PROFILE_VERSION'));
  assert.equal(input(fixture, 'profiles.json').profiles[0].id, constant('local-profile-model.js', 'DEFAULT_PROFILE_ID'));
  assert.equal(input(fixture, 'profiles.json').profiles[0].name, constant('local-profile-model.js', 'DEFAULT_PROFILE_NAME'));
  assert.equal(input(fixture, 'profile-deletions.json').version, constant('profile-deletions.js', 'DELETE_MARKER_VERSION'));
  assert.equal(input(fixture, 'session.json').version, constant('session-workspace.js', 'SESSION_WORKSPACE_VERSION'));
  for (const window of input(fixture, 'session.json').windows) assert.equal(window.documentPolicy, constant('document-policy.js', 'DOCUMENT_POLICY_VERSION'));
  assert.equal(input(fixture, 'wallpaper.json').version,
    literal('src/main/wallpaper.js', /const EMPTY = Object.freeze\((\{[^\n]+\})\);/).version);

  const bindings = {
    VERTICAL_TABS_DEFAULT_WIDTH: constant('chrome-layout.js', 'VERTICAL_TABS_DEFAULT_WIDTH'),
    DEFAULT_MAPPING: literal('src/main/mouse-gestures.js', /const DEFAULT_MAPPING = Object.freeze\((\{[^\n]+\})\);/),
    PRESENTATION_DEFAULTS_RESET_VERSION: constant('settings.js', 'PRESENTATION_DEFAULTS_RESET_VERSION'),
    GROUP_NAMES_RECASE_VERSION: constant('settings.js', 'GROUP_NAMES_RECASE_VERSION'),
  };
  const defaults = literal('src/main/settings.js', /const DEFAULTS = (\{[\s\S]*?\n\});/, bindings);
  const generator = fs.readFileSync(cli, 'utf8');
  const copiedDefaults = generator.match(/const SETTINGS_DEFAULTS = (\{[\s\S]*?\n\});/);
  assert.ok(copiedDefaults);
  assert.deepEqual(plain(vm.runInNewContext(`(${copiedDefaults[1]})`)), defaults);
  const settings = input(fixture, 'settings.json');
  assert.deepEqual(Object.keys(settings).sort(), Object.keys(defaults).sort());
  assert.equal(settings.onboardingVersion, constant('settings.js', 'FIRST_RUN_VERSION'));
  assert.equal(settings.lastRunVersion, JSON.parse(shipping('package.json')).version);
  const changed = new Set(['theme', 'tabLayout', 'homePage', 'usagePing', 'onboardingVersion', 'firstRunCompletedAt', 'lastRunVersion', '_syncMeta', '_syncTieBreakers']);
  for (const [name, value] of Object.entries(defaults)) if (!changed.has(name)) assert.deepEqual(settings[name], value, name);
});

test('wallpaper is a real JPEG byte string and its unchanged metadata hash describes those bytes', () => {
  const fixture = buildFixture();
  const bytes = Buffer.from(fixture.files['userData/wallpaper/current.jpg'], 'latin1');
  assert.equal(bytes.subarray(0, 2).toString('hex'), 'ffd8');
  assert.equal(bytes.subarray(-2).toString('hex'), 'ffd9');
  const hashLength = Number(shipping('src/main/wallpaper.js').match(/digest\('hex'\)\.slice\(0, (\d+)\)/)?.[1]);
  assert.ok(hashLength > 0);
  assert.equal(input(fixture, 'wallpaper.json').hash, createHash('sha256').update(bytes).digest('hex').slice(0, hashLength));
  assert.equal(fixture.expected.device['wallpaper/current.jpg'], fixture.files['userData/wallpaper/current.jpg']);
  const frame = bytes.indexOf(Buffer.from([0xff, 0xc0]));
  assert.ok(frame > 0);
  assert.equal(input(fixture, 'wallpaper.json').height, bytes.readUInt16BE(frame + 5));
  assert.equal(input(fixture, 'wallpaper.json').width, bytes.readUInt16BE(frame + 7));
  assert.deepEqual(plain(model('src/main/wallpaper-model.js').normalizeMeta(input(fixture, 'wallpaper.json'))), input(fixture, 'wallpaper.json'));
});

test('all sources are accounted for and unresolved files have questions instead of invented expected values', () => {
  const fixture = buildFixture();
  // The owner answered both earlier questions on 2026-11-16; none is open.
  assert.deepEqual(fixture.expected.undecided, []);
  for (const row of fixture.expected.undecided) {
    assert.ok(row.question.endsWith('.') && row.question.includes('?'));
    assert.ok(Object.hasOwn(fixture.files, row.source));
    assert.ok(!Object.hasOwn(fixture.expected.device, path.posix.basename(row.source)));
  }
  for (const name of Object.keys(fixture.files)) {
    const relative = name.slice('userData/'.length);
    const named = relative.match(/^profiles\/([^/]+)\/(.+)$/);
    const answer = named ? fixture.expected.profiles[named[1]]?.[named[2]]
      : fixture.expected.profiles.personal[relative] ?? fixture.expected.device[relative];
    assert.ok(answer !== undefined || fixture.expected.undecided.some(row => row.source === name), name);
  }
  for (const row of fixture.expected.notImported) {
    assert.ok(row.reason);
    const [file, pointer] = row.source.split('#');
    let content = JSON.parse(fixture.files[file]);
    for (const segment of pointer.slice(1).split('/')) content = content[segment.replaceAll('~1', '/').replaceAll('~0', '~')];
    assert.notEqual(content, undefined, row.source);
  }
  const stores = ['bookmarks.json', 'history.json', 'downloads.json', 'site-permissions.json',
    'start-page-pins.json', 'archive.json', 'workspaces.json', 'shared-spaces.json',
    'synced-closed.json', 'reader-appearance.json'];
  // Personal also receives the synced settings (owner, 2026-11-16); no other profile does.
  for (const {expected} of profileInputs(fixture)) assert.deepEqual(Object.keys(expected).filter(name => name !== 'settings.json').sort(), stores.sort());
  assert.deepEqual(Object.keys(fixture.expected.profiles).filter(id => Object.hasOwn(fixture.expected.profiles[id], 'settings.json')), ['personal']);
  const settings = input(fixture, 'settings.json');
  assert.deepEqual({...fixture.expected.profiles.personal['settings.json'], ...fixture.expected.device['settings.json']},
    Object.fromEntries(Object.entries(settings).filter(([key]) => !['_syncMeta', '_syncTieBreakers', 'supporter', 'patron'].includes(key))));
  assert.deepEqual(fixture.expected.device['sync.json'], input(fixture, 'sync.json'));
  assert.equal(Object.keys(fixture.expected.profiles).length, 2);
  for (const name of Object.keys(fixture.files)) assert.ok(!/Cookies|Local Storage|IndexedDB|Service Worker|managed-ublock|WidevineCdm|cache/i.test(name), name);
  const sync = input(fixture, 'sync.json');
  assert.ok(!Object.hasOwn(sync, 'key') && !Object.hasOwn(sync, 'protectedKey'));
  assert.equal(input(fixture, 'settings.json').patron, null);
  assert.equal(input(fixture, 'settings.json').supporter, null);
});

test('no secret-like property has a non-empty string except the explicitly documented hostname field', () => {
  const fixture = buildFixture();
  // history.siteIcons[].key is the hostname index, not a cryptographic key
  // (v1.49.1:src/main/history.js:20-27,119-124). Match only the exact fixture
  // field/value; a key added to another object must fail this audit.
  const allowed = new Map(profileInputs(fixture).flatMap(({id, prefix}) => [
    [`files/${prefix}/history.json/siteIcons/0/key`, 'History hostname index'],
    [`expected/profiles/${id}/history.json/siteIcons/0/key`, 'History hostname index'],
  ]));
  const used = new Set();
  function inspect(value, location) {
    if (!value || typeof value !== 'object') return;
    for (const [name, child] of Object.entries(value)) {
      const at = `${location}/${name}`;
      if (/key|secret|token|passphrase/i.test(name) && typeof child === 'string' && child.length) {
        assert.ok(allowed.has(at), `secret-like property: ${at}`);
        assert.equal(child, 'example.com', at);
        assert.ok(allowed.get(at));
        used.add(at);
      }
      inspect(child, at);
    }
  }
  inspect(fixture.files, 'files');
  for (const [name, content] of Object.entries(fixture.files)) if (name.endsWith('.json')) inspect(JSON.parse(content), `files/${name}`);
  inspect(fixture.expected, 'expected');
  assert.deepEqual([...used].sort(), [...allowed.keys()].sort());
});

test('CLI creates a new fixture and prints exactly one JSON line', t => {
  const out = path.join(temporary(t), 'new-fixture');
  const result = run(['--out', out]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.equal(result.stdout.split('\n').length, 2);
  assert.deepEqual(JSON.parse(result.stdout), {out, files: Object.keys(tree(out)).length});
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(out, 'expected.json'), 'utf8')), buildFixture().expected);
});

test('CLI refuses existing folders and all argument forms outside --out <dir>', t => {
  const existing = temporary(t);
  fs.writeFileSync(path.join(existing, 'sentinel'), 'unchanged');
  const before = tree(existing);
  for (const args of [['--out', existing], ['--unknown'], [], ['--out'],
    ['--out', path.join(existing, 'new'), '--extra'], ['--out', '--unknown']]) {
    const result = run(args);
    assert.equal(result.status, 1, JSON.stringify(args));
    assert.equal(result.stdout, '');
    assert.equal(result.stderr.trimEnd().split('\n').length, 1);
    assert.ok(result.stderr.trim());
  }
  assert.deepEqual(tree(existing), before);
});
