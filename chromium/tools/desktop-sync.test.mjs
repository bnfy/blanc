// Standard-library C++ harness, like external-handoff.test.mjs. This does not
// build Chromium, start the runner, or launch a browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.dirname(root);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-desktop-sync-'));
const harness = path.join(dir, 'main.cc');
fs.writeFileSync(harness, `
#include <iostream>
#include <optional>
#include <string>
#include "blanc/browser/sync/sync_merge.h"
using namespace blanc::sync_merge;
std::optional<Favorite> favorite(const std::string& s) {
  if (s == "-") return std::nullopt;
  auto p = s.find('/');
  return Favorite{s.substr(0, p), p == std::string::npos ? "" : s.substr(p+1)};
}
int main() {
  std::string mode, a, b, c; bool x, y;
  while (std::cin >> mode) {
    if (mode == "favorite") {
      std::cin >> a >> b >> c >> x >> y;
      std::cout << static_cast<int>(FavoriteDirection(favorite(a), favorite(b), favorite(c), x, y)) << '\\n';
    } else if (mode == "recover") {
      std::cin >> a >> b >> c >> x;
      std::cout << RecoverFavoriteWrite(favorite(a), favorite(b), favorite(c), x) << '\\n';
    } else if (mode == "setting") {
      std::cin >> a >> b >> c >> x;
      std::cout << static_cast<int>(SettingDirection(a, b, c == "-" ? std::nullopt : std::optional<std::string>(c), x)) << '\\n';
    } else if (mode == "clock") {
      double local, remote, tomb; std::cin >> local >> remote >> tomb;
      std::cout << LocalItemWins(local, remote, tomb) << '\\n';
    } else if (mode == "mapping") {
      for (const auto& key : kSettings) std::cout << key.key << '=' << key.pref << '\\n';
    }
  }
}
`);
const exe = path.join(dir, 'logic');
execFileSync('c++', ['-std=c++20', '-Wall', '-Wextra', '-Werror', '-I', root,
  harness, path.join(root, 'blanc/browser/sync/sync_merge.cc'), '-o', exe]);
const run = lines => execFileSync(exe, {input: `${lines.join('\n')}\n`, encoding: 'utf8'}).trim().split('\n');
process.on('exit', () => fs.rmSync(dir, {recursive: true, force: true}));
const NONE = 0, APPLY = 1, PUBLISH = 2, ASK = 3;

test('three-way Favorites carries titles, folder moves, and removals in both directions', () => {
  const cases = [
    ['a/work', 'a/work', 'a/work', NONE],
    ['b/work', 'a/work', 'a/work', PUBLISH],
    ['a/home', 'a/work', 'a/work', PUBLISH],
    ['a/work', 'b/work', 'a/work', APPLY],
    ['a/work', 'a/home', 'a/work', APPLY],
    ['b/home', 'c/other', 'a/work', PUBLISH], // shipping arbitrates the proposal
    ['-', 'a/work', 'a/work', PUBLISH],
    ['a/work', '-', 'a/work', APPLY],
    ['b/work', '-', 'a/work', PUBLISH], // edit versus tombstone: shipping decides
    ['-', 'b/work', 'a/work', PUBLISH],
    ['-', '-', 'a/work', NONE],
    ['a/work', 'b/home', '-', APPLY], // existing account wins the initial match
    ['-', 'b/home', '-', APPLY],
    ['a/work', '-', '-', PUBLISH],
  ];
  const actual = run(cases.map(([l,r,s]) => `favorite ${l} ${r} ${s} 0 1`)).map(Number);
  assert.deepEqual(actual, cases.map(c => c[3]));
});

test('first upload requires consent; a declined URL remains local and account downloads continue', () => {
  assert.deepEqual(run([
    'favorite local - - 0 0',
    'favorite local - - 0 1',
    'favorite local - - 1 1',
    'favorite - remote - 0 0',
    'favorite local remote old 1 1',
  ]).map(Number), [ASK, PUBLISH, NONE, APPLY, NONE]);
});

test('a refused or interrupted native write retries, while a subsequent user edit survives', () => {
  assert.deepEqual(run([
    'recover - - remote 0',        // AddURL refused, or process died before bookmarks saved
    'recover old old remote 0',   // retitle/move was interrupted
    'recover old old - 0',        // remote remove did not reach disk
    'recover remote - remote 0',  // downloaded successfully
    'recover - - remote 1',       // user deliberately removed a new download
    'recover newer old remote 1', // user edited while the async pass was running
  ]).map(Number), [1, 1, 1, 0, 0, 0]);
});

