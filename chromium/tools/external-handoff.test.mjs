// Differential test: the native hand-off classifier, compiled with the system
// C++ compiler, must answer exactly as shipping v1.45.1's own
// classifyExternalNavigation for typed and page-started links.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHIPPING = '85883b1afa11375e1300130914d6f40c5388af21';
const show = file => execFileSync('git', ['show', `${SHIPPING}:${file}`], {cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024});

function shippingClassify() {
  const module = {exports: {}};
  vm.runInNewContext(show('src/main/external-protocols.js'), {module, exports: module.exports, URL,
    require: () => ({PDF_VIEWER_ORIGIN: 'chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai'})});
  return module.exports;
}
// One input per line on stdin (inputs never contain a newline); one action per line out.
function nativeClassifier() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-handoff-'));
  const harness = path.join(dir, 'main.cc');
  fs.writeFileSync(harness, `#include <iostream>
#include <string>
#include "blanc/browser/ui/browser_api/external_handoff.h"
int main() {
  const char* names[] = {"none", "open", "confirm", "deny"};
  std::string line;
  while (std::getline(std::cin, line)) {
    std::cout << names[static_cast<int>(blanc::browser_api::ClassifyExternalNavigation(line, true))] << ' '
              << names[static_cast<int>(blanc::browser_api::ClassifyExternalNavigation(line, false))] << '\\n';
  }
}
`);
  const exe = path.join(dir, 'classify');
  execFileSync('c++', ['-std=c++20', '-Wall', '-Werror', '-I', root, harness, path.join(root, 'blanc/browser/ui/browser_api/external_handoff.cc'), '-o', exe]);
  return inputs => execFileSync(exe, {input: inputs.join('\n') + '\n', encoding: 'utf8'}).trim().split('\n').map(l => l.split(' '));
}
function* generated(count) {
  const parts = ['a', 'b.c', '.com', '/', ':', '//', '8080', '@', '?', '#', ' ', 'mailto:', 'tel:', 'ftp:', 'ws:', 'http', 's', 'x-y+z', 'c:', '"', '\\', '\t', 'é', '%41', 'claude:', 'zoommtg:'];
  let seed = 11;
  const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = 0; i < count; i++) {
    let s = '';
    for (let n = 1 + Math.floor(next() * 6); n > 0; n--) s += parts[Math.floor(next() * parts.length)];
    yield s;
  }
}

test('native hand-off decisions match shipping', () => {
  const shipping = shippingClassify();
  const listed = [...shipping.DENIED_HANDOFF_PROTOCOLS, ...shipping.DIRECT_HANDOFF_PROTOCOLS];
  const inputs = [
    'mailto:a@b.com', 'MAILTO:a@b.com', 'tel:+15550100', 'sms:+1', 'facetime:a@b.c', 'claude://login',
    'claude:login', 'zoommtg://zoom.us/join', 'ssh://host', 'c:\\windows', 'c:/x', 'ftp:', 'ftp://x',
    'ws://x', 'wss:', 'example.com', 'how tall', '', 'a:', 'mailto:a b', 'mailto:"x"', 'vscode://file',
    ...listed.flatMap(p => [p, p + 'x', p + '//x', p + '/x']),
    ...generated(3000),
  ].filter(s => !s.includes('\n'));
  const native = nativeClassifier()(inputs);
  inputs.forEach((input, i) => {
    const expected = [true, false].map(trusted => shipping.classifyExternalNavigation(input, {trusted}).action);
    assert.deepEqual(native[i], expected, JSON.stringify(input));
  });
});
