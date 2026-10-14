'use strict';

// A desktop-harness click whose expected effect is closing its own page (the
// uBO popup's Dashboard and Logger links, its Back button) can lose the race
// with that close: Playwright rejects the click when the page goes away before
// the click's last input is acknowledged, and that rejection is not ordered
// against the page's own close event. Seen as
// "locator.click: Target page, context or browser has been closed" at
// shield-provider.mjs:421 on PR #788. The harness accepts exactly that error,
// and only once the page really closes; every other error stays fatal.

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { clickWhenSettled, expectPageClose } = require('../desktop/support/poll.js');

// What Playwright 1.63 rejects with when an Electron window is destroyed
// mid-click: a plain Error (name "Error", not "TargetClosedError") whose
// message carries the API call prefix.
const targetClosed = () => new Error('locator.click: Target page, context or browser has been closed');
const CLOSED = /Target page, context or browser has been closed/;

// The parts of a Playwright Page the helpers touch: isClosed() flips before the
// close event fires, and waitForEvent rejects on its timeout.
function fakePage() {
  const page = new EventEmitter();
  let closed = false;
  page.isClosed = () => closed;
  page.close = () => { closed = true; page.emit('close', page); };
  page.waitForEvent = (event, { timeout = 300 } = {}) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout ${timeout}ms exceeded while waiting for event "${event}"`)), timeout);
    page.once(event, () => { clearTimeout(timer); resolve(page); });
  });
  return page;
}

// A locator that is visible, still and the hit target, whose click runs `click`.
function fakeLocator(page, click) {
  return {
    page: () => page,
    boundingBox: async () => ({ x: 10, y: 10, width: 40, height: 20 }),
    isVisible: async () => true,
    isEnabled: async () => true,
    evaluate: async () => true,
    click,
  };
}

test('a click that closes its own page survives the close rejecting the click', async () => {
  const page = fakePage();
  // The close lands mid-click: the click rejects first, the close event follows.
  const locator = fakeLocator(page, async () => { setTimeout(() => page.close(), 20); throw targetClosed(); });
  await clickWhenSettled(locator, 'Dashboard link', { closesPage: true });
  assert.equal(page.isClosed(), true);
});

test('a click that closes its own page also passes when the close is already done', async () => {
  const page = fakePage();
  const locator = fakeLocator(page, async () => { page.close(); throw targetClosed(); });
  await clickWhenSettled(locator, 'Dashboard link', { closesPage: true });
  assert.equal(page.isClosed(), true);
});

test('a click that closes its own page waits for the close after a clean click', async () => {
  const page = fakePage();
  const locator = fakeLocator(page, async () => { setTimeout(() => page.close(), 20); });
  await clickWhenSettled(locator, 'Back', { closesPage: true });
  assert.equal(page.isClosed(), true);
});

test('a click that should close its page fails when the page stays open', async () => {
  const page = fakePage();
  await assert.rejects(clickWhenSettled(fakeLocator(page, async () => {}), 'Back', { closesPage: true }), /waiting for event "close"/);
});

test('the close rejection stays fatal when the page never closes', async () => {
  const page = fakePage();
  await assert.rejects(clickWhenSettled(fakeLocator(page, async () => { throw targetClosed(); }), 'Logger link', { closesPage: true }), CLOSED);
  assert.equal(page.isClosed(), false);
});

test('any other click error stays fatal even though the page closes', async () => {
  const page = fakePage();
  const locator = fakeLocator(page, async () => { page.close(); throw new Error('locator.click: Element is not attached to the DOM'); });
  await assert.rejects(clickWhenSettled(locator, 'Logger link', { closesPage: true }), /not attached to the DOM/);
});

test('without closesPage the close rejection still fails the click', async () => {
  const page = fakePage();
  const locator = fakeLocator(page, async () => { page.close(); throw targetClosed(); });
  await assert.rejects(clickWhenSettled(locator, 'Dashboard link'), CLOSED);
});

test('expectPageClose applies the same rule to any action', async () => {
  const closing = fakePage();
  await expectPageClose(closing, async () => { setTimeout(() => closing.close(), 20); throw targetClosed(); });
  assert.equal(closing.isClosed(), true);
  const open = fakePage();
  await assert.rejects(expectPageClose(open, async () => { throw targetClosed(); }), CLOSED);
  const other = fakePage();
  await assert.rejects(expectPageClose(other, async () => { other.close(); throw new Error('dispatchEvent failed'); }), /dispatchEvent failed/);
});
