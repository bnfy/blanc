// Differential test: the native bang-icon rules, compiled with the system C++
// compiler, must answer exactly as shipping v1.45.1's own
// src/main/bang-icons-policy.js over the same sequences of operations, and
// read the whole catalog out of shipping's generated bangs-catalog.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHIPPING = '85883b1afa11375e1300130914d6f40c5388af21';
const show = file => execFileSync('git', ['show', `${SHIPPING}:${file}`], {cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024});
const HOSTS = ['a.example', 'b.example', 'c.example', 'd.example', 'e.example'];
const CATALOG = new Set(['a.example', 'b.example', 'c.example', 'd.example']);
const CUSTOM = new Set(['d.example']);

function shipping() {
  const module = {exports: {}};
  vm.runInNewContext(show('src/main/bang-icons-policy.js'), {module, exports: module.exports});
  return module.exports;
}

function native() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-bang-icons-'));
  const harness = path.join(dir, 'main.cc');
  fs.writeFileSync(harness, `#include <fstream>
#include <iostream>
#include <sstream>
#include <string>
#include "blanc/browser/ui/browser_api/bang_icon_policy.h"
using namespace blanc::browser_api::bang_icons;
int main(int argc, char** argv) {
  std::set<std::string> catalog = {${[...CATALOG].map(h => `"${h}"`).join(', ')}};
  std::set<std::string> custom = {${[...CUSTOM].map(h => `"${h}"`).join(', ')}};
  RunState run;
  std::vector<Record> records;
  auto find = [&](const std::string& host) -> const Record* {
    for (const auto& r : records) if (r.host == host) return &r;
    return nullptr;
  };
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream in(line);
    std::string op, host;
    in >> op;
    if (op == "catalog") {
      std::ifstream file(argv[1]);
      std::stringstream text; text << file.rdbuf();
      const std::string js = text.str();
      auto array = CatalogArray(js);
      std::cout << (array ? std::to_string(array->size()) + " " + std::to_string(array->data() - js.data()) : "-") << "\\n";
      continue;
    }
    double now = 0;
    in >> host >> now;
    if (op == "may") {
      int enabled, setup, priv;
      in >> enabled >> setup >> priv;
      std::cout << MayFetch(host, enabled == 1, setup == 1, priv == 1, catalog, custom, find(host), run, now) << "\\n";
    } else if (op == "start") {
      run.Started(host); std::cout << "ok\\n";
    } else if (op == "finish") {
      std::string outcome; in >> outcome;
      run.Finished(host, outcome == "ok" ? Outcome::kOk : outcome == "not-found" ? Outcome::kNotFound : Outcome::kFailed, now);
      std::cout << "ok\\n";
    } else if (op == "put") {
      records = PutRecord(records, host, "icon-" + host, now);
    } else if (op == "drop") {
      records = DropRecord(records, host);
    } else if (op == "touch") {
      records = TouchRecords(records, {host}, now);
    } else if (op == "stale") {
      for (auto& r : records) if (r.host == host) r.fetched_at.reset();
    }
    if (op == "put" || op == "drop" || op == "touch" || op == "stale") {
      for (const auto& r : records)
        std::cout << r.host << ':' << (r.fetched_at ? std::to_string(static_cast<long long>(*r.fetched_at)) : "x") << ':' << static_cast<long long>(r.used_at) << ':' << static_cast<int>(StoredState(&r, now)) << ' ';
      std::cout << "\\n";
    }
  }
}
`);
  const exe = path.join(dir, 'policy');
  execFileSync('c++', ['-std=c++20', '-Wall', '-Werror', '-I', root, harness,
    path.join(root, 'blanc/browser/ui/browser_api/bang_icon_policy.cc'), '-o', exe]);
  return {exe, dir};
}

function* script(count) {
  let seed = 29;
  const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const pick = list => list[Math.floor(next() * list.length)];
  let now = 1_000_000;
  for (let i = 0; i < count; i++) {
    now += pick([0, 1, 1000, 29_999, 30_000, 31_000, 30 * 24 * 3600 * 1000, 30 * 24 * 3600 * 1000 + 1]);
    const host = pick(HOSTS);
    const op = pick(['may', 'may', 'start', 'finish', 'put', 'drop', 'touch', 'stale']);
    if (op === 'may') yield `may ${host} ${now} ${pick([1, 1, 1, 0])} ${pick([1, 1, 1, 0])} ${pick([0, 0, 0, 1])}`;
    else if (op === 'finish') yield `finish ${host} ${now} ${pick(['ok', 'not-found', 'failed', 'failed'])}`;
    else yield `${op} ${host} ${now}`;
  }
}

