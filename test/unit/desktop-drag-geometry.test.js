'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { gapBefore } = require('../desktop/support/tab-drag');

test('drag geometry re-resolves a header replaced during scroll preparation', async () => {
  let scrolls = 0;
  let measurements = 0;
  const locator = {
    async scrollIntoViewIfNeeded() {
      if (++scrolls === 1) throw new Error('locator.scrollIntoViewIfNeeded: Element is not attached to the DOM');
    },
    async boundingBox() {
      measurements++;
      return { x: 10, y: 80, width: 200, height: 30 };
    },
  };
  assert.equal(await gapBefore(locator, 'replaced header'), 82);
  assert.equal(scrolls, 2);
  assert.equal(measurements, 1);
});

test('drag geometry does not swallow renderer closure or unrelated scroll errors', async () => {
  for (const message of ['Target page, context or browser has been closed', 'Timeout 2000ms exceeded']) {
    let attempts = 0;
    const error = new Error(message);
    const locator = {
      async scrollIntoViewIfNeeded() { attempts++; throw error; },
      async boundingBox() { assert.fail('must not measure after a fatal scroll error'); },
    };
    await assert.rejects(gapBefore(locator, 'header'), value => value === error);
    assert.equal(attempts, 1);
  }
});
