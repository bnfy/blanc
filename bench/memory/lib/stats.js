// Summary statistics for repeated benchmark runs.
//
// Median rather than mean throughout: a single run that happened to sample
// mid-garbage-collection, or while Spotlight decided to index something, should
// not move the headline number. The spread is always reported alongside it —
// a median with no visible spread invites more confidence than three runs can
// support.

/** @param {number[]} values @returns {number|null} */
function median(values) {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Median absolute deviation — a spread measure that, unlike standard
 * deviation, is not itself dragged around by the outlier it is meant to
 * describe.
 *
 * @param {number[]} values
 * @returns {number|null}
 */
function medianAbsoluteDeviation(values) {
  const mid = median(values);
  if (mid === null) return null;
  return median(values.filter((v) => Number.isFinite(v)).map((v) => Math.abs(v - mid)));
}

/**
 * @param {number[]} values
 * @returns {{n: number, median: number|null, mad: number|null, min: number|null, max: number|null, values: number[]}}
 */
function summarize(values) {
  const finite = (values || []).filter((v) => Number.isFinite(v));
  return {
    n: finite.length,
    median: median(finite),
    mad: medianAbsoluteDeviation(finite),
    min: finite.length ? Math.min(...finite) : null,
    max: finite.length ? Math.max(...finite) : null,
    values: finite,
  };
}

/**
 * Marginal cost of each loaded tab: (loaded total - idle baseline) / tabCount.
 *
 * This is the number worth quoting when comparing browsers, because it strips
 * out fixed startup cost — which differs mostly with how many services a
 * browser starts eagerly, not with how well it handles real pages.
 *
 * @param {number} loadedBytes
 * @param {number} baselineBytes
 * @param {number} tabCount
 * @returns {number|null}
 */
function perTabBytes(loadedBytes, baselineBytes, tabCount) {
  if (!Number.isFinite(loadedBytes) || !Number.isFinite(baselineBytes)) return null;
  if (!Number.isInteger(tabCount) || tabCount <= 0) return null;
  return (loadedBytes - baselineBytes) / tabCount;
}

/**
 * Guard against the single most misleading thing this harness could do:
 * printing a table whose rows were measured with different backends. A `ps`
 * RSS row sitting next to a `vmmap` phys_footprint row would show a difference
 * of hundreds of megabytes that is purely an artifact of the metric.
 *
 * @param {Array<{metric: string}>} results
 * @returns {string|null} the shared metric, or null when results are empty
 * @throws {Error} when results disagree
 */
function requireConsistentMetric(results) {
  const metrics = [...new Set((results || []).map((r) => r.metric).filter(Boolean))];
  if (metrics.length === 0) return null;
  if (metrics.length > 1) {
    throw new Error(
      `Refusing to compare results measured with different metrics: ${metrics.join(', ')}. ` +
        'Re-run the whole matrix with a single backend (--backend=<id>).'
    );
  }
  return metrics[0];
}

/** Bytes as a human-readable binary-suffixed string. */
function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '—';
  const negative = bytes < 0;
  let value = Math.abs(bytes);
  const units = ['B', 'KiB', 'MiB', 'GiB'];
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = value < 10 && unit > 0 ? 1 : 0;
  return `${negative ? '-' : ''}${value.toFixed(digits)} ${units[unit]}`;
}

module.exports = {
  median,
  medianAbsoluteDeviation,
  summarize,
  perTabBytes,
  requireConsistentMetric,
  formatBytes,
};
