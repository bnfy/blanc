'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createBlockingCoordinator, CALLBACK_EVENTS, OBSERVE_EVENTS } = require('../../src/main/blocking-coordinator');
function fixture() {
  const handlers = new Map(); const registrations = [];
  const session = { webRequest: Object.fromEntries([...CALLBACK_EVENTS, ...OBSERVE_EVENTS].map(event => [event, (_filter, listener) => {
    registrations.push(event); handlers.set(event, listener);
  }])) };
  const coordinator = createBlockingCoordinator();
  const request = (event, details) => new Promise(resolve => handlers.get(event)(details, resolve));
  return { coordinator, session, handlers, registrations, request };
}
test('a provider replacement preserves the crash guard and startup gate', async () => {
  const f = fixture(); let decisions = 0;
  f.coordinator.setProvider(f.session, { decide: () => { decisions++; return {}; } });
  f.coordinator.setProvider(f.session, { decide: () => ({ cancel: false }) });
  assert.equal(f.registrations.length, 8);
  assert.deepEqual(await f.request('onBeforeRequest', { resourceType: 'subFrame', url: 'https://chromewebstore.google.com/' }), { cancel: true });
  f.coordinator.setGate(f.session, () => true);
  assert.deepEqual(await f.request('onBeforeRequest', { resourceType: 'mainFrame', url: 'https://example.org/' }), { cancel: true });
  f.coordinator.setGate(f.session, null);
  assert.deepEqual(await f.request('onBeforeRequest', { resourceType: 'mainFrame', url: 'https://example.org/' }), { cancel: false });
  assert.equal(decisions, 0);
});
test('client hints precede provider decisions and survive provider disposal', async () => {
  const f = fixture();
  f.coordinator.setBeforeSendHeaders(f.session, details => ({ requestHeaders: { ...details.requestHeaders, 'Sec-CH-UA': 'Chrome' } }));
  f.coordinator.setProvider(f.session, { decide: (_event, details) => {
    assert.equal(details.requestHeaders['Sec-CH-UA'], 'Chrome'); return { requestHeaders: { ...details.requestHeaders, 'X-Filter': '1' } };
  } });
  assert.equal((await f.request('onBeforeSendHeaders', { requestHeaders: {} })).requestHeaders['X-Filter'], '1');
  f.coordinator.setProvider(f.session, null);
  assert.equal((await f.request('onBeforeSendHeaders', { requestHeaders: {} })).requestHeaders['Sec-CH-UA'], 'Chrome');
});
test('a rejected provider decision cancels and never invokes a callback twice', async () => {
  const f = fixture();
  f.coordinator.setProvider(f.session, { decide: async () => { throw new Error('background-lost'); } });
  assert.deepEqual(await f.request('onHeadersReceived', {}), { cancel: true });
});
