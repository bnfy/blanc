// Synthetic tests for exact combined overlay submission logic; no native/browser work.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');

const overlay = fs.readFileSync(path.join(__dirname, 'combined-assets-v2/overlay.js'), 'utf8');
assert.equal(crypto.createHash('sha256').update(overlay).digest('hex'),
  '3fb033c9931a03b0f8dab9d33a12635962be7c2aaed2af7e85868ce79bbf4b31');
const start = overlay.indexOf('  let addressSubmissionGeneration = 0;');
const end = overlay.indexOf('  function pickResult(result)', start);
assert(start >= 0 && end > start);
const actualHelper = overlay.slice(start, end);

class Element {
  constructor() { this.attrs = {}; this.listeners = {}; this.value = ''; this.hidden = false; }
  setAttribute(k, v) { this.attrs[k] = v; }
  getAttribute(k) { return this.attrs[k] ?? null; }
  removeAttribute(k) { delete this.attrs[k]; }
  addEventListener(k, fn) { this.listeners[k] = fn; }
  focus() {}
  after() {}
}
function setup() {
  const addressInput = new Element();
  addressInput.value = 'synthetic query';
  const context = {
    addressInput,
    islandPanel: { querySelector: () => new Element() },
    document: { createElement: () => new Element() },
    blancI18n: { t: () => 'Try again' },
    window: { browserAPI: { closed: 0, closeOverlay() { this.closed++; } } },
    mode: 'panel',
    state: { activeTabId: '7', searchSelectionEpoch: '41' },
  };
  vm.createContext(context);
  vm.runInContext(actualHelper + '\nthis.submit = submitAddressAction; this.setState = setAddressSubmissionState; this.notice = addressSubmissionNotice;', context);
  return context;
}
function delayed() {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
}
test('group-like selection invalidates a pending same-tab search even after returning', async () => {
  const c = setup(), action = delayed();
  const pending = c.submit(() => action.promise);
  c.setState({ activeTabId: '8', searchSelectionEpoch: '42' });
  c.setState({ activeTabId: '7', searchSelectionEpoch: '43' });
  action.resolve({ status: 'committed' });
  await pending;
  assert.equal(c.window.browserAPI.closed, 0);
  assert.equal(c.addressInput.value, 'synthetic query');
  assert.equal(c.addressInput.getAttribute('aria-busy'), null);
});
test('a group-like switch cannot impersonate the pending created search tab', async () => {
  const c = setup(), action = delayed();
  const pending = c.submit(() => action.promise, { createsTab: true });
  c.setState({ activeTabId: '8', searchSelectionEpoch: '42' });
  action.resolve({ status: 'committed', tabId: '9', selectionEpoch: '42' });
  await pending;
  assert.equal(c.window.browserAPI.closed, 0);
  assert.equal(c.addressInput.value, 'synthetic query');
  assert.equal(c.addressInput.getAttribute('aria-busy'), null);
});
test('group-like switch away and back invalidates a pending created-tab outcome', async () => {
  const c = setup(), action = delayed();
  const pending = c.submit(() => action.promise, { createsTab: true });
  c.setState({ activeTabId: '8', searchSelectionEpoch: '42' });
  c.setState({ activeTabId: '7', searchSelectionEpoch: '43' });
  action.resolve({ status: 'committed', tabId: '8', selectionEpoch: '42' });
  await pending;
  assert.equal(c.window.browserAPI.closed, 0);
  assert.equal(c.addressInput.value, 'synthetic query');
});
test('matching created-tab transition still closes after the observed successful outcome', async () => {
  const c = setup(), action = delayed();
  const pending = c.submit(() => action.promise, { createsTab: true });
  c.setState({ activeTabId: '9', searchSelectionEpoch: '42' });
  action.resolve({ status: 'committed', tabId: '9', selectionEpoch: '42' });
  await pending;
  assert.equal(c.window.browserAPI.closed, 1);
});
