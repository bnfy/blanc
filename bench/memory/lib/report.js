// Turning raw samples into a report someone can argue with.
//
// The design rule here is that every number a reader could misquote carries the
// context that makes it honest: which metric produced it, how many tabs it
// covers, how far the repetitions spread, and whether the browser had actually
// stopped moving when it was measured. A table of bare megabyte figures is
// exactly the artifact this benchmark exists to avoid producing.
//
// The subtlest trap is comparative framing rather than measurement. On an
// ad-dense workload most of the gap between a blocking and a non-blocking
// browser is a difference in how much content was instantiated, not a
// difference in engine efficiency — but an ascending single-column ranking
// reads as an efficiency league table. So rows are grouped by what they block,
// percentages are computed against a declared reference rather than against
// whichever row happened to render the least, and a table spanning more than
// one blocking class carries a mandatory caveat.

const { summarize, perTabBytes, requireConsistentMetric, formatBytes } = require('./stats');

// Ordered loosely by how much content each class prevents from loading.
const BLOCKING_CLASSES = [
  { id: 'none', label: 'No blocking' },
  { id: 'trackers', label: 'Blocks trackers only' },
  { id: 'ads+trackers', label: 'Blocks ads and trackers' },
  { id: 'unknown', label: 'Blocking not classified' },
];

