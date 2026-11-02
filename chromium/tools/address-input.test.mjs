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

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHIPPING = '85883b1afa11375e1300130914d6f40c5388af21';
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
const inputs = [
  'example.com', ' example.com ', 'example.com/path?q=1#x', 'https://example.com', 'HTTP://Example.com',
  'blanc://settings', 'javascript:alert(1)', 'javascript://x', 'file:///etc/hosts', 'ftp://host/file',
  'chrome://settings', 'localhost', 'localhost:3000/a', 'localhostx', '127.0.0.1', '10.0.0.1:8080/x',
  '999.1.1.1', 'site:example.com', 'site:example.com foo', 'user:pass@example.com', 'a:1', 'host:8080',
  'how tall is everest', 'example', 'mailto:a@b.com', 'MAILTO:a@b.com', 'tel:+15550100', 'sms:+1',
  'facetime:a@b.c', 'claude://login', 'claude:login', 'zoommtg://zoom.us/join', 'ssh://host', 'smb://x',
  'x-apple.systempreferences:com.apple', 'search:foo', 'c:\\windows', 'mailto:a@b.com"', 'mailto:a b',
  '', '   ', 'a.b', 'a.bc', 'xn--bcher-kva.example', 'example.com:abc', 'https://exa mple.com',
  'data:text/html,hi', 'about:blank', 'view-source:https://a.b', 'vscode://file/x', 'obsidian://open',
  ...[...shipping.DENIED_HANDOFF_PROTOCOLS, ...shipping.DIRECT_HANDOFF_PROTOCOLS].flatMap(p => [p + 'x', p + '//x', p + '/x']),
];
// Deterministic random strings built from address-like fragments.
function* generated(count) {
  const parts = ['a', 'b.c', '.com', '/', ':', '//', '8080', '@', '?', '#', ' ', 'mailto:', 'tel:', 'http', 's', 'x-y+z', '1.2.3.4', 'localhost', 'site:', '"', '\\', '\t', 'é'];
  let seed = 7;
  const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = 0; i < count; i++) {
    let s = '';
    for (let n = 1 + Math.floor(next() * 6); n > 0; n--) s += parts[Math.floor(next() * parts.length)];
    yield s;
  }
}

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
