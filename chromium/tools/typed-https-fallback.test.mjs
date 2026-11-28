// The native typed-address HTTP fallback rules (typed_https_fallback.cc),
// compiled with the system C++ compiler, against the cases shipping's
// test/unit/typed-https-fallback.test.js holds for src/main/typed-https-fallback.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function native() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-https-fallback-'));
  const harness = path.join(dir, 'main.cc');
  fs.writeFileSync(harness, `#include <iostream>
#include <string>
#include "blanc/browser/ui/browser_api/typed_https_fallback.h"
using namespace blanc::browser_api;
int main() {
  std::string kind, a; int port, creds;
  while (std::cin >> kind >> a >> port >> creds) {
    if (kind == "host") std::cout << MayFallBackToHttp(a, port, creds) << '\\n';
    else std::cout << IsHttpFallbackError(std::stoi(a)) << '\\n';
  }
}
`);
  const exe = path.join(dir, 'policy');
  execFileSync('c++', ['-std=c++20', '-Wall', '-Werror', '-I', root, harness,
    path.join(root, 'blanc/browser/ui/browser_api/typed_https_fallback.cc'), '-o', exe]);
  return lines => {
    const out = execFileSync(exe, {input: lines.join('\n') + '\n', encoding: 'utf8'});
    fs.rmSync(dir, {recursive: true, force: true});
    return out.trim().split('\n').map(v => v === '1');
  };
}

// [host as GURL::host() gives it, has port, has user name or password, may fall back]
const HOSTS = [
  ['keurig.com', 0, 0, true],
  ['www.keurig.com', 0, 0, true],
  ['keurig.com.', 0, 0, true],
  ['192.168.1.1', 0, 0, false],
  ['8.8.8.8', 0, 0, false],
  ['[::1]', 0, 0, false],
  ['localhost', 0, 0, false],
  ['router', 0, 0, false],
  ['printer.local', 0, 0, false],
  ['app.test', 0, 0, false],
  ['box.home.arpa', 0, 0, false],
  ['svc.internal', 0, 0, false],
  ['nas.lan', 0, 0, false],
  ['a.localhost', 0, 0, false],
  ['x.example', 0, 0, false],
  ['x.invalid', 0, 0, false],
  ['abc.onion', 0, 0, false],
  ['example.com', 1, 0, false],
  ['example.com', 0, 1, false],
  ['1.2.3.4.com', 0, 0, true],
];
// [net error, falls back]
const CODES = [
  [-102, true], [-101, true], [-100, true], [-103, true], [-104, true], [-107, true], [-109, true],
  [-113, true], [-118, true], [-7, true], [-15, true], [-324, true], [-200, true], [-202, true], [-299, true],
  [-3, false], [-20, false], [-21, false], [-27, false], [-105, false], [-106, false], [-137, false], [-300, false], [0, false],
];

test('native fallback rules match shipping typed-https-fallback.js', () => {
  const run = native();
  const answers = run([...HOSTS.map(([h, p, c]) => `host ${h} ${p} ${c}`), ...CODES.map(([code]) => `code ${code} 0 0`)]);
  HOSTS.forEach(([h, p, c, want], i) => assert.equal(answers[i], want, `host ${h} port=${p} creds=${c}`));
  CODES.forEach(([code, want], i) => assert.equal(answers[HOSTS.length + i], want, `code ${code}`));
});
