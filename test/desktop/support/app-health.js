'use strict';

// Whether the shared acceptance app can still run the next scenario, and the
// record of every time the harness had to relaunch it. Pure apart from the
// app handle it is given, so the rules are unit-tested without Electron.

const TRANSPORT_ERRORS = [
  'Target crashed',
  'has been closed',
  'Execution context was destroyed',
];

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
  const child = electronApp.process();
  if (child?.exitCode !== null && child?.exitCode !== undefined) {
    return { healthy: false, reason: `process exited (code ${child.exitCode}, signal ${child.signalCode})` };
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
      return { healthy: false, reason: `page ${page.url()} did not answer: ${firstLine(error?.message)}` };
    }
  }
  return { healthy: true, reason: null };
}

function createHealingLog() {
  const entries = [];
  return {
    entries,
    record({ scenario, reason }) { entries.push({ scenario, reason }); },
    summaryLines() {
      if (!entries.length) return [];
      return [
        `acceptance: the harness relaunched Blanc ${entries.length} time(s)`,
        ...entries.map(({ scenario, reason }) => `  before "${scenario}": ${reason}`),
      ];
    },
  };
}

module.exports = { isTransportError, firstLine, shouldHealAfterReset, probeApp, createHealingLog };
