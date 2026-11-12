'use strict';

const { waitForValue } = require('./poll');

/**
 * Ask Quiet Tabs to rest one background tab, the way its own 30 s sweep keeps
 * asking. quietTab refuses whenever anything is uncertain, and some refusals
 * pass on their own: a frame still loading (a form's response arriving in an
 * iframe), or a frame that misses the dirty probe's 250 ms budget in a
 * backgrounded renderer on a busy CI runner. So this waits for every frame to
 * stop loading before each request, and a tab that must rest is asked again
 * until `timeout`. The caller asserts on `rested`, naming `reasons`: main's
 * recorded refusal for each request that was turned down.
 *
 * @param {(method: string, args: unknown[]) => Promise<any>} call - a test-hook caller
 * @returns {Promise<{rested: boolean, reasons: string[]}>}
 */
async function restTab(call, id, label, { required = true, timeout = 20_000, retryDelay = 250 } = {}) {
  const deadline = Date.now() + timeout;
  const reasons = [];
  for (;;) {
    // `isLoading` counts every frame; quietTab refuses while any one loads.
    await waitForValue(async () => (await call('state', []))?.tabs?.find((tab) => tab.id === id),
      (tab) => !tab?.isLoading, `${label} stops loading before it rests`, timeout);
    const outcome = await call('quietTabOutcome', [id]);
    if (outcome?.rested === true) return { rested: true, reasons };
    reasons.push(outcome?.reason ?? 'unknown');
    if (!required || Date.now() >= deadline) return { rested: false, reasons };
    await new Promise((resolve) => setTimeout(resolve, retryDelay));
  }
}

module.exports = { restTab };
