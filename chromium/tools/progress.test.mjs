import test from 'node:test';
import assert from 'node:assert/strict';
import { renderProgress } from './progress.mjs';
const tracker = () => ({ shippingCommit: 'shipping', scenarioIds: ['F1-1', 'F1-2', 'F1-3'], currentCandidates: { macos: { id: 'new' } }, baselines: {}, rows: [
  { id: 'F1', platformProgress: { macos: { stage: 'legacy-integrated-partial' }, windows: { stage: 'not-started' }, linux: { stage: 'not-started' } }, platformVerification: {} },
] });
test('unrun baselines are not reported as zero passing and platforms stay separate', () => {
  const text = renderProgress(tracker());
  assert.match(text, /\| macOS \| Not run \|/);
  assert.match(text, /\| Integrated, partial \(legacy\) \| 1 \| 0 \| 0 \|/);
  assert.match(text, /\| Not started \/ unassessed \| 0 \| 1 \| 1 \|/);
});
test('candidate changes invalidate previous baseline credit', () => {
  const t = tracker(); t.baselines.macos = 'old.json';
  const text = renderProgress(t, () => ({ candidate: 'old', platform: 'macos', shippingCommit: 'shipping', scenarios: [] }));
  assert.match(text, /previous baseline is stale/);
  assert.doesNotMatch(text, /0\/0 pass/);
});
test('only mapped current-candidate results contribute, with explicit exclusions', () => {
  const t = tracker(); t.baselines.macos = 'current.json';
  const text = renderProgress(t, () => ({ candidate: 'new', platform: 'macos', shippingCommit: 'shipping', scenarios: [
    { id: 'F1-1', featureRows: ['F1'], result: 'pass' },
    { id: 'F1-2', featureRows: ['F1'], result: 'fail' },
    { id: 'F1-3', featureRows: ['F1'], result: 'excluded', exclusionReason: 'mobile only' },
  ] }));
  assert.match(text, /1\/2 pass; 1 excluded/);
});
test('an unmapped pass is rejected', () => {
  const t = tracker(); t.baselines.macos = 'current.json';
  assert.throws(() => renderProgress(t, () => ({ candidate: 'new', platform: 'macos', shippingCommit: 'shipping', scenarios: [{ id: 'unknown', featureRows: [], result: 'pass' }] })), /Unmapped/);
});
test('verified feature state requires evidence', () => {
  const t = tracker(); t.rows[0].platformProgress.macos.stage = 'verified';
  assert.throws(() => renderProgress(t), /Missing verification/);
});

test('an incomplete baseline cannot shrink the denominator', () => {
  const t = tracker(); t.baselines.macos = 'current.json';
  assert.throws(() => renderProgress(t, () => ({ candidate: 'new', platform: 'macos', shippingCommit: 'shipping', scenarios: [{ id: 'F1-1', featureRows: ['F1'], result: 'pass' }] })), /full shipping scenario inventory/);
});
