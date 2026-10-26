'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { browserStartupReady } = require('../desktop/support/ecs-startup.cjs');
const page = evaluate => ({ isClosed: () => false, url: () => 'blanc://newtab/', evaluate });
test('startup probe reacquires the current page after restoration closes the first', async () => {
  let current = page(async () => { throw Error('Target page, context or browser has been closed'); });
  const app = { pages: () => [current] };
  assert.equal(await browserStartupReady(app), false);
  current = page(async () => 'ready');
  assert.equal(await browserStartupReady(app), true);
});
test('startup probe requires ready, not merely an existing bridge or page', async () => {
  assert.equal(await browserStartupReady({ pages: () => [] }), false);
  assert.equal(await browserStartupReady({ pages: () => [page(async () => 'preparing')] }), false);
});
test('startup probe never swallows unrelated JavaScript failures', async () => {
  await assert.rejects(browserStartupReady({ pages: () => [page(async () => { throw Error('programming failure'); })] }), /programming failure/);
});
