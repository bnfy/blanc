// Deciding when a browser has stopped moving.
//
// A fixed "wait 60 seconds after load" is the usual approach and it is a coin
// flip: too short and you catch a browser mid-load, too long and you catch it
// after idle-tab throttling or memory-pressure compaction has kicked in. Either
// way the browsers are not compared at the same point in their lifecycle, which
// is the failure mode that makes most published browser benchmarks unusable.
//
// So the runner samples on an interval and watches for the series to flatten:
// once the last `window` samples sit within `tolerance` of each other, the
// browser is settled. Every run also records the full series, so the shape of
// the curve is auditable after the fact rather than reduced to one number and
// taken on trust.

/**
 * @param {number[]} series bytes, oldest first
 * @param {{window?: number, tolerance?: number}} [options]
 * @returns {boolean}
 */
function isSettled(series, options = {}) {
  const { window = 3, tolerance = 0.02 } = options;
  const finite = (series || []).filter((v) => Number.isFinite(v));
  if (finite.length < window) return false;

  const recent = finite.slice(-window);
  const min = Math.min(...recent);
  const max = Math.max(...recent);
  if (min <= 0) return false;
  return (max - min) / min <= tolerance;
}

/**
 * Sample `read()` on an interval until the series settles or `maxMs` elapses.
 *
 * A timeout is not a failure — a video page never truly settles — but it is
 * recorded, so a report can mark rows that were still drifting when measured
 * instead of presenting them with the same confidence as the rest.
 *
 * @param {() => Promise<number>} read
 * @param {{intervalMs?: number, maxMs?: number, minMs?: number, window?: number, tolerance?: number, sleep?: Function, now?: Function, onSample?: Function}} [options]
 * @returns {Promise<{series: number[], settled: boolean, elapsedMs: number}>}
 */
async function sampleUntilSettled(read, options = {}) {
  const {
    intervalMs = 5000,
    maxMs = 120_000,
    // Never declare victory before this much time has passed: a browser that
    // has not started painting yet is trivially "flat" at its startup size.
    minMs = 20_000,
    window = 3,
    tolerance = 0.02,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now = () => Date.now(),
    onSample = () => {},
  } = options;

  const started = now();
  const series = [];
  let settled = false;

  for (;;) {
    const value = await read();
    series.push(value);
    onSample(value, series.length, now() - started);

    const elapsed = now() - started;
    if (elapsed >= minMs && isSettled(series, { window, tolerance })) {
      settled = true;
      return { series, settled, elapsedMs: elapsed };
    }
    if (elapsed >= maxMs) return { series, settled, elapsedMs: elapsed };
    await sleep(intervalMs);
  }
}

module.exports = { isSettled, sampleUntilSettled };
