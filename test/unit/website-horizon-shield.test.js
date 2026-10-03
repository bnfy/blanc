const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { runInNewContext } = require('node:vm');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const motionSource = read('site/src/scripts/horizon-shield.js');

function preview({ reduced = false, present = true } = {}) {
  const styles = new Map();
  const events = new Map();
  const callbacks = new Map();
  let sequence = 0;
  let observer;
  let change;
  const bounds = { top: 800, height: 400 };
  const preference = { matches: reduced, addEventListener: (_, fn) => { change = fn; } };
  const study = {
    getBoundingClientRect: () => bounds,
    style: { setProperty: (name, value) => styles.set(name, value), removeProperty: name => styles.delete(name) },
  };
  runInNewContext(motionSource, {
    document: { querySelector: () => present ? study : null },
    window: { innerHeight: 1000, matchMedia: () => preference, addEventListener: (name, fn) => events.set(name, fn) },
    requestAnimationFrame: fn => { callbacks.set(++sequence, fn); return sequence; },
    IntersectionObserver: class { constructor(fn) { observer = fn; } observe() {} },
  });
  return {
    styles, events, callbacks, bounds,
    enter: visible => observer([{ isIntersecting: visible }]),
    flush() { const pending = [...callbacks.values()]; callbacks.clear(); pending.forEach(fn => fn()); },
    reduce(value) { preference.matches = value; change(); },
    angle: () => parseFloat(styles.get('--shield-turn') || '0'),
  };
}

test('the shield completes exactly one scroll-driven turn, reverses and clamps at both endpoints', () => {
  const p = preview();
  assert.equal(p.angle(), 0);
  p.enter(true);
  p.bounds.top = 300;
  p.events.get('scroll')();
  p.events.get('scroll')();
  assert.equal(p.callbacks.size, 1, 'scroll bursts share a single animation frame');
  p.flush();
  assert.equal(p.angle(), 180);
  p.bounds.top = -500;
  p.events.get('scroll')(); p.flush();
  assert.equal(p.angle(), 360);
  p.bounds.top = 300;
  p.events.get('scroll')(); p.flush();
  assert.equal(p.angle(), 180, 'upward scrolling reverses the same turn');
  p.bounds.top = 1500;
  p.enter(false);
  assert.equal(p.angle(), 0);
  p.events.get('scroll')();
  assert.equal(p.callbacks.size, 0, 'offscreen artwork does not schedule scroll work');
});

test('reduced motion remains static on load and when changed during a queued turn', () => {
  const p = preview({ reduced: true });
  p.enter(true); p.events.get('scroll')();
  assert.equal(p.callbacks.size, 0);
  assert.equal(p.angle(), 0);
  p.bounds.top = 300;
  p.reduce(false);
  assert.equal(p.angle(), 180);
  p.events.get('scroll')();
  p.reduce(true); p.flush();
  assert.equal(p.angle(), 0);
  assert.equal(p.styles.has('--shield-shadow'), false);
  assert.equal(preview({ present: false }).events.size, 0);
});

test('provider launch copy remains release-gated with pinned candidate evidence and approved artwork', () => {
  const ledger = JSON.parse(read('docs/website-blocking-launch.json'));
  const home = read(ledger.source).replace(/<br\s*\/?>/g, ' ').replace(/\s+/g, ' ');
  assert.equal(ledger.status, 'release-gated-draft');
  assert.match(ledger.publicationBoundary, /BLOCKED until the new app release ships/);
  assert.match(ledger.publicationBoundary, /immutable public tag/);
  assert.equal(ledger.publicRelease, 'v1.26.0');
  const privacy = home.slice(home.indexOf('id="privacy"'), home.indexOf('id="start"'));
  assert.doesNotMatch(privacy, /In development|Upcoming|Preview of work in progress/);
  for (const claim of ledger.claims) {
    assert.ok(home.includes(claim.exactWording), claim.exactWording);
  }
  // Unmerged candidate revisions need not exist in a clean CI checkout.
  // The review ledger records their exact revision, paths and hashes; deployment
  // must replace them with release-tag evidence before this draft becomes public.
  assert.match(ledger.candidateSha, /^[a-f0-9]{40}$/);
  for (const claim of ledger.claims) {
    assert.equal(claim.verdict, 'pending-public-release');
    for (const file of claim.evidence) {
      const evidence = ledger.reviewedCandidateFiles.find(item => item.path === file);
      assert.match(evidence?.sha256 || '', /^[a-f0-9]{64}$/);
      assert.ok(evidence.url.includes(ledger.candidateSha));
    }
  }
  const artwork = fs.readFileSync(path.join(root, ledger.artwork.file));
  assert.equal(crypto.createHash('sha256').update(artwork).digest('hex'), ledger.artwork.sha256);
  const approved = execFileSync('git', ['show', `${ledger.artwork.approvedRevision}:${ledger.artwork.source}`], { cwd: root, maxBuffer: 4 * 1024 * 1024 });
  assert.deepEqual(fs.readFileSync(path.join(root, ledger.artwork.source)), approved);
  assert.ok(read('ASSET-LICENSE.md').includes(ledger.artwork.file));
  assert.match(home, /href="\/trust#ad-blocking"/);
  assert.match(home, /href="\/trust#connections"/);
});
