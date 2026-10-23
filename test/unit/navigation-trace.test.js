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
  const trace = createNavigationTrace(ON, { now: () => 42, write: line => lines.push(JSON.parse(line)) });
  trace.record('did-fail-load', { webContentsId: 7, requestId: 91, navEpoch: 3, url: 'https://user:secret@castlabs.github.io/wv-vmp-lab/?token=abc#x', code: -20,
    outcome: 'error-page', gate: 'inactive', queued: false, cookie: 'secret', headers: { a: 1 } });
  trace.record('did-fail-load', { url: 'https://unrelated.example/', code: -20 });
  trace.record('did-fail-load', { url: 'https://castlabs.github.io/', private: true, code: -20 });
  trace.record('startup-gate-release', { count: 1, outcome: 'blocker-attached' });
  assert.deepEqual(lines.map(entry => entry.event), ['trace-start', 'did-fail-load', 'startup-gate-release']);
  assert.deepEqual(lines[0], { t: 42, event: 'trace-start', maxEvents: MAX_EVENTS, hosts: ['castlabs.github.io'] });
  assert.deepEqual(lines[1], { t: 42, event: 'did-fail-load', host: 'castlabs.github.io', webContentsId: 7, requestId: 91, navEpoch: 3, code: -20,
    outcome: 'error-page', gate: 'inactive', queued: false });
  assert.doesNotMatch(JSON.stringify(lines), /secret|token|wv-vmp-lab|cookie|headers|unrelated/);
  assert.equal(traceHost('blanc://error/?url=https%3A%2F%2Fx'), 'blanc:');
  assert.equal(traceHost('not a url'), null);
});

test('creates its file owner-only, never overwrites an existing file, and swallows failures', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nav-trace-'));
  try {
    const file = path.join(dir, 'trace.jsonl');
    const trace = createNavigationTrace({ ...ON, BLANC_NAVIGATION_TRACE: file });
    trace.record('startup-gate-release', { count: 1 });
    assert.match(fs.readFileSync(file, 'utf8'), /"event":"trace-start"[\s\S]*"event":"startup-gate-release","count":1/);
    if (process.platform !== 'win32') assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    const existing = path.join(dir, 'existing.jsonl');
    fs.writeFileSync(existing, 'keep');
    const refused = createNavigationTrace({ ...ON, BLANC_NAVIGATION_TRACE: existing });
    assert.doesNotThrow(() => refused.record('startup-gate-release', { count: 2 }));
    assert.equal(fs.readFileSync(existing, 'utf8'), 'keep');
    const broken = createNavigationTrace(ON, { write: () => { throw new Error('disk full'); } });
    assert.doesNotThrow(() => broken.record('startup-gate-cancel', {}));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('bounded per process, ending with an explicit truncation marker', () => {
  const lines = [];
  const trace = createNavigationTrace(ON, { write: line => lines.push(JSON.parse(line)) });
  for (let i = 0; i < MAX_EVENTS + 50; i += 1) trace.record('did-fail-load', { code: -3 });
  assert.equal(lines.length, MAX_EVENTS + 2);
  assert.equal(lines[0].event, 'trace-start');
  assert.deepEqual(lines.at(-1), { t: lines.at(-1).t, event: 'trace-truncated', count: MAX_EVENTS });
});

test('the tab load-failure handler keeps its three guards and returns; tracing only observes them', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../src/main/tab-view.js'), 'utf8');
  const handler = source.slice(source.indexOf("wc.on('did-fail-load'"), source.indexOf('const canContinue', source.indexOf("wc.on('did-fail-load'")));
  assert.match(handler, /if \(!shouldPresentTabLoadFailure\(wc, errorCode, validatedURL\)\) \{ traceFailure\('not-presented'\); return; \}/);
  assert.match(handler, /if \(isStartupGateActive\(tab\) && startupQueuedNavigations\.has\(wc\.id\) && \/\^https\?:\/i\.test\(validatedURL\)\) \{ traceFailure\('gate-suppressed'\); return; \}/);
  assert.match(handler, /traceFailure\('error-page'\);/);
  assert.match(handler, /deps\.navigationTrace\?\.record\('did-fail-load'/);
  // main passes the shared default-off trace.
  const main = fs.readFileSync(path.join(__dirname, '../../src/main/main.js'), 'utf8');
  assert.match(main, /startupQueuedNavigations,\n  navigationTrace,/);
  assert.match(main, /trace: navigationTrace,\n\}\);/);
});
