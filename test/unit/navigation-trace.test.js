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

test('off unless BLANC_NAVIGATION_TRACE names an absolute path', () => {
  for (const env of [{}, { BLANC_NAVIGATION_TRACE: '' }, { BLANC_NAVIGATION_TRACE: 'relative/trace.jsonl' }]) {
    const trace = createNavigationTrace(env, { write: () => { throw new Error('a disabled trace wrote'); } });
    assert.equal(trace.enabled, false);
    trace.record('startup-gate-cancel', { url: 'https://example.test/' });
  }
});

test('records allowlisted fields with URLs reduced to host, never path, query or other data', () => {
  const lines = [];
  const trace = createNavigationTrace({ BLANC_NAVIGATION_TRACE: '/abs/trace.jsonl' }, { now: () => 42, write: line => lines.push(line) });
  trace.record('did-fail-load', { webContentsId: 7, url: 'https://user:secret@castlabs.github.io/wv-vmp-lab/?token=abc#x', code: -20,
    outcome: 'error-page', gate: 'inactive', queued: false, cookie: 'secret', headers: { a: 1 }, nested: { url: 'https://x/' } });
  const entry = JSON.parse(lines[0]);
  assert.deepEqual(entry, { t: 42, event: 'did-fail-load', host: 'castlabs.github.io', webContentsId: 7, code: -20, outcome: 'error-page', gate: 'inactive', queued: false });
  assert.doesNotMatch(lines[0], /secret|token|wv-vmp-lab|cookie|headers/);
  assert.equal(traceHost('blanc://error/?url=https%3A%2F%2Fx'), 'blanc:');
  assert.equal(traceHost('not a url'), null);
});

test('creates its file owner-only, never overwrites an existing file, and swallows failures', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nav-trace-'));
  try {
    const file = path.join(dir, 'trace.jsonl');
    const trace = createNavigationTrace({ BLANC_NAVIGATION_TRACE: file });
    trace.record('startup-gate-release', { count: 1 });
    assert.match(fs.readFileSync(file, 'utf8'), /"event":"startup-gate-release","count":1/);
    if (process.platform !== 'win32') assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    const existing = path.join(dir, 'existing.jsonl');
    fs.writeFileSync(existing, 'keep');
    const refused = createNavigationTrace({ BLANC_NAVIGATION_TRACE: existing });
    assert.doesNotThrow(() => refused.record('startup-gate-release', { count: 2 }));
    assert.equal(fs.readFileSync(existing, 'utf8'), 'keep');
    const broken = createNavigationTrace({ BLANC_NAVIGATION_TRACE: '/abs/x' }, { write: () => { throw new Error('disk full'); } });
    assert.doesNotThrow(() => broken.record('startup-gate-cancel', {}));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('bounded per process', () => {
  let written = 0;
  const trace = createNavigationTrace({ BLANC_NAVIGATION_TRACE: '/abs/x' }, { write: () => { written += 1; } });
  for (let i = 0; i < MAX_EVENTS + 50; i += 1) trace.record('did-fail-load', { code: -3 });
  assert.equal(written, MAX_EVENTS);
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
