// Shipping v1.45.1's search engines (S1.1) are stored as the Chromium
// prepopulated engines that the search resolver (modules/selected_shipping.cc)
// maps back to shipping's URLs. Settings itself is chrome://settings (S1.7);
// a custom address is added there under Manage search engines (V12).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHIPPING = '8a4e57e78dfe47a72c05d17fd6040be26c3dffd3';
const show = file => execFileSync('git', ['show', `${SHIPPING}:${file}`], {cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024});
const escapeRegExp = text => text.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const shippingEngines = () => {
  const source = show('src/main/settings.js');
  const block = source.slice(source.indexOf('const SEARCH_ENGINES = {'), source.indexOf('};', source.indexOf('const SEARCH_ENGINES = {')));
  return [...block.matchAll(/^\s+(\w+): \{ label: '([^']+)'/gm)].map(m => [m[1], m[2]]);
};

test('the native suggestion service labels engines with shipping\'s names', () => {
  const choice = read('blanc/browser/ui/browser_api/search_choice.h');
  const native = [...choice.matchAll(/if \(name == "(\w+)"\) return "([^"]+)";/g)].map(m => [m[1], m[2]]);
  assert.deepEqual(native, shippingEngines().filter(([k]) => k !== 'custom'));
});

test('each stock engine is the prepopulated engine the resolver maps to shipping\'s URL', () => {
  const choice = read('blanc/browser/ui/browser_api/search_choice.h');
  const ours = [...choice.matchAll(/\{"(\w+)", (\d+)\}/g)].map(m => [m[1], Number(m[2])]);
  assert.deepEqual(ours.map(([name]) => name), shippingEngines().map(([k]) => k).filter(k => k !== 'custom'));
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