test('settings retain remote-first simultaneous edits and suppress unsupported values', () => {
  assert.deepEqual(run([
    'setting dark light light 1',
    'setting light dark light 1',
    'setting dark system light 1',
    'setting dark system - 1',
    'setting dark future dark 0',
    'setting dark dark - 1',
  ]).map(Number), [PUBLISH, APPLY, APPLY, APPLY, NONE, NONE]);
});

test('only the seven requested desktop settings map to the inventory', () => {
  const rows = run(['mapping']).map(row => row.split('='));
  assert.deepEqual(rows.map(([key]) => key).sort(), [
    'theme','adblockEnabled','adblockExceptions','searchEngine','searchEngineTemplate','bangsEnabled','customBangs',
  ].sort());
  const inventory = JSON.parse(fs.readFileSync(path.join(root, 'settings-keys.json'), 'utf8')).keys;
  for (const [key, pref] of rows) {
    const record = inventory.find(row => row.key === key);
    assert.equal(record.status, 'built', key);
    assert.notEqual(record.kind, 'later');
    if (pref) assert.equal(pref, record.pref, key);
    else assert.match(record.store, /TemplateURLService/);
  }
});

test('conflict clock matrix matches v1.46.0 shipping mergeFromSync, including legacy clocks', () => {
  const require = createRequire(path.join(repo, 'src/main/bookmarks.js'));
  let store;
  class JsonStore {
    constructor() { store = this; this.data = {items: [], tombstones: []}; }
    update(fn) { fn(this.data); }
  }
  const cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file).exports;
    const module = {exports: {}};
    cache.set(file, module);
    const source = execFileSync('git', ['show', `v1.46.0:${file}`], {cwd: repo, encoding: 'utf8'});
    vm.runInNewContext(source, {module, exports: module.exports, Date, Buffer, URL,
      require: id => id === './store' ? {JsonStore} : id.startsWith('.')
        ? load(path.posix.normalize(path.posix.join(path.posix.dirname(file), `${id}.js`))) : require(id)});
    return module.exports;
  }
  const bookmarks = load('src/main/bookmarks.js');
  bookmarks.listBookmarks();
  const now = Date.now();
  const cases = [];
  const expected = [];
  for (const legacy of [false, true]) {
    for (const l of [-10, 0, 10]) for (const r of [-10, 0, 10]) for (const t of [-20, 0, 20]) {
      const held = {id: 'held', url: 'https://example.com/', title: 'remote', folder: 'Remote', addedAt: now+r};
      if (!legacy) held.updatedAt = now+r;
      store.data = {items: [held], tombstones: [{url: held.url, deletedAt: now+t}]};
      const candidate = {...held, id: 'local', title: 'local', folder: 'Local', updatedAt: now+l};
      bookmarks.mergeFromSync({items: [candidate], tombstones: []});
      expected.push(Number(store.data.items[0]?.id === 'local'));
      cases.push(`clock ${now+l} ${now+r} ${now+t}`);
    }
  }
  assert.deepEqual(run(cases).map(Number), expected);
});

// Beta.3 (2026-11-14): on macOS Chromium unloads a profile when its last window
// closes, though the app keeps running, and loads a new Profile for the next
// window. The service stays bound to the first one, so Settings said "Sync is
// available only in the default profile" until a relaunch, and open tabs were
// no longer published. The service keeps its profile loaded while Blanc runs.
test('the Sync service keeps its profile loaded while Blanc runs', () => {
  const cc = fs.readFileSync(path.join(root, 'blanc/browser/sync/desktop_sync_service.cc'), 'utf8');
  const h = fs.readFileSync(path.join(root, 'blanc/browser/sync/desktop_sync_service.h'), 'utf8');
  const gn = fs.readFileSync(path.join(root, 'blanc/browser/sync/BUILD.gn'), 'utf8');
  assert.match(h, /std::unique_ptr<ScopedProfileKeepAlive> profile_keep_alive_;/);
  const ctor = cc.slice(cc.indexOf('DesktopSyncService::DesktopSyncService(Profile* profile)'), cc.indexOf('DesktopSyncService::~DesktopSyncService()'));
  assert.match(ctor, /profile_keep_alive_ = std::make_unique<ScopedProfileKeepAlive>\(\s*profile, ProfileKeepAliveOrigin::kBackgroundMode\);/);
  const destroyed = cc.slice(cc.indexOf('void DesktopSyncService::OnProfileWillBeDestroyed('));
  assert.match(destroyed.slice(0, destroyed.indexOf('\n}')), /profile_keep_alive_\.reset\(\);/);
  assert.match(gn, /"\/\/chrome\/browser\/profiles\/keep_alive",/);
});
