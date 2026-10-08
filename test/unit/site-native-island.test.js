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

test('the shield popover replica renders the native overlay in the states the app shows', async () => {
  const {nativeShieldPopoverArt} = await load('site/src/lib/native-island-art.mjs');
  const {shieldProviderModel, shieldPopoverModel} = require('../../src/main/shield-model.js');
  const overlay = read('src/renderer/overlay.html'), overlayScript = read('src/renderer/overlay.js');
  const text = html => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
  const art = state => nativeShieldPopoverArt({styles:source.styles, overlay, mark:'/mark.png', host:'nytimes.com', count:24, ...state});
  // A regular tab with Blanc Blocker ready and active, default settings.
  const controls = shieldProviderModel({active:'blanc', selected:'blanc', phase:'ready', enabled:true, supported:true, exposed:true});
  const site = shieldPopoverModel({url:'https://www.nytimes.com/', blockedCount:24, adblockEnabled:true, connection:'https'});
  const summary = art({step:'summary'});
  for (const expected of [site.host, controls.detail, site.countLine, ...controls.scope.split('\n'), 'Uses HTTPS', 'Applies while Blanc is dark.']) {
    assert.ok(text(summary.html).includes(expected), `summary shows: ${expected}`);
  }
  assert.match(overlayScript, /https: 'Uses HTTPS'/);
  assert.match(summary.html, /id="shieldPopToggle" class="on"/);
  assert.match(summary.html, /<div id="shieldPopChooser" hidden>/);
  for (const literal of ["'Choose a blocker'", "'For regular tabs on this device.'", "'Restart Blanc to use your selected blocker.'", "'Changes take effect after restarting Blanc.'", "'Restart Blanc'"]) {
    assert.ok(overlayScript.includes(literal), `overlay.js still renders ${literal}`);
  }
  const chooser = art({step:'chooser'}), switching = art({step:'chooser', draft:'ublock-origin'});
  assert.match(chooser.html, /value="blanc" checked/);
  assert.match(chooser.html, new RegExp(`data-provider="blanc">${controls.activeLabel}<`));
  assert.ok(chooser.html.includes('>Done</button>') && chooser.html.includes('Changes take effect after restarting Blanc.'));
  assert.match(switching.html, /value="ublock-origin" checked/);
  assert.ok(switching.html.includes('>Restart Blanc</button>') && switching.html.includes('Restart Blanc to use your selected blocker.'));
  for (const state of [chooser, switching]) assert.match(state.html, /<div id="shieldPopSummary" hidden>/);
  assert.ok(summary.css.includes('#shieldPop {') && summary.css.includes('#shieldPopProvider label {'), 'native popover rules travel with it');
  assert.doesNotMatch(summary.html + chooser.html, /<script|browserAPI/);
  assert.throws(() => art({step:'summary', overlay:''}), /Missing native shield popover markup/);
  assert.throws(() => art({step:'summary', overlay:overlay.replace('<div id="shieldPopCount"></div>', '<div id="shieldPopCount"></div ')}), /shieldPopCount/);
});

test('hero pause control persists across visibility and reduced-motion changes', async () => {
  const {initHeroIsland} = await load('site/src/scripts/hero-island.js');
  const values = new Map(), events = new Map();
  let observer, preferenceChange, resize;
  const preference = {matches:false, addEventListener:(_, fn) => {preferenceChange = fn;}};
  const toggleEvents = new Map(), attributes = new Map();
  const toggle = {hidden:true, addEventListener:(key, fn) => toggleEvents.set(key, fn), setAttribute:(key, value) => attributes.set(key, value)};
  const model = {clientWidth:920, shadowRoot:{getElementById:() => ({offsetWidth:400})}, style:{setProperty:(k,v) => values.set(k,v)}};
  const stage = {
    querySelector:selector => selector === '.hero-island-motion' ? toggle : model,
    style:{setProperty:(k,v) => values.set(k,v)},
  };
  const view = {
    document:{hidden:false, addEventListener:(key,fn) => events.set(key,fn), fonts:{ready:Promise.resolve()}},
    matchMedia:() => preference,
    getComputedStyle:() => ({getPropertyValue:() => '1.15'}),
    ResizeObserver:class {constructor(fn) {resize=fn;} observe() {}},
    IntersectionObserver:class {constructor(fn) {observer=fn;} observe() {}},
  };
  initHeroIsland(stage, {view});
  assert.ok(Math.abs(Number(values.get('--art-scale')) - 2) < 1e-10);
  assert.equal(values.get('--art-visibility'), 'visible', 'the island stays hidden until it is fitted');
  assert.equal(values.get('--island-motion-state'),'paused');
  observer([{isIntersecting:true}]);
  assert.equal(values.get('--island-motion-state'),'running');
  assert.equal(toggle.hidden, false);
  assert.equal(attributes.get('aria-label'), 'Pause Island animation');
  toggleEvents.get('click')();
  assert.equal(values.get('--island-motion-state'), 'paused');
  assert.equal(attributes.get('aria-pressed'), 'true');
  assert.equal(attributes.get('aria-label'), 'Resume Island animation');
  observer([{isIntersecting:false}]);
  observer([{isIntersecting:true}]);
  view.document.hidden=true; events.get('visibilitychange')();
  view.document.hidden=false; events.get('visibilitychange')();
  preference.matches=true; preferenceChange();
  assert.equal(toggle.hidden, true);
  preference.matches=false; preferenceChange();
  assert.equal(toggle.hidden, false);
  assert.equal(values.get('--island-motion-state'), 'paused', 'automatic events must not undo an explicit pause');
  toggleEvents.get('click')();
  assert.equal(attributes.get('aria-pressed'), 'false');
  assert.equal(values.get('--island-motion-state'), 'running');
  observer([{isIntersecting:false}]);
  assert.equal(values.get('--island-motion-state'),'paused');
  observer([{isIntersecting:true}]);
  view.document.hidden=true; events.get('visibilitychange')();
  assert.equal(values.get('--island-motion-state'),'paused');
  view.document.hidden=false; events.get('visibilitychange')();
  assert.equal(values.get('--island-motion-state'),'running');
  preference.matches=true; preferenceChange();
  assert.equal(values.get('--island-motion-state'),'paused');
  observer([{isIntersecting:false}]);
  preference.matches=false; preferenceChange();
  assert.equal(values.get('--island-motion-state'),'paused', 'disabling reduced motion must not start offscreen work');
  observer([{isIntersecting:true}]);
  assert.equal(values.get('--island-motion-state'),'running');
  model.clientWidth=460; resize();
  assert.ok(Math.abs(Number(values.get('--art-scale')) - 1) < 1e-10);
  const css=read('site/src/styles/hero-island.css');
  assert.doesNotMatch(css, /rotate(?:X|Z)?\(/, 'the Island never pitches or rolls');
  assert.match(css, /rotateY\(-5deg\)/);
  assert.match(css, /rotateY\(5deg\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*animation:none; transform:none/,
    'reduced motion removes animation and leaves a level front view');
});
