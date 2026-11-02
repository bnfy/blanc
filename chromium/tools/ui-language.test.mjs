// The interface language (F44) must resolve as shipping v1.45.1 does: the
// native pin (blanc/browser/ui/ui_language.h, compiled here) followed by the
// fork's own strings.js must choose the language shipping's resolveLocale
// chooses, for every stored value and browser language list. The selectable
// languages and their endonyms are shipping's.
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
const header = fs.readFileSync(path.join(root, 'blanc/browser/ui/ui_language.h'), 'utf8');
const locales = JSON.parse(show('src/main/i18n-locales.json'));
const selectable = locales.filter(l => l.status === 'selectable');

test('the selectable languages and endonyms are shipping\'s, and strings.js offers the same', () => {
  const native = [...header.matchAll(/\{"([^"]+)", "([^"]+)"\}/g)].map(m => ({code: m[1], endonym: m[2]}));
  assert.deepEqual(native, selectable.map(({code, endonym}) => ({code, endonym})));
  const strings = fs.readFileSync(path.join(root, 'blanc/island/strings.js'), 'utf8');
  assert.deepEqual(JSON.parse(/const codes=(\[[^\]]*\])/.exec(strings)[1]), native.map(l => l.code));
});

function nativePins(values) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-ui-language-'));
  fs.writeFileSync(path.join(dir, 'main.cc'), `#include <iostream>
#include <string>
#include "blanc/browser/ui/ui_language.h"
int main() { std::string v; while (std::getline(std::cin, v)) {
  auto pin = blanc::ui_language::Pin(v); std::cout << (pin ? *pin : "-") << " "
    << blanc::ui_language::IsChoice(v) << "\\n"; } }
`);
  execFileSync('c++', ['-std=c++20', '-I', root, path.join(dir, 'main.cc'), '-o', path.join(dir, 'pin')]);
  const out = execFileSync(path.join(dir, 'pin'), {input: values.join('\n') + '\n', encoding: 'utf8'}).trim().split('\n');
  fs.rmSync(dir, {recursive: true, force: true});
  return out.map(line => { const [pin, choice] = line.split(' '); return {pin: pin === '-' ? null : pin, choice: choice === '1'}; });
}

// The fork's strings.js in a document whose browser languages are `languages`
// and whose pin is `pin`; returns the catalog it chose.
const stringsSource = fs.readFileSync(path.join(root, 'blanc/island/strings.js'), 'utf8');
function forkChoice(pin, languages) {
  const window = {navigator: {languages, language: languages[0]}, __blancUiLanguage: pin};
  vm.runInNewContext(stringsSource, {window, self: window, globalThis: window, Intl});
  return window.blancStrings;
}

test('pin, then strings.js, chooses what shipping\'s resolveLocale chooses', () => {
  const module = {exports: {}};
  vm.runInNewContext(show('src/main/i18n.js'), {module, exports: module.exports,
    require: name => name === '../renderer/pages/i18n' ? {createTranslator: () => () => ''} : (() => { throw Error(name); })()});
  const {resolveLocale} = module.exports;
  const codes = selectable.map(l => l.code);
  const stored = ['system', ...codes, 'ja', 'en-XA', 'EN', 'de-DE', 'pt', '', 'System', 'pt-br'];
  const lists = [['de-DE'], ['en-US'], ['pt-PT', 'fr'], ['ja', 'it-IT'], ['zh-Hant-TW'], ['es_419'], ['ja'], ['pt'], ['de-AT', 'en'], ['fr-CA']];
  const pins = nativePins(stored);
  for (const [i, value] of stored.entries()) {
    assert.equal(pins[i].choice, value === 'system' || codes.includes(value), `IsChoice(${JSON.stringify(value)})`);
    for (const languages of lists) {
      const expected = resolveLocale({setting: value, preferred: languages, selectable: codes}).locale;
      const chosen = forkChoice(pins[i].pin, languages).locale;
      assert.equal(chosen, expected, `stored ${JSON.stringify(value)} with ${languages}`);
    }
  }
});

test('Settings offers shipping\'s languages and resolves "system" as shipping does', async () => {
  const {createRequire} = await import('node:module');
  const page = createRequire(import.meta.url)(path.join(root, 'blanc/island/language-settings.js'));
  assert.deepEqual(page.UI_LANGUAGES, selectable.map(({code, endonym}) => ({code, endonym})));
  const module = {exports: {}};
  vm.runInNewContext(show('src/main/i18n.js'), {module, exports: module.exports,
    require: () => ({createTranslator: () => () => ''})});
  const codes = selectable.map(l => l.code);
  for (const preferred of [['de-DE'], ['pt-PT', 'fr'], ['ja'], [], ['zh_TW', 'it'], ['PT-br'], ['es-419'], ['en-GB']])
    assert.equal(page.resolveSystem(preferred), module.exports.resolveLocale({setting: 'system', preferred, selectable: codes}).locale, String(preferred));
  // Shipping's own row model gives the same rows and relaunch answers.
  const model = {exports: {}};
  vm.runInNewContext(show('src/renderer/pages/settings-language-model.js'), {module: model, self: undefined});
  const t = (key, params) => `${key}:${JSON.stringify(params ?? {})}`;
  for (const uiLanguage of ['system', 'de', 'ja', 'pt-BR']) {
    const languages = {active: 'en', system: 'de', options: page.UI_LANGUAGES};
    const plain = v => JSON.parse(JSON.stringify(v));
    assert.deepEqual(plain(page.languageRow({uiLanguage, languages, t})), plain(model.exports.languageRow({uiLanguage, languages, t})));
    for (const value of ['system', 'en', 'de']) assert.equal(page.needsRelaunch(value, languages), model.exports.needsRelaunch(value, languages));
  }
  const strings = fs.readFileSync(path.join(root, 'blanc/island/strings.js'), 'utf8');
  for (const key of ['settings.language.label', 'settings.language.hint', 'settings.language.relaunch', 'settings.language.system'])
    assert.ok(strings.includes(`"${key}":`), key);
});
