// Differential test: the Island's address-input port must answer exactly as
// shipping v1.45.1's own classifyExternalNavigation and normalizeAddressInput,
// loaded unchanged from the shipping commit.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {HAND_PICKED, generated} from './address-corpus.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHIPPING = '6479ed3a314e4fd6219b8de1598bacffa78b4d7c';
const show = file => execFileSync('git', ['show', `${SHIPPING}:${file}`], {cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024});
const port = createRequire(import.meta.url)(path.join(root, 'blanc/island/address-input.js'));

function shippingProtocols() {
  const module = {exports: {}};
  vm.runInNewContext(show('src/main/external-protocols.js'), {
    module, exports: module.exports, URL,
    require: name => { if (name === './blocking-resources') return {PDF_VIEWER_ORIGIN: 'chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai'}; throw Error('unexpected require ' + name); },
  });
  return module.exports;
}
function shippingNormalize() {
  const main = show('src/main/main.js');
  const start = main.indexOf('function normalizeAddressInput(input) {');
  const end = main.indexOf('\n}\n', start);
  assert(start > 0 && end > start, 'normalizeAddressInput found in shipping main.js');
  const context = {settings: {searchUrlFor: text => 'SEARCH:' + text}};
  vm.runInNewContext(main.slice(start, end + 2) + '\nthis.normalizeAddressInput = normalizeAddressInput;', context);
  return context.normalizeAddressInput;
}

const shipping = shippingProtocols();
const inputs = [...HAND_PICKED, ...[...shipping.DENIED_HANDOFF_PROTOCOLS, ...shipping.DIRECT_HANDOFF_PROTOCOLS].flatMap(p => [p + 'x', p + '//x', p + '/x'])];

test('hand-off decisions match shipping for typed and page-started links', () => {
  for (const input of [...inputs, ...generated(2000)]) {
    for (const trusted of [true, false]) {
      // Shipping runs in its own VM realm; compare the plain values.
      assert.equal(JSON.stringify(port.classifyExternalNavigation(input, {trusted})), JSON.stringify(shipping.classifyExternalNavigation(input, {trusted})), `${JSON.stringify(input)} trusted=${trusted}`);
    }
  }
});

test('address normalization matches shipping', () => {
  const normalizeAddressInput = shippingNormalize();
  for (const input of [...inputs, ...generated(2000)]) {
    assert.equal(port.normalize(input, text => 'SEARCH:' + text), normalizeAddressInput(input), JSON.stringify(input));
  }
});

test('interpret follows shipping order: hand-off, then address or search', () => {
  assert.deepEqual(port.interpret('mailto:a@b.com'), {kind: 'handoff', url: 'mailto:a@b.com', confirm: false});
  assert.deepEqual(port.interpret('claude://login'), {kind: 'handoff', url: 'claude://login', confirm: true});
  assert.deepEqual(port.interpret('example.com'), {kind: 'address', url: 'https://example.com'});
  assert.deepEqual(port.interpret('how tall is everest'), {kind: 'search', query: 'how tall is everest'});
  assert.deepEqual(port.interpret('site:example.com'), {kind: 'search', query: 'site:example.com'});
  // A denied OS scheme typed by the user falls through to normalization.
  assert.deepEqual(port.interpret('ssh://host'), {kind: 'search', query: 'ssh://host'});
});
