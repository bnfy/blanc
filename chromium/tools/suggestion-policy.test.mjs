// Differential test: the native suggestion rules, compiled with the system C++
// compiler, must answer exactly as shipping v1.45.1's own search-suggestions.js
// (eligibility, request addresses, suggestion cleanup) and bangs.js parseBang.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHIPPING = '2098dd703c99194a58e5a3e7ec0b39923d2db59b';
const show = file => execFileSync('git', ['show', `${SHIPPING}:${file}`], {cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024});
const ENGINES = ['duckduckgo', 'google', 'bing', 'brave', 'kagi', 'custom'];
const LOCALE = 'en-US';

function shipping() {
  const module = {exports: {}};
  vm.runInNewContext(show('src/main/search-suggestions.js'), {module, exports: module.exports, URL, Buffer});
  const root = {};
  vm.runInNewContext(show('src/renderer/pages/bangs.js'), {window: root, self: root, globalThis: root, module: undefined});
  const Bangs = root.Bangs;
  assert.ok(Bangs?.parseBang, 'shipping bangs.js exposes parseBang');
  return {...module.exports, parseBang: Bangs.parseBang};
}

// Inputs and outputs travel as hex so any byte, newline included, survives.
const hex = s => Buffer.from(s, 'utf8').toString('hex');
function native() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-suggest-'));
  const harness = path.join(dir, 'main.cc');
  fs.writeFileSync(harness, `#include <iostream>
#include <string>
#include "blanc/browser/ui/browser_api/suggestion_policy.h"
using namespace blanc::browser_api;
std::string Hex(const std::string& s) {
  static const char* d = "0123456789abcdef"; std::string o;
  for (unsigned char c : s) { o += d[c >> 4]; o += d[c & 15]; }
  return o.empty() ? "." : o;
}
std::string Opt(const std::optional<std::string>& v) { return v ? Hex(*v) : "-"; }
int main() {
  const char* engines[] = {${ENGINES.map(e => `"${e}"`).join(', ')}};
  std::string line;
  while (std::getline(std::cin, line)) {
    std::string in;
    for (size_t i = 0; i + 1 < line.size(); i += 2) in += static_cast<char>(std::stoi(line.substr(i, 2), nullptr, 16));
    std::cout << IsSuggestionEligible(in) << ' ' << HasBangToken(in) << ' ' << Opt(CleanSuggestion(in));
    for (const char* e : engines) std::cout << ' ' << Opt(SuggestionRequestUrl(e, in, "${LOCALE}"));
    std::cout << '\\n';
  }
}
`);
  const exe = path.join(dir, 'policy');
  execFileSync('c++', ['-std=c++20', '-Wall', '-Werror', '-I', root, harness,
    path.join(root, 'blanc/browser/ui/browser_api/suggestion_policy.cc'), '-o', exe]);
  return inputs => {
    const out = execFileSync(exe, {input: inputs.map(hex).join('\n') + '\n', encoding: 'utf8', maxBuffer: 256 * 1024 * 1024});
    fs.rmSync(dir, {recursive: true, force: true});
    const unhex = v => v === '-' ? null : v === '.' ? '' : Buffer.from(v, 'hex').toString('utf8');
    return out.trim().split('\n').map(l => {
      const [eligible, bang, clean, ...urls] = l.split(' ');
      return {eligible: eligible === '1', bang: bang === '1', clean: unhex(clean), urls: urls.map(unhex)};
    });
  };
}

function* generated(count) {
  const parts = ['a', 'Ab', 'how', ' ', '  ', '\t', '\u00a0', '\u3000', '\u2028', '\n', '.', 'b.c', '.com', '.html', '.HTM',
    '.xhtml', '/', '\\', '~', ':', '8080', '?', '#', 'localhost', '127.0.0.1', '1.2.3', '[', ']', '::1', 'fe80', '%',
    'c:', 'mailto:', 'x-y+z', '!', '!yt', '!g_', 'password', 'Token', ' = ', ':', 'api key', 'API-KEY', 'sk-', 'SK-', 'ghp_',
    'GHS_', 'AKIA', 'akia', '4111', '1111-', '1234 ', '5', 'é', 'Ünïcode', '日本', '😀', '\uFEFF', '-', '_', "'", '"',
    'é'.repeat(40), 'x'.repeat(60)];
  let seed = 17;
  const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = 0; i < count; i++) {
    let s = '';
    for (let n = 1 + Math.floor(next() * 7); n > 0; n--) s += parts[Math.floor(next() * parts.length)];
    yield s;
  }
}

test('native suggestion rules match shipping', () => {
  const ship = shipping();
  const inputs = [
    'how tall is everest', 'example.com', 'example.com/path', 'news.ycombinator.com:443/x', 'localhost:3000',
    'localhost', 'localhostx', '192.168.0.1', '10.0.0.1:80/a', '1.2.3.4.5', '[::1]:8080', '::1', 'fe80::1/x',
    'a', 'ab', ' ab ', '/cmd', 'file:///etc', 'C:\\Users', 'c:/x', '~/x', './a', '../a', '.\\a', '\\\\server\\share',
    'index.html', 'page.htm?x=1', 'a.XHTML#top', 'password: hunter2', 'my token = abc', 'api_key:1', 'apikey=1',
    'sk-abc', 'ghp_123', 'GHO_x', 'AKIAIOS', 'akia lower', '4111 1111 1111 1111', '4111-1111-1111-1111',
    '4111111111111', '411111111111', '!yt lofi', 'lofi !yt', '!', '! yt', 'a !b c', '!Bang', '!a'.padEnd(40, 'b'),
    'x'.repeat(199), 'x'.repeat(200), 'x'.repeat(201), '😀'.repeat(100), '😀'.repeat(101), 'été à paris',
    'line\nbreak', 'tab\there', '\u2028x', 'q\u00a0\u00a0r', '  spaced   out  ', '日本 語',
    ...generated(4000),
  ];
  const results = native()(inputs);
  inputs.forEach((input, i) => {
    const got = results[i];
    const cleaned = ship.parseOpenSearchSuggestions([input, [input]])[0] ?? null;
    assert.deepEqual(got, {
      eligible: ship.isSuggestionEligible(input),
      bang: ship.parseBang(input) !== null,
      clean: cleaned,
      urls: ENGINES.map(e => ship.requestUrlFor(e, input, LOCALE)),
    }, JSON.stringify(input));
  });
});
