import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {CONTRACT, OUT, CODEC, generate, parseType, snake, camel} from './browser-api-mojom.mjs';

const contract = JSON.parse(fs.readFileSync(CONTRACT, 'utf8'));
const generated = generate(contract);
const codec = () => {
  const window = {};
  vm.runInNewContext(generated.codec, {window, JSON});
  return window.BlancBrowserApiCodec;
};

test('parses every contract type expression', () => {
  assert.deepEqual(parseType("'a' | 'b'"), [{literal: 'a'}, {literal: 'b'}]);
  assert.deepEqual(parseType('TabId[] | null'), [{array: 'TabId'}, {name: 'null'}]);
  assert.deepEqual(parseType('{ private?: boolean }'), [{object: {private: {type: 'boolean', optional: true}}}]);
  assert.throws(() => parseType('Map<string, number>'), /Unsupported type term/);
});

test('covers every IPC member of the contract', () => {
  const {groups, values} = generated.model;
  const covered = Object.values(groups).flatMap(g => [...g.methods, ...g.events].map(x => x.js));
  assert.deepEqual(new Set(covered), new Set(contract.members.filter(m => m.kind !== 'value').map(m => m.name)));
  assert.deepEqual(values, ['platform']);
});

test('every wire name maps back to its contract name, or the codec renames it', () => {
  for (const [name, fields] of Object.entries(codec().table.structs)) {
    for (const f of fields) {
      const field = generated.model.structs[name].find(x => x.js === f.js);
      assert.equal(f.wire ?? f.js, camel(field.mojo), `${name}.${f.js}`);
    }
  }
  assert.equal(snake('activeTabId'), 'active_tab_id');
  assert.equal(camel(snake('activeTabId')), 'activeTabId');
});

test('the codec keeps Island values contract-shaped', () => {
  // The codec runs in its own realm; compare plain JSON.
  const plain = v => JSON.parse(JSON.stringify(v));
  const {encode: rawEncode, decode: rawDecode} = codec();
  const encode = (...a) => plain(rawEncode(...a)), decode = (...a) => plain(rawDecode(...a));
  assert.deepEqual(encode({struct: 'CreateTabOptions'}, {private: true}), {isPrivate: true});
  assert.deepEqual(decode({struct: 'CreateTabOptions'}, {isPrivate: null}), {});
  const fill = codec().table.methods.fillLoginFromOnePassword.returns;
  assert.equal(decode(fill, {boolValue: false}), false);
  assert.deepEqual(decode(codec().table.methods.search.returns, {stringValue: 'https://duckduckgo.com/?q=a'}), 'https://duckduckgo.com/?q=a');
  assert.equal(decode(codec().table.methods.search.returns, null), null);
});

test('invoke calls the group remote and returns contract values', async () => {
  const {invoke} = codec();
  const calls = [];
  const navigation = {
    navigate: async (...a) => { calls.push(['navigate', ...a]); return {result: null}; },
    search: async (...a) => { calls.push(['search', ...a]); return {result: {boolValue: true}}; },
    stop: async (...a) => { calls.push(['stop', ...a]); return {}; },
  };
  assert.equal(await invoke({navigation}, 'navigate', ['7', 'https://a.test/']), undefined);
  assert.equal(await invoke({navigation}, 'search', ['7', 'q']), true);
  assert.equal(await invoke({navigation}, 'stop', ['7']), undefined);
  assert.deepEqual(calls, [['navigate', '7', 'https://a.test/'], ['search', '7', 'q', null], ['stop', '7']]);
  await assert.rejects(() => invoke({navigation}, 'createTab', []), /not on the typed interface yet/);
});

test('C++ checks accept exactly the contract literals', () => {
  const header = generated.files['browser_api_checks.h'];
  assert.match(header, /inline bool IsValidThemePreference\(std::string_view value\) \{\n  return value == "system" \|\|\n\s+value == "light" \|\|\n\s+value == "dark";/);
  assert.match(header, /inline bool IsValidFillLoginFailureOk\(bool value\) \{ return !value; \}/);
  assert.match(header, /IsValidOverlayMode/);
});

test('committed output matches the contract', () => {
  for (const [name, text] of Object.entries(generated.files)) assert.equal(fs.readFileSync(path.join(OUT, name), 'utf8'), text, name);
  assert.equal(fs.readFileSync(CODEC, 'utf8'), generated.codec);
});
