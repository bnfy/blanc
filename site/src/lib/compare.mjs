// Column rules for the /compare chart (site/src/data/compare.json).
// A column with an end date (Arc) shows through that UTC day and leaves the
// chart on the first build after it; the page then says the product ended.

const utcDay = (date) => date.toISOString().slice(0, 10);

const hasEnded = (column, now) => Boolean(column.endsOn) && utcDay(now) > column.endsOn;

export const visibleColumns = (data, now) => data.columns.filter((column) => !hasEnded(column, now));

export const endedColumns = (data, now) => data.columns.filter((column) => hasEnded(column, now));

// "v1.45.1" → "1.45": the chart is re-checked for each feature release, not
// for each bug fix.
export const releaseMinor = (tag) => tag.replace(/^v/, '').split('.').slice(0, 2).join('.');
