const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const load = file => import(pathToFileURL(path.join(root, file)));
const source = {
  styles: read('src/renderer/styles.css'),
  document: read('src/renderer/index.html'),
  renderer: read('src/renderer/renderer.js'),
};

test('hero extraction retains native dimensions, material and actual action SVGs', async () => {
  const {nativeIslandArt} = await load('site/src/lib/native-island-art.mjs');
  const art = nativeIslandArt(source);
  for (const token of ['island-resting-height', 'island-resting-radius', 'pill-zoom', 'shadow-island-resting']) {
    const declaration = source.styles.match(new RegExp(`--${token}:[^;]+;`))[0];
    assert.ok(art.css.includes(declaration), token);
  }
  for (const name of ['back', 'forward', 'plus', 'reload', 'heart', 'close']) {
    const svg = source.renderer.match(new RegExp(`\\b${name}: '(<svg[^']+)'`))[1];
    assert.ok(art.html.includes(svg), name);
  }
  assert.match(art.html, /id="pillShieldCount">1<\/span>/, 'fixed illustration matches the supplied one-count reference');
  assert.match(art.html, /id="pillShield" class="shield"/, 'use the native ink state from the reference');
  assert.ok(art.css.includes('#pillShieldCount {'), 'include the original badge styling');
  const shield = source.document.match(/id="pillShield"[\s\S]*?(<svg[\s\S]*?<\/svg>)/)[1];
  assert.ok(art.html.includes(shield), 'the hero reuses the original native blocker SVG');
  assert.doesNotMatch(art.html, /horizon-shield\.webp|shield-horizon\.png/);
  assert.doesNotMatch(art.html, /<script|browserAPI/);
  assert.match(art.css, /:host\(\[data-appearance="dark"\]\)/);
  assert.match(read('site/src/components/NativeIslandHero.astro'), /aria-hidden="true" inert/);
});

test('native geometry edits flow into the artwork and missing source fails closed', async () => {
  const {nativeIslandArt} = await load('site/src/lib/native-island-art.mjs');
  const changed = nativeIslandArt({...source, styles:source.styles.replace('--island-resting-height: 44px;', '--island-resting-height: 48px;')});
  assert.match(changed.css, /--island-resting-height: 48px/);
  assert.throws(() => nativeIslandArt({...source, renderer:''}), /Missing native Island icon/);
  assert.throws(() => nativeIslandArt({...source, document:''}), /Missing native resting Island markup/);
});

test('parallax is bounded, frame-batched, static for reduced motion and paused offscreen', async () => {
  const {initHeroIsland, islandPose} = await load('site/src/scripts/hero-island.js');
  assert.deepEqual(islandPose(99), islandPose(1));
  assert.deepEqual(islandPose(-99), islandPose(-1));
  assert.deepEqual(islandPose(1, true), {pitch:0,x:0,y:0},
    'hover presents the Island straight-on regardless of scroll position');
  const values = new Map(), events = new Map(), stageEvents = new Map(), frames = new Map();
  let observer, preferenceChange, sequence = 0;
  const preference = {matches:false, addEventListener:(_, fn) => {preferenceChange = fn;}};
  const model = {clientWidth:920, shadowRoot:{getElementById:() => ({offsetWidth:400,offsetHeight:40})}, style:{setProperty:(k,v) => values.set(k,v)}};
  const hoverTarget = {addEventListener:(key, fn) => stageEvents.set(key, fn)};
  const stage = {
    querySelector:selector => selector === '[data-island-hover]' ? hoverTarget : model,
    getBoundingClientRect:() => ({top:300,left:0,width:1000,height:200}),
    addEventListener:(key, fn) => stageEvents.set(key, fn), closest:() => null,
    style:{setProperty:(k,v) => values.set(k,v)},
  };
  const view = {
    innerHeight:1000,
    document:{hidden:false, addEventListener:()=>{}, fonts:{ready:Promise.resolve()}},
    matchMedia:query => query.includes('reduced') ? preference : {matches:true},
    getComputedStyle:() => ({getPropertyValue:() => '1.15'}),
    addEventListener:(key,fn) => events.set(key,fn),
    requestAnimationFrame:fn => {frames.set(++sequence,fn);return sequence;},
    cancelAnimationFrame:id => frames.delete(id),
    ResizeObserver:class {observe() {}},
    IntersectionObserver:class {constructor(fn) {observer=fn;} observe() {}},
  };
  initHeroIsland(stage, {view});
  assert.ok(Math.abs(Number(values.get('--art-scale')) - 2) < 1e-10);
  const flush = () => {const queued=[...frames.values()];frames.clear();queued.forEach(fn => fn());};
  const defaultPitch = values.get('--island-pitch');
  stageEvents.get('pointerenter')({pointerType:'touch'});
  assert.equal(frames.size,0, 'touch leaves the desktop illustration at its default angle');
  stageEvents.get('pointerenter')({pointerType:'mouse'}); flush();
  assert.equal(values.get('--island-pitch'),'0deg');
  assert.equal(values.get('--island-pan-y'),'0px');
  events.get('scroll')(); flush();
  assert.equal(values.get('--island-pitch'),'0deg', 'scroll cannot tilt it while hovered');
  stageEvents.get('pointerleave')(); flush();
  assert.equal(values.get('--island-pitch'),defaultPitch, 'leaving restores the current scroll perspective');
  events.get('scroll')(); events.get('scroll')();
  assert.equal(frames.size,1);
  observer([{isIntersecting:false}]);
  assert.equal(frames.size,0);
  events.get('scroll')();
  assert.equal(frames.size,0);
  observer([{isIntersecting:true}]);
  flush();
  preference.matches=true; preferenceChange();
  assert.equal(values.get('--island-pitch'),'60deg');
  assert.equal(values.get('--island-pan-y'),'0px');
  events.get('scroll')();
  assert.equal(frames.size,0);
  stageEvents.get('pointerenter')({pointerType:'mouse'}); flush();
  assert.equal(values.get('--island-pitch'),'0deg', 'reduced motion still allows the static front view');
  stageEvents.get('pointerleave')(); flush();
  assert.equal(values.get('--island-pitch'),'60deg');
});
