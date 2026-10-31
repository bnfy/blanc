// Settings → Search (S1.1) must offer shipping v1.45.1's controls, copy and
// engines, and store each engine as the Chromium prepopulated engine that the
// search resolver (modules/selected_shipping.cc) maps back to shipping's URL.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHIPPING = '85883b1afa11375e1300130914d6f40c5388af21';
const show = file => execFileSync('git', ['show', `${SHIPPING}:${file}`], {cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024});
const escapeRegExp = text => text.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const page = createRequire(import.meta.url)(path.join(root, 'blanc/island/search-settings.js'));

test('copy is shipping\'s, in every language', () => {
  for (const [locale, entries] of Object.entries(page.searchCopy)) {
    const shipping = JSON.parse(show(`copy/messages/${locale}.json`));
    for (const [key, value] of Object.entries(entries)) assert.equal(value, shipping[key].message, `${locale} ${key}`);
    assert.deepEqual(Object.keys(entries), Object.keys(page.searchCopy.en), locale);
  }
});

test('the engine list is shipping\'s, in order, with its labels', () => {
  const source = show('src/main/settings.js');
  const block = source.slice(source.indexOf('const SEARCH_ENGINES = {'), source.indexOf('};', source.indexOf('const SEARCH_ENGINES = {')));
  const shipping = [...block.matchAll(/^\s+(\w+): \{ label: '([^']+)'/gm)].map(m => [m[1], m[2]]);
  assert.deepEqual(Object.entries(page.SEARCH_ENGINES).map(([k, v]) => [k, v ?? 'Custom']), shipping);
});

test('the page has shipping\'s controls with shipping\'s English text', () => {
  const ours = read('blanc/island/blocking-settings.html');
  const shipping = show('src/renderer/pages/settings.html');
  for (const id of ['searchEngine', 'searchEngineCustomRow', 'searchEngineTemplate', 'searchEngineTemplateError', 'searchSuggestions']) {
    assert.match(ours, new RegExp(`id="${id}"`), id);
    assert.match(shipping, new RegExp(`id="${id}"`), id);
  }
  for (const [key, value] of Object.entries(page.searchCopy.en))
    if (key !== 'settings.general.searchEngine.custom')
      assert(ours.includes(`data-search-i18n="${key}">${value}<`), key);
});

test('each stock engine is the prepopulated engine the resolver maps to shipping\'s URL', () => {
  const choice = read('blanc/browser/ui/browser_api/search_choice.h');
  const ours = [...choice.matchAll(/\{"(\w+)", (\d+)\}/g)].map(m => [m[1], Number(m[2])]);
  assert.deepEqual(ours.map(([name]) => name), Object.keys(page.SEARCH_ENGINES).filter(k => k !== 'custom'));
  const resolver = read('blanc/browser/ui/modules/selected_shipping.cc');
  const shipping = show('src/main/settings.js');
  for (const [name, id] of ours) {
    const url = new RegExp(`${name}: \\{[^}]*url: \\(q\\) => \`([^$]+)\\$\\{`).exec(shipping)[1];
    assert.match(resolver, new RegExp(`\\{${id}, [\\s\\S]*?"${escapeRegExp(url)}%s"\\}`), name);
  }
});

test('custom addresses convert to Chromium patterns and back', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-search-choice-'));
  const harness = path.join(dir, 'main.cc');
  fs.writeFileSync(harness, `#include <iostream>
#include <string>
#include "blanc/browser/ui/browser_api/search_choice.h"
using namespace blanc::browser_api;
int main() {
  std::string line;
  while (std::getline(std::cin, line)) {
    auto to = ToChromiumPattern(line);
    auto back = to ? FromChromiumPattern(*to) : std::nullopt;
    std::cout << (to ? *to : "-") << ' ' << (back ? *back : "-") << '\\n';
  }
}
`);
  const exe = path.join(dir, 'choice');
  execFileSync('c++', ['-std=c++20', '-Wall', '-Werror', '-I', root, harness, '-o', exe]);
  const inputs = ['https://searx.example.org/search?q=%s', 'http://localhost:8888/search?q=%s', 'https://a.b/?q=%s&x=%s', 'https://a.b/?q=', 'https://a.b/{x}?q=%s'];
  const out = execFileSync(exe, {input: inputs.join('\n') + '\n', encoding: 'utf8'}).trim().split('\n');
  assert.deepEqual(out, [
    'https://searx.example.org/search?q={searchTerms} https://searx.example.org/search?q=%s',
    'http://localhost:8888/search?q={searchTerms} http://localhost:8888/search?q=%s',
    '- -', '- -', '- -',
  ]);
  fs.rmSync(dir, {recursive: true, force: true});
});
