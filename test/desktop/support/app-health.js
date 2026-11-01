'use strict';

// Whether the shared acceptance app can still run the next scenario, and the
// record of every time the harness had to relaunch it. Pure apart from the
// app handle it is given, so the rules are unit-tested without Electron.

const TRANSPORT_ERRORS = [
  'Target crashed',
  'has been closed',
  'Execution context was destroyed',
];

const PAGE_DEAD = ['Target crashed', 'has been closed'];

/** A Playwright error that means the handle, not the assertion, failed. */
function isTransportError(message) {
  const text = String(message ?? '');
  return TRANSPORT_ERRORS.some((needle) => text.includes(needle));
}

function firstLine(message) {
  return String(message ?? '').split('\n')[0].trim();
}

/** One heal per Before: a second transport failure fails the scenario. */
function shouldHealAfterReset({ alreadyHealed, error }) {
  return !alreadyHealed && isTransportError(error?.message);
}

/**
 * The app process's exit code: null while it runs, a number once it exited,
 * or 'disposed' when Playwright already released the handle (process() then
 * throws instead of answering).
 */
function exitCodeOf(electronApp) {
  try {
    return electronApp.process()?.exitCode ?? null;
  } catch {
    return 'disposed';
  }
}

function withTimeout(promise, timeoutMs) {
  let timer;
  return Promise.race([
    Promise.resolve(promise),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timer));
}

/**
 * A crashed renderer leaves the main process answering while its page handle
 * rejects everything, so every open window page is probed as well as main.
 * Never throws: an unusable app is reported through `reason`.
 */
async function probeApp(electronApp, { timeoutMs = 5000 } = {}) {
  if (!electronApp) return { healthy: false, reason: 'no app' };
  const exitCode = exitCodeOf(electronApp);
  if (exitCode === 'disposed') return { healthy: false, reason: 'app handle disposed' };
  if (exitCode !== null) {
    return { healthy: false, reason: `process exited (code ${exitCode}, signal ${electronApp.process().signalCode})` };
  }
  try {
    await withTimeout(electronApp.evaluate(() => 1), timeoutMs);
  } catch {
    return { healthy: false, reason: 'main process did not answer' };
  }
  for (const page of electronApp.windows()) {
    if (page.isClosed()) continue;
    try {
      await withTimeout(page.evaluate('1'), timeoutMs);
    } catch (error) {
      // Only a dead target counts. A navigation destroys the page's context, a
      // busy page is slow, and a page may close while it is probed: none of
      // those is a reason to relaunch the whole app.
      if (page.isClosed() || !PAGE_DEAD.some((needle) => String(error?.message).includes(needle))) continue;
      return { healthy: false, reason: `page ${page.url()} did not answer: ${firstLine(error?.message)}` };
    }
  }
  return { healthy: true, reason: null };
}

/**
 * What to do with an uncaught exception in the Cucumber process. After a
 * renderer crash, Playwright throws "Target crashed" from its own message
 * handler for each late reply; those, and only those (a dead-target message
 * thrown from inside playwright-core), mark the app for a relaunch and go no
 * further ('suspect'). Anything else, including the same message from a
 * floating promise in step code, goes to Cucumber's listeners while user code
 * runs ('forward'), or ends the process as Node would ('fatal').
 */
function routeUncaught(error, { listeners }) {
  const dead = PAGE_DEAD.some((needle) => String(error?.message ?? '').includes(needle));
  if (dead && /playwright-core/.test(String(error?.stack ?? ''))) return 'suspect';
  return listeners > 0 ? 'forward' : 'fatal';
}

function createHealingLog() {
  const entries = [];
  return {
    entries,
    record({ scenario, reason, exception = '' }) { entries.push({ scenario, reason, exception }); },
    summaryLines() {
      if (!entries.length) return [];
      return [
        `acceptance: the harness relaunched Blanc ${entries.length} time(s)`,
        ...entries.flatMap(({ scenario, reason, exception }) => [
          `  before "${scenario}": ${reason}`,
          ...(exception ? exception.trim().split('\n') : [])
            .map((line, index) => (index === 0 ? `    main-process exception: ${line}` : `    ${line}`)),
        ]),
      ];
    },
  };
}

module.exports = {
  isTransportError, firstLine, shouldHealAfterReset, exitCodeOf, probeApp, routeUncaught, createHealingLog,
};
