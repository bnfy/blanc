import test from 'node:test';
import assert from 'node:assert/strict';
import {latestCases, requirementRows, DIVERGENT_ROWS} from './rc-readiness.mjs';

const scenario = (line, rows, result, executed = true) => ({
  file: 'spec/acceptance/island-and-commands.feature', name: `case ${line}`, featureRows: rows,
  cases: [{id: `spec/acceptance/island-and-commands.feature:${line}:plain`, result, executed}],
});

test('a later run replaces only the cases it executed, newest last', () => {
  const baseline = {candidate: 'macos-a', at: '2026-11-01T00:00:00.000Z',
    scenarios: [scenario(1, ['F1'], 'fail'), scenario(2, ['F1'], 'pass'), scenario(3, ['F42'], 'fail')]};
  const runs = [
    {candidate: 'macos-c', at: '2026-11-02T02:00:00.000Z', scenarios: [scenario(1, ['F1'], 'pass'), scenario(2, ['F1'], 'undefined', false)]},
    {candidate: 'macos-b', at: '2026-11-02T01:00:00.000Z', scenarios: [scenario(1, ['F1'], 'fail'), scenario(2, ['F1'], 'fail')]},
  ];
  const cases = latestCases(baseline, runs);
  assert.deepEqual(cases.map(c => [c.case, c.result, c.candidate]), [
    ['island-and-commands.feature:1:plain', 'pass', 'macos-c'],
    ['island-and-commands.feature:2:plain', 'fail', 'macos-b'],
    ['island-and-commands.feature:3:plain', 'divergence', 'macos-a'],
  ]);
  assert.ok(DIVERGENT_ROWS.has('F42'));
  const [row] = requirementRows({rows: [{id: 'F1', requirement: 'Island', slice: 'S1',
    platformProgress: {macos: {stage: 'drafted'}}}]}, cases);
  assert.deepEqual([row.casesPass, row.casesTotal, row.macos, row.windows], [1, 2, 'drafted', 'not-started']);
});
