'use strict';
// The navigation trace is default-off, records only allowlisted fields with
// URLs reduced to scheme or host, never overwrites a file, is bounded, and
// never throws into navigation code.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createNavigationTrace, traceHost, MAX_EVENTS } = require('../../src/main/navigation-trace');
const { readNavigationTrace } = require('../desktop/support/navigation-trace-reader.cjs');
const noExit = () => {};

const ON = { BLANC_NAVIGATION_TRACE: '/abs/trace.jsonl', BLANC_NAVIGATION_TRACE_HOSTS: 'castlabs.github.io' };

test('off unless an absolute file path AND a fixture host list are both set', () => {
  for (const env of [{}, { BLANC_NAVIGATION_TRACE: '' }, { BLANC_NAVIGATION_TRACE: 'relative/trace.jsonl', BLANC_NAVIGATION_TRACE_HOSTS: 'x.test' },
    { BLANC_NAVIGATION_TRACE: '/abs/trace.jsonl' }, { BLANC_NAVIGATION_TRACE: '/abs/trace.jsonl', BLANC_NAVIGATION_TRACE_HOSTS: ' , ' },
    { BLANC_NAVIGATION_TRACE_HOSTS: 'castlabs.github.io' }]) {
    const trace = createNavigationTrace(env, { write: () => { throw new Error('a disabled trace wrote'); } });
    assert.equal(trace.enabled, false);
    trace.record('startup-gate-cancel', { url: 'https://castlabs.github.io/' });
  }
});

test('records only fixture hosts and never private tabs, with allowlisted fields and host-only URLs', () => {
  const lines = [];
  const trace = createNavigationTrace(ON, { now: () => 42, write: line => lines.push(JSON.parse(line)), onExit: noExit });
  trace.record('did-fail-load', { webContentsId: 7, requestId: 91, navEpoch: 3, url: 'https://user:secret@castlabs.github.io/wv-vmp-lab/?token=abc#x', code: -20,
    outcome: 'error-page', gate: 'inactive', queued: false, cookie: 'secret', headers: { a: 1 } });
  trace.record('did-fail-load', { url: 'https://unrelated.example/', code: -20 });
  trace.record('did-fail-load', { url: 'https://castlabs.github.io/', private: true, code: -20 });
  trace.record('startup-gate-release', { count: 1, outcome: 'blocker-attached' });
  assert.deepEqual(lines.map(entry => entry.event), ['trace-start', 'did-fail-load', 'startup-gate-release']);
  assert.deepEqual(lines[0], { seq: 0, t: 42, event: 'trace-start', maxEvents: MAX_EVENTS, hosts: ['castlabs.github.io'] });
  assert.deepEqual(lines[1], { seq: 1, t: 42, event: 'did-fail-load', host: 'castlabs.github.io', webContentsId: 7, requestId: 91, navEpoch: 3, code: -20,
    outcome: 'error-page', gate: 'inactive', queued: false });
  assert.doesNotMatch(JSON.stringify(lines), /secret|token|wv-vmp-lab|cookie|headers|unrelated/);
  assert.equal(traceHost('blanc://error/?url=https%3A%2F%2Fx'), 'blanc:');
  assert.equal(traceHost('not a url'), null);
});

