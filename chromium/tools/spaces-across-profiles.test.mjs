// Spaces across profiles: the fork's pure rules (blanc/browser/ui/
// spaces_across_profiles.h, compiled here with the system C++ compiler) must
// agree with shipping's own module at the commit the menu pins.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pinFile = path.join(root, 'blanc/spaces-menu.json');
const commit = fs.existsSync(pinFile) ? JSON.parse(fs.readFileSync(pinFile, 'utf8')).commit
  : '79f0f2b658e2c453ded60d56cc3aeb394521c654';
const shippingModule = {exports: {}};
vm.runInNewContext(execFileSync('git', ['show', `${commit}:src/main/spaces-across-profiles.js`], {cwd: root, encoding: 'utf8'}),
  {module: shippingModule, require: () => ({MAX_WORKSPACES: 25})});
const ship = shippingModule.exports;
const plain = value => JSON.parse(JSON.stringify(value));

const HARNESS = `#include <iostream>
#include <map>
#include <set>
#include <sstream>
#include <string>
#include <vector>
#include "blanc/browser/ui/spaces_across_profiles.h"
namespace s = blanc::spaces_across_profiles;
// Lines: "P id name live", "C current", "M profile id name color symbol tabs",
// "S profile id" (shown), "R id name color symbol tabs" (mirror rows, with
// "O id" lines for order, "I" items, "D" deleted), "run" or "rows".
// Fields are tab separated; empty fields are written as "-".
static std::string F(const std::string& v) { return v == "-" ? "" : v; }
static std::vector<std::string> Split(const std::string& line) {
  std::vector<std::string> out; std::string cur; std::istringstream in(line);
  while (std::getline(in, cur, '\\t')) out.push_back(cur); return out; }
int main() {
  std::vector<s::Profile> profiles; std::string current;
  std::map<std::string, std::vector<s::Space>> mirrors; std::map<std::string, std::set<std::string>> shown;
  std::vector<std::string> order; std::map<std::string, s::Space> items; std::set<std::string> deleted;
  std::string line;
  while (std::getline(std::cin, line)) {
    auto f = Split(line); if (f.empty()) continue;
    if (f[0] == "P") profiles.push_back({F(f[1]), F(f[2]), f[3] == "1"});
    else if (f[0] == "C") current = F(f[1]);
    else if (f[0] == "M") mirrors[F(f[1])].push_back({F(f[2]), F(f[3]), F(f[4]), F(f[5]), std::stoi(f[6])});
    else if (f[0] == "S") shown[F(f[1])].insert(F(f[2]));
    else if (f[0] == "O") order.push_back(F(f[1]));
    else if (f[0] == "I") items[F(f[1])] = {F(f[1]), F(f[2]), F(f[3]), F(f[4]), std::stoi(f[5])};
    else if (f[0] == "D") deleted.insert(F(f[1]));
  }
  if (!order.empty()) {
    std::vector<blanc::spaces_across_profiles::OtherProfile> one(1);
    for (const auto& r : s::MirrorRows(order, items, deleted)) one[0].items.push_back({r, false});
    std::cout << s::ToJson(one);
  } else {
    std::cout << s::ToJson(s::OtherProfileSpaces(profiles, current, mirrors, shown));
  }
}
`;

function run(lines) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-spaces-'));
  try {
    fs.writeFileSync(path.join(dir, 'main.cc'), HARNESS);
    execFileSync('c++', ['-std=c++20', '-Wall', '-Werror', '-I', root, path.join(dir, 'main.cc'), '-o', path.join(dir, 'h')]);
    return JSON.parse(execFileSync(path.join(dir, 'h'), {input: lines.map(l => l.join('\t')).join('\n') + '\n', encoding: 'utf8'}));
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
}

const space = (n, extra = {}) => ({id: `s${n}`, name: `Space ${n}`, color: '#aabbcc', symbol: 'star', tabCount: n % 7, ...extra});
const fixtureProfiles = [
  {id: 'a', name: 'Personal', live: true},
  {id: 'b', name: 'Work', live: true},
  {id: 'c', name: 'Empty', live: true},
  {id: 'd', name: 'Closed', live: false},
];
const mirrors = {
  a: [space(1), space(2)],
  b: Array.from({length: 25}, (_, i) => space(i + 1)),
  d: [space(9)],
};
const shown = {b: ['s3', 's4'], a: ['s1']};

