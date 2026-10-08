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

async function assertDisplayExport(master, exported) {
  const sharp = require('sharp');
  const expected = await sharp(master).trim({ threshold: 8 }).resize(960, 960, {
    fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 },
  }).ensureAlpha().raw().toBuffer();
  const actual = await sharp(exported).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(actual.info.width, 960);
  assert.equal(actual.info.height, 960);
  assert.equal(actual.info.channels, 4);
  assert.equal(actual.data.length, expected.length);
  // WebP encoders can differ across platforms. Compare the visible pixels and
  // silhouette; the ledger's exact hashes separately protect the committed files.
  let alphaDifference = 0, colorDifference = 0, colorWeight = 0;
  for (let i = 0; i < expected.length; i += 4) {
    alphaDifference += Math.abs(expected[i + 3] - actual.data[i + 3]);
    const weight = expected[i + 3] / 255;
    colorWeight += 3 * weight;
    for (let channel = 0; channel < 3; channel++) {
      colorDifference += Math.abs(expected[i + channel] - actual.data[i + channel]) * weight;
    }
  }
  const alphaError = alphaDifference / (expected.length / 4);
  const colorError = colorDifference / colorWeight;
  assert.ok(alphaError < 0.1, `export silhouette differs: mean alpha error ${alphaError}`);
  assert.ok(colorError < 3.5, `export colors differ: mean visible RGB error ${colorError}`);
}

