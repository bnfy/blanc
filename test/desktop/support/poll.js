// Shared polling helpers for step definitions. One copy of the semantics —
// interval, deadline behavior, last-value diagnostics — instead of a private
// near-duplicate per steps file.

/** Poll `read()` until `predicate(value)` is truthy, or throw on timeout. */
async function waitForValue(read, predicate, label, timeout = 5000) {
  const deadline = Date.now() + timeout;
  let last;
  for (;;) {
    last = await read();
    if (predicate(last)) return last;
    if (Date.now() > deadline) {
      throw new Error(`timed out waiting for ${label}; last: ${JSON.stringify(last)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

/**
 * Open an overlay surface and wait for the RENDERER to enter it. Main's
 * openPanel/openPalette flip overlayMode synchronously, but the renderer
 * processes overlay:show later — and that handler resets inputTouched and
 * rewrites the input's value, silently undoing an edit that raced it. So:
 * close, wait for the renderer to leave its previous edit session, open,
 * wait for the renderer to enter the requested mode.
 *
 * @param {object} world - the Cucumber World (has .call)
 * @param {'openPanel'|'openPalette'} openMethod - __blanc method to invoke
 * @param {'panel'|'palette'} mode - renderer mode to wait for
 */
async function openOverlaySurface(world, openMethod, mode) {
  await world.call('closeOverlay');
  await waitForValue(
    () => world.call('overlayRendererMode'),
    (m) => m == null,
    'overlay renderer to leave its previous edit session'
  );
  await world.call(openMethod);
  await waitForValue(
    () => world.call('overlayRendererMode'),
    (m) => m === mode,
    `overlay renderer to enter ${mode} mode`
  );
}

/**
 * Click with real input once the element is visible, enabled, has kept the
 * same box across two polls, and is the hit target at its own center.
 * Playwright's own stability check counts animation frames, and on CI displays
 * (seen under Xvfb, for chrome and overlay renderers alike) a renderer can stop
 * producing them: the click then waits forever on an element that is visible,
 * focused and not moving. The forced click skips that frame wait, so the hit
 * test keeps the guarantee Playwright's "receives events" check would give.
 * With `closesPage`, the click is expected to close its own page: see
 * expectPageClose.
 */
async function clickWhenSettled(locator, label, options = {}) {
  // The settle timeout used to be a bare third argument; refuse that shape
  // rather than silently running on the default.
  if (typeof options !== 'object' || options === null) {
    throw new TypeError(`clickWhenSettled(${label}): pass options as an object, e.g. { timeout }, not ${options}`);
  }
  const { timeout = 8000, closesPage = false } = options;
  let previous = null;
  await waitForValue(async () => {
    const box = await locator.boundingBox();
    const ready = !!box && await locator.isVisible() && await locator.isEnabled();
    const settled = ready && !!previous && ['x', 'y', 'width', 'height'].every((key) => box[key] === previous[key]);
    previous = box;
    const hit = settled && await locator.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const target = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      return target === element || element.contains(target);
    });
    return { box, ready, settled, hit };
  }, (value) => value.settled && value.hit, `${label} to settle as the hit target`, timeout);
  const click = () => locator.click({ force: true });
  if (closesPage) await expectPageClose(locator.page(), click);
  else await click();
}

/**
 * Playwright's rejection of a call whose page, context or browser closed under
 * it. It arrives as a plain Error: the TargetClosedError name does not survive
 * to the client, so only the message identifies it.
 */
function isTargetClosedError(error) {
  return String(error?.message).includes('Target page, context or browser has been closed');
}

/**
 * Run `action`, whose expected effect is closing `page`, and resolve once the
 * page has closed while its app lives on. When the page goes away before the
 * action's last input is acknowledged, Playwright rejects the action with a
 * closed-target error that is not ordered against the page's own close event,
 * so isClosed() at catch time proves nothing. Accept exactly that error, and
 * only once the page really closes; every other error stays fatal. The page
 * also closes when its whole app or browser dies, so a context call must still
 * succeed afterwards, or a crash would pass as the expected close.
 */
async function expectPageClose(page, action) {
  const closed = () => (page.isClosed() ? Promise.resolve() : page.waitForEvent('close'));
  try {
    await action();
  } catch (error) {
    if (!isTargetClosedError(error)) throw error;
    await closed().catch((closeError) => {
      throw new Error(`the page stayed open after its action failed with: ${error.message}`, { cause: closeError });
    });
  }
  await closed();
  await page.context().cookies().catch((probeError) => {
    throw new Error(`the page closed, but so did its browser context: ${probeError.message}`, { cause: probeError });
  });
}

module.exports = { waitForValue, openOverlaySurface, clickWhenSettled, expectPageClose, isTargetClosedError };
