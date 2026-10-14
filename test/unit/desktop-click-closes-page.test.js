'use strict';

// A desktop-harness click whose expected effect is closing its own page (the
// uBO popup's Dashboard and Logger links, its Back and Close buttons) can lose
// the race with that close: Playwright rejects the click when the page goes
// away before the click's last input is acknowledged, and that rejection is not
// ordered against the page's own close event. Seen as
// "locator.click: Target page, context or browser has been closed" at
// shield-provider.mjs:421 on PR #788. The harness accepts exactly that error,
// and only once the page really closes while its app lives on; every other
// error stays fatal.

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { clickWhenSettled, expectPageClose, isTargetClosedError } = require('../desktop/support/poll.js');

// What Playwright 1.63 rejects with when an Electron window is destroyed
// mid-click: a plain Error (name "Error", not "TargetClosedError") whose
// message carries the API call prefix.
const targetClosed = (call = 'locator.click') => new Error(`${call}: Target page, context or browser has been closed`);
const CLOSED = /Target page, context or browser has been closed/;

// The parts of a Playwright Page the helpers touch: isClosed() flips before the
// close event fires, waitForEvent rejects on its timeout, and the context's
// cookies() call rejects once the whole app has gone away.
function fakePage() {
  const page = new EventEmitter();
  let closed = false;
  let appAlive = true;
  page.isClosed = () => closed;
  page.close = () => { closed = true; page.emit('close', page); };
  page.appDies = () => { appAlive = false; page.close(); };
  page.context = () => ({
    cookies: async () => {
      if (!appAlive) throw targetClosed('browserContext.cookies');
      return [];
    },
  });
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

test('the close rejection stays fatal, and says so, when the page never closes', async () => {
  const page = fakePage();
  const rejection = clickWhenSettled(fakeLocator(page, async () => { throw targetClosed(); }), 'Logger link', { closesPage: true });
  await assert.rejects(rejection, (error) => /stayed open/.test(error.message) && CLOSED.test(error.message));
  assert.equal(page.isClosed(), false);
});

test('an app that dies mid-click fails the click instead of passing as a close', async () => {
  const page = fakePage();
  const locator = fakeLocator(page, async () => { setTimeout(() => page.appDies(), 20); throw targetClosed(); });
  await assert.rejects(clickWhenSettled(locator, 'Dashboard link', { closesPage: true }), /so did its browser context/);
});

test('an app that dies right after a clean click fails it too', async () => {
  const page = fakePage();
  const locator = fakeLocator(page, async () => { setTimeout(() => page.appDies(), 20); });
  await assert.rejects(clickWhenSettled(locator, 'Back', { closesPage: true }), /so did its browser context/);
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
  await expectPageClose(closing, async () => { setTimeout(() => closing.close(), 20); throw targetClosed('locator.dispatchEvent'); });
  assert.equal(closing.isClosed(), true);
  const open = fakePage();
  await assert.rejects(expectPageClose(open, async () => { throw targetClosed(); }), /stayed open/);
  const other = fakePage();
  await assert.rejects(expectPageClose(other, async () => { other.close(); throw new Error('dispatchEvent failed'); }), /dispatchEvent failed/);
  const dying = fakePage();
  await assert.rejects(expectPageClose(dying, async () => { dying.appDies(); throw targetClosed(); }), /so did its browser context/);
});

test('a custom settle timeout reaches the settle wait', async () => {
  const page = fakePage();
  const hidden = { ...fakeLocator(page, async () => {}), boundingBox: async () => null };
  const started = Date.now();
  await assert.rejects(clickWhenSettled(hidden, 'Hidden control', { timeout: 120 }), /Hidden control to settle as the hit target/);
  assert.ok(Date.now() - started < 2000, 'the 120 ms budget, not the 8 s default, decided the timeout');
});

test('a bare number in place of the options object is refused, not ignored', async () => {
  const page = fakePage();
  await assert.rejects(clickWhenSettled(fakeLocator(page, async () => {}), 'Back', 15000), TypeError);
  await assert.rejects(clickWhenSettled(fakeLocator(page, async () => {}), 'Back', null), TypeError);
});

test('isTargetClosedError recognizes only the closed-target rejection', () => {
  assert.equal(isTargetClosedError(targetClosed()), true);
  assert.equal(isTargetClosedError(targetClosed('page.evaluate')), true);
  assert.equal(isTargetClosedError(new Error('locator.click: Timeout 8000ms exceeded')), false);
  assert.equal(isTargetClosedError(undefined), false);
  assert.equal(isTargetClosedError('Target page, context or browser has been closed'), false);
});
