// Chromium's own text names the browser Blanc (blanc/common/product_name.h),
// compiled with the system C++ compiler: the product name is replaced, the
// copyright holder, the credited project and other products are kept.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// One string per line on stdin (UTF-8), its Blanc text per line out.
function nativeProductText() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-product-name-'));
  const harness = path.join(dir, 'main.cc');
  fs.writeFileSync(harness, `#include <iostream>
#include <string>
#include "blanc/common/product_name.h"
static std::u16string In(const std::string& s) {
  std::u16string out;
  for (size_t i = 0; i < s.size();) {
    unsigned char c = s[i];
    char32_t cp; int n;
    if (c < 0x80) { cp = c; n = 1; } else if (c < 0xE0) { cp = c & 0x1F; n = 2; }
    else if (c < 0xF0) { cp = c & 0x0F; n = 3; } else { cp = c & 0x07; n = 4; }
    for (int k = 1; k < n; ++k) cp = (cp << 6) | (s[i + k] & 0x3F);
    i += n;
    if (cp >= 0x10000) { cp -= 0x10000; out += char16_t(0xD800 + (cp >> 10)); out += char16_t(0xDC00 + (cp & 0x3FF)); }
    else out += char16_t(cp);
  }
  return out;
}
static std::string Out(const std::u16string& s) {
  std::string out;
  for (size_t i = 0; i < s.size(); ++i) {
    char32_t cp = s[i];
    if (cp >= 0xD800 && cp < 0xDC00 && i + 1 < s.size()) cp = 0x10000 + ((cp - 0xD800) << 10) + (s[++i] - 0xDC00);
    if (cp < 0x80) out += char(cp);
    else if (cp < 0x800) { out += char(0xC0 | (cp >> 6)); out += char(0x80 | (cp & 0x3F)); }
    else if (cp < 0x10000) { out += char(0xE0 | (cp >> 12)); out += char(0x80 | ((cp >> 6) & 0x3F)); out += char(0x80 | (cp & 0x3F)); }
    else { out += char(0xF0 | (cp >> 18)); out += char(0x80 | ((cp >> 12) & 0x3F)); out += char(0x80 | ((cp >> 6) & 0x3F)); out += char(0x80 | (cp & 0x3F)); }
  }
  return out;
}
int main() {
  std::string line;
  while (std::getline(std::cin, line)) std::cout << Out(blanc::BlancProductText(In(line))) << '\\n';
}
`);
  const exe = path.join(dir, 'product-name');
  execFileSync('c++', ['-std=c++20', '-Wall', '-Werror', '-I', root, harness, '-o', exe]);
  return inputs => execFileSync(exe, {input: inputs.join('\n') + '\n', encoding: 'utf8'}).replace(/\n$/, '').split('\n');
}

const CASES = [
  // Replaced: the product, in any language and sentence position.
  ['Chromium wants to use your camera', 'Blanc wants to use your camera'],
  ['Relaunch Chromium.', 'Relaunch Blanc.'],
  ['About Chromium', 'About Blanc'],
  ['Chromium', 'Blanc'],
  ['Chromium Chromium', 'Blanc Blanc'],
  ['Chromium-Einstellungen', 'Blanc-Einstellungen'],
  ['„Chromium“ ist aktuell', '„Blanc“ ist aktuell'],
  ['Chromium, Chromium; (Chromium)', 'Blanc, Blanc; (Blanc)'],
  ['Mettre à jour Chromium ?', 'Mettre à jour Blanc ?'],
  ['Get help with Chromium', 'Get help with Blanc'],
  // Kept: the copyright holder, the credited project, other products, words.
  ['Copyright 2026 The Chromium Authors. All rights reserved.', 'Copyright 2026 The Chromium Authors. All rights reserved.'],
  ['The Chromium Authors', 'The Chromium Authors'],
  ['Blanc is made possible by the <a target="_blank" href="$1">Chromium</a> open source project and other <a target="_blank" href="$2">open source software</a>.',
    'Blanc is made possible by the <a target="_blank" href="$1">Chromium</a> open source project and other <a target="_blank" href="$2">open source software</a>.'],
  ['made possible by the Chromium open source project', 'made possible by the Chromium open source project'],
  ['the Chromium project', 'the Chromium project'],
  ['ChromiumOS', 'ChromiumOS'],
  ['Chromium OS', 'Chromium OS'],
  ['Chromium Enterprise', 'Chromium Enterprise'],
  ['Chromium-based browsers', 'Chromium-based browsers'],
  ['Chromiums', 'Chromiums'],
  ['NotChromium', 'NotChromium'],
  ['www.Chromium.org/Chromium', 'www.Chromium.org/Chromium'],
  ['chromium.org', 'chromium.org'],
  ['Chromium_beta', 'Chromium_beta'],
  ['', ''],
];

test('Chromium text names the browser Blanc and keeps credits and other products', () => {
  const run = nativeProductText();
  const out = run(CASES.map(([input]) => input));
  assert.deepEqual(out, CASES.map(([, expected]) => expected));
});
