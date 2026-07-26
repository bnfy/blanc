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

module.exports = { waitForValue, openOverlaySurface };
