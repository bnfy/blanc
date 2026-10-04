const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const load = file => import(pathToFileURL(path.join(root, file)).href);

async function preview({ reduced = false, present = true, fail = false } = {}) {
  const { initHorizonShield } = await load('site/src/scripts/horizon-shield.js');
  const styles = new Map(), events = new Map(), callbacks = new Map(), turns = [];
  let sequence = 0, observer, change, loads = 0;
  const bounds = { top: 900, height: 400 };
  const preference = { matches: reduced, addEventListener: (_, fn) => { change = fn; } };
  const study = {
    getBoundingClientRect: () => bounds,
    querySelector: () => ({}),
    style: { setProperty: (name, value) => styles.set(name, value) },
  };
  const view = {
    innerHeight: 1000, matchMedia: () => preference,
    addEventListener: (name, fn) => events.set(name, fn),
    requestAnimationFrame: fn => { callbacks.set(++sequence, fn); return sequence; },
    IntersectionObserver: class { constructor(fn) { observer = fn; } observe() {} },
  };
  initHorizonShield(present ? study : null, {
    view,
    loadRenderer: async () => {
      loads++;
      if (fail) throw new Error('WebGL unavailable');
      return { createShieldRenderer: async () => ({ turn: angle => turns.push(angle) }) };
    },
  });
  return {
    styles, events, callbacks, bounds, turns,
    loads: () => loads,
    enter: visible => observer([{ isIntersecting: visible }]),
    flush() { const pending = [...callbacks.values()]; callbacks.clear(); pending.forEach(fn => fn()); },
    ready: () => new Promise(resolve => setImmediate(resolve)),
    reduce(value) { preference.matches = value; change(); },
    angle: () => parseFloat(styles.get('--shield-turn') || '0'),
  };
}

test('the solid shield completes one scroll-driven turn, reverses and clamps at both endpoints', async () => {
  const p = await preview();
  assert.equal(p.angle(), 0);
  assert.equal(p.loads(), 0, 'the WebGL chunk stays unloaded before the artwork enters');
  p.enter(true); await p.ready();
  assert.equal(p.loads(), 1);
  p.bounds.top = 800;
  p.events.get('scroll')(); p.flush();
  assert.ok(p.angle() > 0 && p.angle() < 90, 'the turn begins while most of the shield is still below the viewport');
  p.bounds.top = 350;
  p.events.get('scroll')(); p.events.get('scroll')();
  assert.equal(p.callbacks.size, 1, 'scroll bursts share a single animation frame');
  p.flush();
  assert.equal(p.angle(), 180);
  assert.equal(p.turns.at(-1), Math.PI);
  p.bounds.top = -500;
  p.events.get('scroll')(); p.flush();
  assert.equal(p.angle(), 360);
  p.bounds.top = 350;
  p.events.get('scroll')(); p.flush();
  assert.equal(p.angle(), 180, 'upward scrolling reverses the same turn');
  p.bounds.top = 1500; p.enter(false);
  assert.equal(p.angle(), 0);
  p.events.get('scroll')();
  assert.equal(p.callbacks.size, 0, 'offscreen artwork schedules no scroll work');
});

test('reduced motion stays upright and does not eagerly load WebGL', async () => {
  const p = await preview({ reduced: true });
  p.enter(true); p.events.get('scroll')(); await p.ready();
  assert.equal(p.loads(), 0);
  assert.equal(p.callbacks.size, 0);
  assert.equal(p.angle(), 0);
  p.bounds.top = 350; p.reduce(false); await p.ready();
  assert.equal(p.angle(), 180);
  assert.equal(p.loads(), 1);
  p.events.get('scroll')(); p.reduce(true); p.flush();
  assert.equal(p.angle(), 0);
  assert.equal(p.turns.at(-1), 0);
  assert.equal((await preview({ present: false })).events.size, 0);
});