test('creates its file owner-only, never overwrites an existing file, and swallows failures', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nav-trace-'));
  try {
    const file = path.join(dir, 'trace.jsonl');
    const trace = createNavigationTrace({ ...ON, BLANC_NAVIGATION_TRACE: file }, { onExit: noExit });
    trace.record('startup-gate-release', { count: 1 });
    assert.match(fs.readFileSync(file, 'utf8'), /"event":"trace-start"[\s\S]*"event":"startup-gate-release","count":1/);
    if (process.platform !== 'win32') assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    const existing = path.join(dir, 'existing.jsonl');
    fs.writeFileSync(existing, 'keep');
    const refused = createNavigationTrace({ ...ON, BLANC_NAVIGATION_TRACE: existing }, { onExit: noExit });
    assert.doesNotThrow(() => refused.record('startup-gate-release', { count: 2 }));
    assert.equal(fs.readFileSync(existing, 'utf8'), 'keep');
    const broken = createNavigationTrace(ON, { write: () => { throw new Error('disk full'); }, onExit: noExit });
    assert.doesNotThrow(() => broken.record('startup-gate-cancel', {}));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('bounded per process, ending with an explicit truncation marker', () => {
  const lines = [];
  const trace = createNavigationTrace(ON, { write: line => lines.push(JSON.parse(line)), onExit: noExit });
  for (let i = 0; i < MAX_EVENTS + 50; i += 1) trace.record('did-fail-load', { code: -3 });
  assert.equal(lines.length, MAX_EVENTS + 2);
  assert.equal(lines[0].event, 'trace-start');
  assert.deepEqual(lines.at(-1), { seq: MAX_EVENTS + 1, t: lines.at(-1).t, event: 'trace-truncated', count: MAX_EVENTS });
});

// A trace exactly as the app writes it, ending at normal exit.
function traceText({ events = 2, failAfter = Infinity } = {}) {
  let exit; const lines = []; let writes = 0;
  const trace = createNavigationTrace(ON, { write: line => { if (writes++ >= failAfter) throw new Error('disk full'); lines.push(line); }, onExit: handler => { exit = handler; } });
  for (let i = 0; i < events; i += 1) trace.record('did-fail-load', { url: 'https://castlabs.github.io/', code: -20 });
  exit?.();
  return lines.join('');
}

test('only a fully written trace with matching end-marker counts reads as complete', () => {
  const ok = readNavigationTrace(traceText());
  assert.equal(ok.complete, true); assert.equal(ok.totalEvents, 2); assert.equal(ok.countsReconcile, true);
  assert.deepEqual(readNavigationTrace(null), { active: false, complete: false });
});

test('a start marker followed by failing writes never reads as complete', () => {
  // Start succeeds, every later write (events and the end marker) fails.
  const allLost = readNavigationTrace(traceText({ failAfter: 1 }));
  assert.equal(allLost.active, true); assert.equal(allLost.ended, false); assert.equal(allLost.complete, false);
  // Start and first event succeed, the second event fails, the end marker succeeds.
  let exit; const lines = []; let writes = 0;
  const trace = createNavigationTrace(ON, { write: line => { writes += 1; if (writes === 3) throw new Error('disk full'); lines.push(line); }, onExit: handler => { exit = handler; } });
  trace.record('did-fail-load', { url: 'https://castlabs.github.io/', code: -20 });
  trace.record('did-fail-load', { url: 'https://castlabs.github.io/', code: -20 });
  exit();
  const partial = readNavigationTrace(lines.join(''));
  assert.equal(partial.ended, true); assert.equal(partial.writesFailed, true); assert.equal(partial.sequenceUnbroken, false); assert.equal(partial.complete, false);
});

test('missing end, broken sequence, malformed lines, count mismatch, cap and retained cuts are each incomplete', () => {
  const full = traceText({ events: 3 }).split('\n').filter(Boolean);
  const read = list => readNavigationTrace(list.join('\n'));
  assert.equal(read(full).complete, true);
  assert.equal(read(full.slice(0, -1)).complete, false, 'no end marker (crash)');
  assert.equal(read([full[0], ...full.slice(2)]).complete, false, 'a missing line');
  assert.equal(read([...full.slice(0, 2), '{not json', ...full.slice(2)]).complete, false, 'malformed line');
  const end = JSON.parse(full.at(-1)); end.written = 9;
  assert.equal(read([...full.slice(0, -1), JSON.stringify(end)]).complete, false, 'counts do not reconcile');
  assert.equal(readNavigationTrace(full.join('\n'), { retained: 1 }).complete, false, 'retained events cut');
  const capped = (() => { let exit; const lines = []; const trace = createNavigationTrace(ON, { write: l => lines.push(l), onExit: h => { exit = h; } });
    for (let i = 0; i <= MAX_EVENTS; i += 1) trace.record('did-fail-load', { code: -3 }); exit(); return readNavigationTrace(lines.join(''), { retained: MAX_EVENTS + 10 }); })();
  assert.equal(capped.capReached, true); assert.equal(capped.complete, false);
});

test('the tab load-failure handler keeps its guards and returns; tracing only observes them', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../src/main/tab-view.js'), 'utf8');
  const handler = source.slice(source.indexOf("wc.on('did-fail-load'"), source.indexOf('const canContinue', source.indexOf("wc.on('did-fail-load'")));
  assert.match(handler, /if \(!shouldPresentTabLoadFailure\(wc, errorCode, validatedURL\)\) \{ traceFailure\('not-presented'\); return; \}/);
  assert.match(handler, /if \(isStartupGateActive\(tab\) && startupQueuedNavigations\.has\(wc\.id\) && \/\^https\?:\/i\.test\(validatedURL\)\) \{\n\s+deps\.gateRefusals\?\.settle\(wc\.id, validatedURL\);\n\s+traceFailure\('gate-suppressed'\);\n\s+return;\n\s+\}/);
  assert.match(handler, /traceFailure\('error-page'\);/);
  assert.match(handler, /deps\.navigationTrace\?\.record\('did-fail-load'/);
  // main passes the shared default-off trace.
  const main = fs.readFileSync(path.join(__dirname, '../../src/main/main.js'), 'utf8');
  assert.match(main, /startupQueuedNavigations,\n  navigationTrace,/);
  assert.match(main, /trace: navigationTrace,\n  onRefused: \(webContentsId, url\) => gateRefusals\.noteRefused\(webContentsId, url\),\n\}\);/);
});