test('native bang-icon rules match shipping', () => {
  const p = shipping();
  let run = p.createRunState();
  let records = [];
  // Each retry boundary, a 404 and an in-flight host, then random sequences.
  const fixed = [];
  let t = 1;
  for (let attempt = 0; attempt < 4; attempt++) {
    fixed.push(`may a.example ${t} 1 1 0`, `start a.example ${t}`, `may a.example ${t} 1 1 0`,
      `finish a.example ${t} failed`, `may a.example ${t + 29_999} 1 1 0`);
    t += 30_000;
  }
  fixed.push(`start b.example ${t}`, `finish b.example ${t} not-found`, `may b.example ${t + 1e9} 1 1 0`,
    `may c.example ${t} 1 1 0`, `may d.example ${t} 1 1 0`, `may e.example ${t} 1 1 0`, `may c.example ${t} 1 1 1`,
    `may c.example ${t} 0 1 0`, `may c.example ${t} 1 0 0`, `put c.example ${t}`, `may c.example ${t + 1} 1 1 0`,
    `may c.example ${t + 30 * 24 * 3600 * 1000 + 1} 1 1 0`);
  const lines = [...fixed, ...script(6000)];
  const expected = lines.map(line => {
    const [op, host, nowText, ...rest] = line.split(' ');
    const now = Number(nowText);
    const list = () => records.map(r => `${r.host}:${Number.isFinite(r.fetchedAt) ? r.fetchedAt : 'x'}:${r.usedAt}:${['missing', 'stale', 'fresh'].indexOf(p.storedState(r, now))} `).join('');
    if (op === 'may') {
      const [enabled, setup, priv] = rest.map(v => v === '1');
      return String(Number(p.mayFetch({host, enabled, setupComplete: setup, privateActive: priv, catalogHosts: CATALOG,
        customHosts: CUSTOM, record: records.find(r => r.host === host), run, now})));
    }
    if (op === 'start') { run.started(host); return 'ok'; }
    if (op === 'finish') { run.finished(host, rest[0], now); return 'ok'; }
    if (op === 'put') records = p.putRecord(records, host, `icon-${host}`, now);
    if (op === 'drop') records = p.dropRecord(records, host);
    if (op === 'touch') records = p.touchRecords(records, [host], now);
    if (op === 'stale') records = records.map(r => (r.host === host ? {...r, fetchedAt: undefined} : r));
    return list();
  });
  const {exe, dir} = native();
  const out = execFileSync(exe, {input: lines.join('\n') + '\n', encoding: 'utf8', maxBuffer: 64 * 1024 * 1024}).split('\n');
  lines.forEach((line, i) => assert.equal(out[i], expected[i], `${i}: ${line}`));
  fs.rmSync(dir, {recursive: true, force: true});
  assert.equal(p.STORE_CAP, 300);
});

test('the store keeps at most shipping\'s cap, most recently used first', () => {
  const p = shipping();
  const lines = Array.from({length: 310}, (_, i) => `put h${i}.example ${1000 + i}`);
  const {exe, dir} = native();
  const out = execFileSync(exe, {input: lines.join('\n') + '\n', encoding: 'utf8', maxBuffer: 64 * 1024 * 1024}).trim().split('\n');
  let records = [];
  for (let i = 0; i < 310; i++) records = p.putRecord(records, `h${i}.example`, `icon-h${i}.example`, 1000 + i);
  assert.equal(out.at(-1).trim().split(' ').length, records.length);
  assert.equal(out.at(-1).trim().split(' ')[0].split(':')[0], records[0].host);
  fs.rmSync(dir, {recursive: true, force: true});
});

test('the browser reads the whole catalog the Island draws from', () => {
  const file = path.join(root, 'blanc/island/pages/bangs-catalog.js');
  const js = fs.readFileSync(file, 'utf8');
  const {exe, dir} = native();
  const [size, offset] = execFileSync(exe, [file], {input: 'catalog\n', encoding: 'utf8'}).trim().split(' ').map(Number);
  fs.rmSync(dir, {recursive: true, force: true});
  const slice = Buffer.from(js, 'utf8').subarray(offset, offset + size).toString('utf8');
  const parsed = vm.runInNewContext(`(${slice})`);
  const catalog = createRequire(import.meta.url)(file);
  assert.equal(parsed.length, catalog.length);
  assert.equal(JSON.stringify(parsed.at(-1)), JSON.stringify(catalog.at(-1)));
  // The browser parses it as JSON with trailing commas allowed.
  assert.doesNotThrow(() => JSON.parse(slice.replace(/,(\s*\])/g, '$1')));
});
