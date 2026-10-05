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
 */
async function clickWhenSettled(locator, label, timeout = 8000) {
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
  await locator.click({ force: true });
}

module.exports = { waitForValue, openOverlaySurface, clickWhenSettled };