// The anchor for the percentage column. Chrome is the market default, so "+N%
// vs Chrome" is a claim a reader can situate. Anchoring to the best row instead
// would mean a vendor benchmark whose reference point is its own product's best
// configuration — the exact shape reviewers are trained to distrust.
const PREFERRED_REFERENCE = ['chrome', 'firefox'];

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

  // Divide by the workload's page count, not the browser's tab count. Blanc
  // opens one extra blank tab of its own, and charging the workload's cost
  // across N+1 tabs while every other browser divides by N understates Blanc's
  // per-page cost by roughly 1/(N+1) — a bias in our own favour, in the column
  // most likely to be quoted.
  const pages = Number.isFinite(result.workloadPages) && result.workloadPages > 0
    ? result.workloadPages
    : result.tabCount;

  return {
    browserId: result.browserId,
    label: result.label,
    engine: result.engine,
    version: result.version || null,
    blocking: result.blocking,
    blockingClass: result.blockingClass || 'unknown',
    notes: result.notes || [],
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
        : perTabBytes(stats.median, baselineMedian, pages),
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

/** The row every percentage is measured against. */
function referenceRow(rows) {
  for (const id of PREFERRED_REFERENCE) {
    const found = rows.find((r) => r.browserId === id && Number.isFinite(r.medianBytes));
    if (found) return found;
  }
  return rankRows(rows).find((r) => Number.isFinite(r.medianBytes)) || null;
}

/** Percentage difference of each row against the reference row. */
function withRelative(rows, reference) {
  const anchor = reference || referenceRow(rows);
  return rankRows(rows).map((row) => ({
    ...row,
    relativeToReference:
      anchor && Number.isFinite(row.medianBytes) && anchor.medianBytes > 0
        ? row.medianBytes / anchor.medianBytes - 1
        : null,
  }));
}

/** Group rows by blocking class, in BLOCKING_CLASSES order, dropping empties. */
function groupByBlockingClass(rows) {
  return BLOCKING_CLASSES
    .map((cls) => ({ ...cls, rows: rows.filter((r) => (r.blockingClass || 'unknown') === cls.id) }))
    .filter((group) => group.rows.length);
}

const pct = (v) => {
  if (v === null) return '—';
  if (Math.abs(v) < 0.005) return 'reference';
  return `${v > 0 ? '+' : ''}${(v * 100).toFixed(0)}%`;
};

function tableFor(rows, reference) {
  const lines = [
    '| Browser | Version | Engine | Tabs | Median | vs ref | Range | Per page | Procs | Reps |',
    '| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ];
  for (const row of withRelative(rows, reference)) {
    const range =
      Number.isFinite(row.minBytes) && Number.isFinite(row.maxBytes)
        ? `${formatBytes(row.minBytes)} – ${formatBytes(row.maxBytes)}`
        : '—';
    const flags = row.unsettledRuns ? ` ⚠️${row.unsettledRuns}` : '';
    lines.push(
      `| ${row.label}${flags} | ${row.version || '?'} | ${row.engine || '—'} | ${row.tabCount} | ` +
        `${formatBytes(row.medianBytes)} | ${pct(row.relativeToReference)} | ${range} | ` +
        `${formatBytes(row.perTabBytes)} | ${row.processCount ?? '—'} | ${row.repetitions} |`
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
  out.push(`Metric: \`${metric}\` via \`${meta.backend}\` · up to ${meta.repetitions} repetitions per cell` +
    (meta.warmedProfiles ? ' · profiles warmed before measuring' : ' · cold profiles'));
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
    out.push(`${first.workloadPages} pages per browser. ${first.workloadDescription || ''}`.trim());
    out.push('');

    const rows = workloadResults.map((r) => buildRow(r, baselineByBrowser.get(r.browserId) || null));
    const reference = referenceRow(rows);
    const groups = groupByBlockingClass(rows);

    if (groups.length > 1) {
      out.push('> **Rows are grouped by what each browser blocks, and that grouping is');
      out.push('> load-bearing.** A browser that blocks ads renders less content, so a');
      out.push('> lower number across groups is mostly a product difference, not an');
      out.push('> engine-efficiency result. Compare within a group; across groups, read');
      out.push('> it as "what this browser costs a user as configured", nothing more.');
      out.push('');
    }
    if (reference) {
      out.push(`*Percentages are relative to **${reference.label}**, not to the lowest row.*`);
      out.push('');
    }

    for (const group of groups) {
      if (groups.length > 1) {
        out.push(`### ${group.label}`);
        out.push('');
      }
      out.push(tableFor(group.rows, reference));
      out.push('');
    }

    const withExtra = rows.filter((r) => r.extraBlankTabs > 0);
    if (withExtra.length) {
      out.push(
        '*Tab counts include a browser-opened blank tab for: ' +
          withExtra.map((r) => `${r.label} (+${r.extraBlankTabs})`).join(', ') +
          '. The per-page column divides by workload pages, not by this count.*'
      );
      out.push('');
    }
  }

  if (byWorkload.has('baseline')) {
    out.push('## Idle baseline (no pages loaded)');
    out.push('');
    out.push('Startup cost alone. Subtracted from the loaded runs to produce the per-page column above, and used to verify that a loaded cell actually loaded something.');
    out.push('');
    const rows = (byWorkload.get('baseline') || []).map((r) => buildRow(r, null));
    out.push(tableFor(rows, referenceRow(rows)));
    out.push('');
  }

  // Registry notes are stored as wrapped source lines, so each browser's note
  // set is joined back into one paragraph. Emitting a bullet per line repeats
  // the browser name a dozen times and makes the caveats unreadable, which
  // defeats the point of surfacing them at all.
  const caveats = new Map();
  for (const r of results) {
    const note = (r.notes || []).filter(Boolean).join(' ').trim();
    if (note && !caveats.has(r.label)) caveats.set(r.label, note);
  }
  if (caveats.size) {
    out.push('## Per-browser caveats');
    out.push('');
    for (const [label, note] of caveats) out.push(`- **${label}:** ${note}`);
    out.push('');
  }

  if (meta.failures && meta.failures.length) {
    out.push('## Failed cells');
    out.push('');
    out.push('These did not produce a measurement. A browser that failed load verification is **not** a browser that uses little memory — it is a browser the harness could not confirm did the work.');
    out.push('');
    out.push('| Browser | Workload | Rep | Reason |');
    out.push('| --- | --- | ---: | --- |');
    for (const f of meta.failures) {
      out.push(`| ${f.label} | ${f.workload} | ${f.rep} | ${f.reason} |`);
    }
    out.push('');
  }

  out.push('## How to read this');
  out.push('');
  out.push('- **Median** of the repetitions, not the mean — one run sampled mid-GC should not set the headline.');
  out.push('- **vs ref** compares against the reference browser named above, not against the best row.');
  out.push('- **Range** is min–max across repetitions. A range that overlaps another browser\'s means the two are not distinguishable at this sample size.');
  out.push('- **Per page** is `(loaded median − idle median) / workload pages`: the marginal cost of a page, with fixed startup cost removed.');
  out.push('- **Procs** is the lowest process count observed across the samples the median was taken from. Chromium and Firefox both isolate content by site, but their process models differ in ways this benchmark does not measure — do not read a process-count difference as an explanation for a memory difference. See Mozilla\'s [process model docs](https://firefox-source-docs.mozilla.org/dom/ipc/process_model.html) for how Fission allocates content processes.');
  out.push('- **Reps** is how many repetitions actually produced a measurement. A row backed by 1 of 3 has a Range that looks precise and is not.');
  out.push('- **⚠️N** marks rows where N repetitions were still drifting when the sampling window expired.');
  out.push('- Browsers whose own UI is a web page (Blanc, Vivaldi) carry additional always-live renderers for the chrome itself, which are inside both their totals and their baselines.');
  out.push('');
  out.push('## Limits of this benchmark');
  out.push('');
  out.push('- Live sites change between runs. Results are only comparable **within a single session**, which is why the runner interleaves browsers rather than finishing one before starting the next.');
  out.push('- Every browser runs a **fresh profile**, with no extensions **except any the browser ships itself** — LibreWolf bundles uBlock Origin, and that memory is inside its total. That is the fair engine comparison, but it is not what most people run day to day.');
  out.push('- Memory is one axis. It says nothing about responsiveness, energy, or page-load time.');
  if (meta.skipped && meta.skipped.length) {
    out.push('');
    out.push('Not measured: ' + meta.skipped.map((s) => `${s.id} (${s.reason})`).join(', ') + '.');
  }
  out.push('');
  return out.join('\n');
}

module.exports = {
  BLOCKING_CLASSES,
  buildRow,
  rankRows,
  referenceRow,
  withRelative,
  groupByBlockingClass,
  tableFor,
  buildMarkdown,
};