test('failed 3D initialization leaves the static artwork and does not retry every scroll', async () => {
  const p = await preview({ fail: true });
  p.enter(true); await p.ready();
  p.enter(false); p.enter(true); p.events.get('scroll')(); p.flush(); await p.ready();
  assert.equal(p.loads(), 1);
  assert.equal(p.turns.length, 0);
  const css = read('site/src/styles/home.css');
  assert.doesNotMatch(css, /rotateY\(var\(--shield-turn/);
});

test('front and back have identical relief and UVs joined by a solid beveled perimeter', async () => {
  const { createShieldGeometry } = await load('site/src/scripts/horizon-shield-model.js');
  const shapes = createShieldGeometry();
  const front = shapes.front.positions, back = shapes.back.positions;
  assert.equal(front.length, back.length);
  assert.ok(Math.max(...front.filter((_, i) => i % 3 === 2)) > 0.2);
  assert.ok(Math.min(...back.filter((_, i) => i % 3 === 2)) < -0.2, 'physical thickness survives an edge-on turn');
  for (let i = 0; i < front.length; i += 3) {
    assert.equal(front[i], -back[i]);
    assert.equal(front[i + 1], back[i + 1]);
    assert.equal(front[i + 2], -back[i + 2]);
  }
  assert.deepEqual(shapes.front.uvs, shapes.back.uvs);
  const rim = shapes.rim;
  for (let i = 0; i < rim.indices.length; i += 3) {
    const a = rim.indices[i] * 3, b = rim.indices[i + 1] * 3, c = rim.indices[i + 2] * 3;
    const ab = [0, 1, 2].map(k => rim.positions[b + k] - rim.positions[a + k]);
    const ac = [0, 1, 2].map(k => rim.positions[c + k] - rim.positions[a + k]);
    const normal = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2]];
    const outward = normal[0] * rim.positions[a] + normal[1] * rim.positions[a + 1];
    assert.ok(outward > 0, 'side normals must face outward, or back-face culling exposes the hollow interior');
  }
  const edges = new Map();
  for (const shape of Object.values(shapes)) {
    const p = shape.positions, indices = shape.indices;
    const key = i => [p[i * 3], p[i * 3 + 1], p[i * 3 + 2]].map(n => n.toFixed(5)).join(',');
    for (let i = 0; i < indices.length; i += 3) {
      const triangle = [key(indices[i]), key(indices[i + 1]), key(indices[i + 2])];
      for (let j = 0; j < 3; j++) {
        const edge = [triangle[j], triangle[(j + 1) % 3]].sort().join('|');
        edges.set(edge, (edges.get(edge) || 0) + 1);
      }
    }
  }
  assert.ok([...edges.values()].every(count => count === 2), 'every welded edge belongs to two triangles: no open sides');
});

test('provider launch copy stays release-gated with bronze display artwork and native monochrome Island icon', async () => {
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
  const hash = data => crypto.createHash('sha256').update(data).digest('hex');
  const original = execFileSync('git', ['show', `${ledger.artwork.originalApprovedRevision}:${ledger.artwork.source}`], { cwd: root, maxBuffer: 4 * 1024 * 1024 });
  assert.equal(hash(original), ledger.artwork.originalSourceSha256);
  const master = fs.readFileSync(path.join(root, ledger.artwork.source));
  assert.equal(hash(master), ledger.artwork.sourceSha256);
  const nativeIcon = read(ledger.islandIcon.file).match(/id="pillShield"[\s\S]*?(<svg[\s\S]*?<\/svg>)/)[1];
  assert.equal(hash(nativeIcon), ledger.islandIcon.sha256);
  assert.equal(hash(fs.readFileSync(path.join(root, ledger.artwork.model.outline))), ledger.artwork.model.outlineSha256);
  assert.equal(hash(fs.readFileSync(path.join(root, ledger.artwork.recolor.reference))), ledger.artwork.recolor.referenceSha256);
  const sharp = require('sharp');
  const options = {fit:'contain', background:{r:0,g:0,b:0,alpha:0}};
  assert.deepEqual(await sharp(master).trim({threshold:8}).resize(960,960,options).webp({quality:90,alphaQuality:100,effort:6}).toBuffer(), artwork,
    'the large display artwork must be an unfiltered export of the bronze master');
  assert.ok(read('ASSET-LICENSE.md').includes(ledger.artwork.file));
  assert.match(home, /href="\/trust#ad-blocking"/);
  assert.match(home, /href="\/trust#connections"/);
});
