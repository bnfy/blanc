// Turning raw samples into a report someone can argue with.
//
// The design rule here is that every number a reader could misquote carries the
// context that makes it honest: which metric produced it, how many tabs it
// covers, how far the repetitions spread, and whether the browser had actually
// stopped moving when it was measured. A table of bare megabyte figures is
// exactly the artifact this benchmark exists to avoid producing.

const { summarize, perTabBytes, requireConsistentMetric, formatBytes } = require('./stats');

/**
 * Collapse a result's repetitions into a summary row.
 *
 * @param {object} result
 * @param {object|null} baseline same browser's idle result, if measured
 * @returns {object}
 */
function buildRow(result, baseline) {
  const totals = result.repetitions.map((r) => r.totalBytes);
  const stats = summarize(totals);
  const processCounts = summarize(result.repetitions.map((r) => r.processCount));
  const baselineMedian = baseline ? summarize(baseline.repetitions.map((r) => r.totalBytes)).median : null;

  return {
    browserId: result.browserId,
    label: result.label,
    engine: result.engine,
    blocking: result.blocking,
    tabCount: result.tabCount,
    extraBlankTabs: result.extraBlankTabs || 0,
    medianBytes: stats.median,
    minBytes: stats.min,
    maxBytes: stats.max,
    madBytes: stats.mad,
    repetitions: stats.n,
    processCount: processCounts.median,
    perTabBytes:
      baselineMedian === null || stats.median === null
        ? null
        : perTabBytes(stats.median, baselineMedian, result.tabCount),
    unsettledRuns: result.repetitions.filter((r) => !r.settled).length,
  };
}

/**
 * Rank rows by median, ascending, with unmeasured rows last.
 * Ties keep their input order so a rerun does not reshuffle the table.
 */
function rankRows(rows) {
  return [...rows].sort((a, b) => {
    if (a.medianBytes === null) return 1;
    if (b.medianBytes === null) return -1;
    return a.medianBytes - b.medianBytes;
  });
}

/** Percentage difference of each row against the lowest row in the table. */
function withRelative(rows) {
  const ranked = rankRows(rows);
  const best = ranked.find((r) => Number.isFinite(r.medianBytes));
  return ranked.map((row) => ({
    ...row,
    relativeToBest:
      best && Number.isFinite(row.medianBytes) && best.medianBytes > 0
        ? row.medianBytes / best.medianBytes - 1
        : null,
  }));
}

const pct = (v) => (v === null ? '—' : v === 0 ? 'baseline' : `+${(v * 100).toFixed(0)}%`);

function workloadTable(rows) {
  const lines = [
    '| Browser | Engine | Median | Range | Per tab | Procs | Blocking |',
    '| --- | --- | ---: | ---: | ---: | ---: | --- |',
  ];
  for (const row of withRelative(rows)) {
    const range =
      Number.isFinite(row.minBytes) && Number.isFinite(row.maxBytes)
        ? `${formatBytes(row.minBytes)} – ${formatBytes(row.maxBytes)}`
        : '—';
    const flag = row.unsettledRuns ? ` ⚠️${row.unsettledRuns}` : '';
    lines.push(
      `| ${row.label}${flag} | ${row.engine || '—'} | ${formatBytes(row.medianBytes)} ` +
        `(${pct(row.relativeToBest)}) | ${range} | ${formatBytes(row.perTabBytes)} | ` +
        `${row.processCount ?? '—'} | ${row.blocking || '—'} |`
    );
  }
  return lines.join('\n');
}

/**
 * @param {{meta: object, results: object[]}} report
 * @returns {string} markdown
 */
function buildMarkdown(report) {
  const { meta, results } = report;
  const metric = requireConsistentMetric(results);

  const byWorkload = new Map();
  for (const result of results) {
    if (!byWorkload.has(result.workload)) byWorkload.set(result.workload, []);
    byWorkload.get(result.workload).push(result);
  }
  const baselineByBrowser = new Map(
    (byWorkload.get('baseline') || []).map((r) => [r.browserId, r])
  );

  const out = [];
  out.push('# Browser memory benchmark');
  out.push('');
  out.push(`Run: ${meta.startedAt} · macOS ${meta.osVersion} · ${meta.arch} · ${meta.totalRamGiB} GiB RAM`);
  out.push(`Metric: \`${metric}\` via \`${meta.backend}\` · ${meta.repetitions} repetitions per cell`);
  out.push('');

  if (metric === 'rss') {
    out.push('> **⚠️ These numbers are RSS, not phys_footprint.** RSS counts each');
    out.push('> process\'s resident pages including the framework binary shared across');
    out.push('> every renderer, so totals are inflated and inflated *unevenly* between');
    out.push('> engines with different process counts. Treat this run as indicative');
    out.push('> only, and re-run with a phys_footprint backend before quoting it.');
    out.push('');
  }

  for (const [workload, workloadResults] of byWorkload) {
    if (workload === 'baseline') continue;
    const first = workloadResults[0];
    out.push(`## ${first.workloadLabel || workload}`);
    out.push('');
    out.push(`${first.tabCount} tabs per browser. ${first.workloadDescription || ''}`.trim());
    out.push('');
    out.push(
      workloadTable(
        workloadResults.map((r) => buildRow(r, baselineByBrowser.get(r.browserId) || null))
      )
    );
    out.push('');
    const withExtra = workloadResults.filter((r) => (r.extraBlankTabs || 0) > 0);
    if (withExtra.length) {
      out.push(
        '*Tab counts include a browser-opened blank tab for: ' +
          withExtra.map((r) => `${r.label} (+${r.extraBlankTabs})`).join(', ') +
          '.*'
      );
      out.push('');
    }
  }

  if (byWorkload.has('baseline')) {
    out.push('## Idle baseline (no pages loaded)');
    out.push('');
    out.push('Startup cost alone. Subtracted from the loaded runs to produce the per-tab column above.');
    out.push('');
    out.push(workloadTable((byWorkload.get('baseline') || []).map((r) => buildRow(r, null))));
    out.push('');
  }

  out.push('## How to read this');
  out.push('');
  out.push('- **Median** of the repetitions, not the mean — one run sampled mid-GC should not set the headline.');
  out.push('- **Range** is min–max across repetitions. A range that overlaps another browser\'s means the two are not distinguishable at this sample size.');
  out.push('- **Per tab** is `(loaded median − idle median) / tabs`: the marginal cost of a page, with fixed startup cost removed.');
  out.push('- **Procs** is the median number of processes in the browser\'s process tree. Chromium isolates per site; Gecko caps its content-process pool. That single difference explains most of any gap.');
  out.push('- **⚠️N** marks rows where N repetitions were still drifting when the sampling window expired (video and infinite-scroll pages often never settle).');
  out.push('');
  out.push('## Limits of this benchmark');
  out.push('');
  out.push('- Live sites change between runs. Results are only comparable **within a single session**, which is why the runner interleaves browsers rather than finishing one before starting the next.');
  out.push('- Every browser runs a **fresh profile with no extensions**. That is the fair engine comparison, but it is not what most people run day to day.');
  out.push('- Memory is one axis. It says nothing about responsiveness, energy, or page-load time.');
  if (meta.skipped && meta.skipped.length) {
    out.push('');
    out.push('Not measured: ' + meta.skipped.map((s) => `${s.id} (${s.reason})`).join(', ') + '.');
  }
  out.push('');
  return out.join('\n');
}

module.exports = { buildRow, rankRows, withRelative, workloadTable, buildMarkdown };