function lines(profiles, current) {
  const out = profiles.map(p => ['P', p.id, p.name, p.live ? '1' : '0']);
  out.push(['C', current]);
  for (const [pid, rows] of Object.entries(mirrors)) for (const r of rows) out.push(['M', pid, r.id, r.name, r.color, r.symbol, String(r.tabCount)]);
  for (const [pid, ids] of Object.entries(shown)) for (const id of ids) out.push(['S', pid, id]);
  return out;
}

function shipping(profiles, current) {
  return ship.otherProfileSpaces({
    profiles, currentProfileId: current,
    isLive: id => profiles.find(p => p.id === id).live,
    readProfile: id => ({
      status: 'saved',
      spaces: (mirrors[id] || []).map(r => ({id: r.id, name: r.name, color: r.color, symbol: r.symbol, urls: Array(r.tabCount)})),
      shownIds: new Set(shown[id] || []),
    }),
  });
}

test('parity with shipping for one, two and three profiles', () => {
  for (const profiles of [fixtureProfiles.slice(0, 1), fixtureProfiles.slice(0, 2), fixtureProfiles.slice(0, 3), fixtureProfiles]) {
    for (const current of ['a', 'b', 'c']) {
      assert.deepEqual(run(lines(profiles, current)), plain(shipping(profiles, current)), `${profiles.length} profiles, current ${current}`);
    }
  }
  const three = run(lines(fixtureProfiles, 'a'));
  assert.equal(three.find(p => p.id === 'b').full, true);
  assert.deepEqual(three.find(p => p.id === 'c').items, []);
  assert.equal(three.find(p => p.id === 'd'), undefined);
});

test('allowlist: only the named keys cross', () => {
  const out = run(lines(fixtureProfiles, 'a'));
  assert.ok(out.length > 0);
  for (const p of out) {
    assert.deepEqual(Object.keys(p), ['id', 'name', 'status', 'full', 'items']);
    for (const item of p.items) assert.deepEqual(Object.keys(item), ['id', 'name', 'color', 'symbol', 'tabCount', 'openElsewhere']);
  }
});

test('one live profile plus one not live gives nothing', () => {
  assert.deepEqual(run(lines([fixtureProfiles[0], fixtureProfiles[3]], 'a')), []);
});

test('a damaged mirror loses its bad rows and keeps at most 25', () => {
  const rows = [];
  const order = [];
  const add = (id, name, color, symbol, tabs) => { rows.push(['I', id, name, color, symbol, String(tabs)]); order.push(['O', id]); };
  add('__scratch__', 'Scratch', '#aabbcc', 'star', 1);
  add('bad<id', 'Angle', '#aabbcc', 'star', 1);
  add('noname', '-', '#aabbcc', 'star', 1);
  add('long', 'x'.repeat(61), '#aabbcc', 'star', 1);
  add('red', 'Red', 'red', 'star', 1);
  add('neg', 'Negative', '#aabbcc', 'Not A Symbol', -3);
  add('gone', 'Gone', '#aabbcc', 'star', 1);
  for (let i = 0; i < 40; i++) add(`ok${i}`, `Ok ${i}`, '#aabbcc', 'star', i);
  order.push(['O', 'ok0']);
  order.push(['O', 'missing']);
  const out = run([...rows, ...order, ['D', 'gone']]);
  const items = out[0].items;
  assert.equal(items.length, 25);
  const ids = items.map(i => i.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const bad of ['__scratch__', 'bad<id', 'noname', 'long', 'gone', 'missing']) assert.ok(!ids.includes(bad), bad);
  assert.deepEqual(items.find(i => i.id === 'red'), {id: 'red', name: 'Red', color: '', symbol: 'star', tabCount: 1, openElsewhere: false});
  const neg = items.find(i => i.id === 'neg');
  assert.equal(neg.tabCount, 0);
  assert.equal(neg.symbol, '');
  assert.equal(run([['I', 'big', 'Big', '-', '-', '999999'], ['O', 'big']])[0].items[0].tabCount, 10000);
  assert.equal(run([['I', 'sixty', 'é'.repeat(60), '-', '-', '1'], ['O', 'sixty']])[0].items.length, 1);
});
