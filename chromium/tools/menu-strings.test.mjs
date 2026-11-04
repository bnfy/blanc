// The private-browsing menu labels must be shipping's, in the language
// shipping's resolveLocale would choose for Chromium's application locale.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {catalogs, generate} from './menu-strings.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('the committed header is the generated one', () => {
  assert.equal(fs.readFileSync(path.join(root, 'blanc/common/menu_strings.h'), 'utf8'), generate());
});

test('each application locale gets its language, else English', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-menu-strings-'));
  fs.writeFileSync(path.join(dir, 'main.cc'), `#include <codecvt>
#include <iostream>
#include <locale>
#include <string>
#include "blanc/common/menu_strings.h"
int main() { std::string v; std::wstring_convert<std::codecvt_utf8_utf16<char16_t>, char16_t> utf8;
  while (std::getline(std::cin, v)) { const auto& l = blanc::menu::ForLocale(v);
    std::cout << utf8.to_bytes(std::u16string(l.new_private_tab)) << "|"
              << utf8.to_bytes(std::u16string(l.new_private_window)) << "\\n"; } }
`);
  execFileSync('c++', ['-std=c++20', '-Wno-deprecated-declarations', '-I', root, path.join(dir, 'main.cc'), '-o', path.join(dir, 'labels')]);
  const asked = ['en-US', 'de', 'de-AT', 'es-419', 'fr_CA', 'it', 'pt-PT', 'pt-BR', 'ja', ''];
  const out = execFileSync(path.join(dir, 'labels'), {input: asked.join('\n') + '\n', encoding: 'utf8'}).trimEnd().split('\n');
  fs.rmSync(dir, {recursive: true, force: true});
  const byCode = Object.fromEntries(catalogs().map(({code, values}) => [code, values.slice(0, 2).join('|')]));
  assert.deepEqual(out, ['en', 'de', 'de', 'es', 'fr', 'it', 'pt-BR', 'pt-BR', 'en', 'en'].map(code => byCode[code]));
  assert.equal(byCode.en, 'New Private Tab|New Private Window');
});

test('the address menu has shipping\'s English labels', () => {
  const en = catalogs().find(({code}) => code === 'en').values.slice(2);
  assert.deepEqual(en, ['Undo', 'Redo', 'Cut', 'Copy', 'Copy Clean Link', 'Paste', 'Paste and Go', 'Delete', 'Select All']);
});
