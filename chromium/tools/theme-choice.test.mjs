// Differential test: the native /theme rule (blanc/browser/ui/browser_api/
// theme_choice.h), compiled with the system C++ compiler, must answer exactly
// as shipping v1.45.1's own chrome:cycle-theme handler (src/main/main.js) for
// every current theme and request, including JavaScript's trim() whitespace and
// toLowerCase() letters outside ASCII.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHIPPING = '8a4e57e78dfe47a72c05d17fd6040be26c3dffd3';
const show = file => execFileSync('git', ['show', `${SHIPPING}:${file}`], {cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024});

// Shipping's handler, run with its settings store replaced by `current`.
function shipping() {
  const source = show('src/main/main.js');
  const start = source.indexOf("chromeHandle('chrome:cycle-theme'");
  const body = source.slice(start, source.indexOf('\n  });\n', start) + '\n  });'.length);
  assert.ok(start > 0 && body.includes('order'), 'shipping still has its cycle-theme handler');
  let handler;
  const context = {chromeHandle: (_channel, fn) => { handler = fn; }, settings: null};
  vm.runInNewContext(body, context);
  return (current, requested) => {
    context.settings = {getSettings: () => ({theme: current}), setSettings: () => {}};
    return handler(null, requested);
  };
}

const hex = s => Buffer.from(s, 'utf8').toString('hex');
function native(cases) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-theme-'));
  fs.writeFileSync(path.join(dir, 'main.cc'), `#include <iostream>
#include <string>
#include "blanc/browser/ui/browser_api/theme_choice.h"
std::string Unhex(const std::string& h) { std::string o;
  for (size_t i = 0; i + 1 < h.size(); i += 2) o += static_cast<char>(std::stoi(h.substr(i, 2), nullptr, 16));
  return o; }
int main() { std::string current, kind, requested;
  while (std::cin >> current >> kind >> requested) {
    std::optional<std::string> r; if (kind == "s") r = Unhex(requested.substr(1));
    std::cout << blanc::browser_api::theme_choice::NextTheme(Unhex(current.substr(1)), r) << "\\n"; } }
`);
  execFileSync('c++', ['-std=c++20', '-I', root, path.join(dir, 'main.cc'), '-o', path.join(dir, 'theme')]);
  const input = cases.map(([current, requested]) => `x${hex(current)} ${requested === null ? 'n' : 's'} x${hex(requested ?? '')}`).join('\n') + '\n';
  const out = execFileSync(path.join(dir, 'theme'), {input, encoding: 'utf8'}).split('\n').slice(0, cases.length);
  fs.rmSync(dir, {recursive: true, force: true});
  return out;
}

test('the native /theme rule answers as shipping does', () => {
  const run = shipping();
  const currents = ['system', 'light', 'dark', 'sepia', ''];
  const words = ['', 'system', 'light', 'dark', 'Dark', 'LIGHT', 'SyStEm', 'dar', 'darkk', 'sepia', 'auto', 'dark mode',
    'DARK', 'darK', 'Kdark', 'lİght', 'LıGHT', 'dark\u0000', 'dárk', 'ÿ', '🌙'];
  const spaces = ['', ' ', '\t', '\n', '\r\n', ' ', ' ', ' ', ' ', ' ', ' ', ' ', '　',
    '﻿', '\u000b', '\u000c', '\u0085', '᠎', '​'];
  const cases = [];
  for (const current of currents) {
    cases.push([current, null]);
    for (const word of words) for (const space of spaces) {
      cases.push([current, space + word + space]);
      cases.push([current, space + word]);
    }
  }
  const expected = cases.map(([current, requested]) => run(current, requested));
  const actual = native(cases);
  const mismatches = cases.map((c, i) => [c, expected[i], actual[i]]).filter(([, e, a]) => e !== a);
  assert.deepEqual(mismatches.slice(0, 10).map(([[current, requested], e, a]) =>
    ({current, requested: JSON.stringify(requested), shipping: e, native: a})), []);
  assert.ok(cases.length > 3000, `${cases.length} cases`);
});