async function preview({ reduced = false, present = true, fail = false, spin, ready } = {}) {
  const { initHorizonShield } = await load('site/src/scripts/horizon-shield.js');
  const styles = new Map(), events = new Map(), callbacks = new Map(), turns = [];
  let sequence = 0, observer, change, loads = 0;
  const bounds = { top: 900, height: 400 };
  const preference = { matches: reduced, addEventListener: (_, fn) => { change = fn; } };
  let shown = true;
  const study = {
    checkVisibility: () => shown,
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
    view, spin, ...(ready && { ready }),
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
    flush(time) { const pending = [...callbacks.values()]; callbacks.clear(); pending.forEach(fn => fn(time)); },
    ready: () => new Promise(resolve => setImmediate(resolve)),
    reduce(value) { preference.matches = value; change(); },
    hide(value) { shown = !value; },
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

test('time spin turns continuously while visible, ignores scrolling and resumes without jumping', async () => {
  const p = await preview({ spin: 'time' });
  assert.equal(p.events.has('scroll'), false, 'a time spin never listens to scrolling');
  assert.equal(p.callbacks.size, 0, 'nothing runs before the artwork is visible');
  p.enter(true); await p.ready();
  p.flush(1000);
  assert.equal(p.angle(), 0);
  p.flush(1045);
  const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≉ ${expected}`);
  near(p.angle(), 45 / 9000 * 360);
  assert.equal(p.callbacks.size, 1, 'each frame schedules the next');
  p.flush(9000);
  near(p.angle(), 95 / 9000 * 360); // a long gap advances at most one capped frame
  p.enter(false); p.flush(9020);
  assert.equal(p.callbacks.size, 0, 'offscreen artwork stops scheduling frames');
  const paused = p.angle();
  p.enter(true); p.flush(60_000);
  assert.equal(p.angle(), paused, 'returning to view resumes from the paused angle');
  p.flush(60_030);
  assert.ok(p.angle() > paused);
  p.reduce(true);
  assert.equal(p.angle(), 0, 'reduced motion holds the shield upright');
  assert.ok(p.turns.length > 0, 'the 3D view follows the turn');
});

test('time spin stops for good when 3D fails and holds still while hidden', async () => {
  const failed = await preview({ spin: 'time', fail: true });
  failed.enter(true); await failed.ready();
  failed.flush(1000);
  assert.equal(failed.callbacks.size, 0, 'no frame loop once the artwork is left upright');
  failed.enter(false); failed.enter(true);
  assert.equal(failed.callbacks.size, 0, 'coming back into view does not restart it');

  const p = await preview({ spin: 'time' });
  p.enter(true); await p.ready();
  p.flush(1000); p.flush(1030);
  const angle = p.angle(), turns = p.turns.length;
  p.hide(true);
  p.flush(1060); p.flush(1090);
  assert.equal(p.angle(), angle, 'a visibility-hidden study does not advance');
  assert.equal(p.turns.length, turns, 'and draws nothing');
  assert.equal(p.callbacks.size, 1, 'it keeps a frame waiting to resume');
  p.hide(false); p.flush(1120);
  assert.ok(p.angle() > angle, 'it resumes once shown again');
});

test('the WebGL renderer waits for its ready signal, and the time spin waits for the renderer', async () => {
  let release;
  const p = await preview({ spin: 'time', ready: new Promise(resolve => { release = resolve; }) });
  p.enter(true); await p.ready();
  assert.equal(p.loads(), 0, 'three.js stays unloaded until the page is ready for it');
  assert.equal(p.callbacks.size, 0, 'no frame loop while there is nothing to draw');
  release(); await p.ready(); await p.ready();
  assert.equal(p.loads(), 1);
  assert.equal(p.callbacks.size, 1, 'the spin starts once the renderer exists');
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

for (const [variant, modelFile, factory] of [
  ['Horizon', 'horizon-shield-model.js', 'createShieldGeometry'],
  ['original Blocker', 'blocker-shield-model.js', 'createBlockerShieldGeometry'],
]) {
  test(`${variant}: identical front/back relief and UVs joined by a closed beveled perimeter`, async () => {
    const model = await load(`site/src/scripts/${modelFile}`);
    const shapes = model[factory]();
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
}

test('provider copy resolves to the verified public release with bronze display artwork and native monochrome Island icon', async () => {
  const ledger = JSON.parse(read('docs/website-blocking-launch.json'));
  const home = read(ledger.source).replace(/<br\s*\/?>/g, ' ').replace(/\s+/g, ' ');
  assert.equal(ledger.status, 'release-verified');
  assert.equal(ledger.publicRelease, 'v1.27.0');
  assert.equal(execFileSync('git', ['rev-parse', ledger.publicRelease], { cwd: root, encoding: 'utf8' }).trim(), ledger.publicSourceSha);
  const platforms = JSON.parse(execFileSync('git', ['show', `${ledger.publicRelease}:src/main/ublock-platforms.json`], { cwd: root, encoding: 'utf8' }));
  assert.deepEqual(ledger.verifiedPlatforms, Object.keys(platforms.platforms).filter(key => platforms.platforms[key].enabled));
  assert.match(ledger.excludedRuntime, /Rosetta/);
  const privacy = home.slice(home.indexOf('id="privacy"'), home.indexOf('id="start"'));
  assert.doesNotMatch(privacy, /In development|Upcoming|Preview of work in progress/);
  for (const claim of ledger.claims) {
    const source = read(claim.source || ledger.source).replace(/<br\s*\/?>/g, ' ').replace(/\s+/g, ' ');
    assert.ok(source.includes(claim.exactWording), claim.exactWording);
  }
  const publicLedger = JSON.parse(read('docs/website-revamp-claims-v1.27.json'));
  for (const claim of ledger.claims) {
    assert.equal(claim.verdict, 'qualified');
    assert.ok(publicLedger.claims.some(entry => entry.exactWording === claim.exactWording && entry.evidenceGroups.includes('blockingProviders')));
    for (const file of claim.evidence) {
      const evidence = ledger.reviewedReleaseFiles.find(item => item.path === file);
      const released = execFileSync('git', ['show', `${ledger.publicRelease}:${file}`], { cwd: root });
      assert.equal(crypto.createHash('sha256').update(released).digest('hex'), evidence?.sha256);
      assert.ok(evidence.url.includes(ledger.publicSourceSha));
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
  await assertDisplayExport(master, artwork);
  assert.ok(read('ASSET-LICENSE.md').includes(ledger.artwork.file));
  const activeArtwork = ledger[ledger.activeArtwork];
  const blockerMaster = fs.readFileSync(path.join(root, activeArtwork.source));
  const blockerExport = fs.readFileSync(path.join(root, activeArtwork.file));
  assert.equal(hash(blockerMaster), activeArtwork.sourceSha256);
  assert.equal(hash(blockerExport), activeArtwork.sha256);
  assert.equal(hash(fs.readFileSync(path.join(root, activeArtwork.model.outline))), activeArtwork.model.outlineSha256);
  await assertDisplayExport(blockerMaster, blockerExport);
  assert.ok(read('ASSET-LICENSE.md').includes(activeArtwork.file));
  assert.match(home, /<HorizonShield variant="blocker"/);
  assert.match(home, /href="\/trust#ad-blocking"/);
  assert.match(home, /href="\/trust#connections"/);
});
