'use strict';

// The /compare chart (site/src/pages/compare.astro) renders from
// site/src/data/compare.json. These checks keep the owner-approved shape
// (docs/superpowers/specs/2026-11-02-compare-page-design.md): eleven rows by
// five browsers, every other-product cell resting on a recorded first-party
// source or saying plainly that the sources don't state it, a re-check for
// each Blanc feature release, and Arc's column leaving after Arc ends.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
const data = read('site/src/data/compare.json');
const releases = read('site/src/data/releases.json');
const load = () => import(pathToFileURL(path.join(ROOT, 'site/src/lib/compare.mjs')).href);
const cells = (column) => data.rows.map((row) => row.cells[column]);

test('the chart has the approved 11 rows and 5 columns in order', () => {
  assert.deepEqual(data.rows.map((row) => row.id),
    ['platforms', 'cost', 'open-source', 'status', 'blocking', 'extensions', 'ai', 'spaces', 'side-tabs', 'split', 'sync']);
  assert.deepEqual(data.columns.map((column) => column.id), ['blanc', 'crest', 'arc', 'helium', 'brave']);
  for (const row of data.rows) {
    assert.ok(row.label?.trim(), row.id);
    assert.deepEqual(Object.keys(row.cells), data.columns.map((column) => column.id), row.id);
    for (const cell of Object.values(row.cells)) assert.ok(cell.text?.trim(), row.id);
  }
});

test('the rows sit in four topic groups, each row once, in chart order', () => {
  assert.deepEqual(data.groups.map((group) => group.label), ['The basics', 'What’s built in', 'Organizing your tabs', 'Across your devices']);
  assert.deepEqual(data.groups.flatMap((group) => group.rows), data.rows.map((row) => row.id));
});

test('Blanc’s answer on AI reads as a choice', () => {
  assert.equal(data.rows.find((row) => row.id === 'ai').cells.blanc.text, 'None, by choice.');
});

test('every non-Blanc cell is sourced or reads Not stated', () => {
  const sources = new Map(data.sources.map((source) => [source.id, source]));
  for (const source of data.sources) {
    assert.match(source.url, /^https:\/\//, source.id);
    assert.ok(source.publisher?.trim(), source.id);
    assert.equal(source.accessedAt, data.checked, source.id);
  }
  for (const column of data.columns.filter((entry) => entry.id !== 'blanc')) {
    for (const cell of cells(column.id)) {
      if (cell.text === data.notStated) {
        assert.deepEqual(cell.sources, [], `${column.id}: ${cell.text}`);
        continue;
      }
      assert.ok(cell.sources.length, `${column.id}: unsourced "${cell.text}"`);
      for (const id of cell.sources) assert.equal(sources.get(id)?.column, column.id, `${column.id}: ${id}`);
    }
  }
});

test('seven cells record an absence', () => {
  const absent = data.rows.flatMap((row) => Object.values(row.cells)).filter((cell) => /not stated|no [a-z ]+ stated/i.test(cell.text));
  assert.equal(absent.length, 7);
});

test('the chart is re-checked for each Blanc feature release', async () => {
  const { releaseMinor } = await load();
  assert.equal(releaseMinor('v1.45.1'), '1.45');
  assert.equal(releaseMinor('v1.46.0'), '1.46');
  assert.equal(releaseMinor(releases[0].tag), releaseMinor(data.checkedAgainst),
    `a newer Blanc feature release (${releases[0].tag}) shipped: re-check /compare and bump checkedAgainst`);
});

test('Arc drops after its end date', async () => {
  const { visibleColumns, endedColumns } = await load();
  const ids = (columns) => columns.map((column) => column.id);
  assert.ok(ids(visibleColumns(data, new Date('2026-12-21T12:00:00Z'))).includes('arc'));
  assert.ok(ids(visibleColumns(data, new Date('2026-12-22T23:00:00Z'))).includes('arc'));
  assert.deepEqual(ids(visibleColumns(data, new Date('2026-12-23T00:00:00Z'))), ['blanc', 'crest', 'helium', 'brave']);
  assert.deepEqual(ids(endedColumns(data, new Date('2026-12-23T00:00:00Z'))), ['arc']);
  assert.deepEqual(endedColumns(data, new Date('2026-11-02T00:00:00Z')), []);
});

test('the page shows the same check date and Blanc version as the data', () => {
  const page = fs.readFileSync(path.join(ROOT, 'site/src/pages/compare.astro'), 'utf8');
  const day = new Date(`${data.checked}T00:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', day: 'numeric', year: 'numeric' });
  assert.ok(page.includes(`Checked ${day} against Blanc ${data.checkedAgainst}.`), `the Checked line must read ${day} and ${data.checkedAgainst}`);
  assert.ok(page.includes(`its ${data.checkedAgainst} release`) && page.includes(`read on ${day}.`), 'the Sources paragraph must name the same version and date');
});

test('no Blanc cell names an unreleased feature', () => {
  for (const cell of cells('blanc')) assert.doesNotMatch(cell.text, /Mini Window|Quick Window/);
});
