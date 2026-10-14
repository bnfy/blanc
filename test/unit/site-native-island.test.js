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
  // The app's markup carries data-i18n* keys (F44); the replica must still
  // rewrite the domain and must not ship the keys.
  assert.match(art.html, /<span id="pillDomain">blanc\.day<\/span>/, 'the hero pill shows the site domain');
  assert.doesNotMatch(art.html, /data-i18n/, 'interface-string keys are stripped from the replica');
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
  const {englishT: t} = require('../support/english-t');
  const overlay = read('src/renderer/overlay.html'), overlayScript = read('src/renderer/overlay.js');
  const text = html => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
  const art = state => nativeShieldPopoverArt({styles:source.styles, overlay, mark:'/mark.png', host:'nytimes.com', count:24, ...state});
  // A regular tab with Blanc Blocker ready and active, default settings.
  const controls = shieldProviderModel({active:'blanc', selected:'blanc', phase:'ready', enabled:true, supported:true, exposed:true}, false, t);
  const site = shieldPopoverModel({url:'https://www.nytimes.com/', blockedCount:24, adblockEnabled:true, connection:'https', t});
  const summary = art({step:'summary'});
  for (const expected of [site.host, controls.detail, site.countLine, ...controls.scope.split('\n'), 'Uses HTTPS', 'Applies while Blanc is dark.']) {
    assert.ok(text(summary.html).includes(expected), `summary shows: ${expected}`);
  }
  // The replica's state text mirrors what overlay.js renders from the
  // interface catalog (F44): the keys are used there and hold this English.
  const catalog = JSON.parse(read('copy/messages/en.json'));
  const english = key => catalog[key].message;
  assert.match(overlayScript, /https: blancI18n\.t\('connection\.https'\)/);
  assert.equal(english('connection.https'), 'Uses HTTPS');
  assert.match(summary.html, /id="shieldPopToggle" class="on"/);
  assert.match(summary.html, /<div id="shieldPopChooser" hidden>/);
  for (const [key, literal] of [
    ['shield.chooseBlocker', 'Choose a blocker'], ['shield.scopeRegular', 'For regular tabs on this device.'],
    ['shield.restartNeeded', 'Restart Blanc to use your selected blocker.'], ['shield.restartNote', 'Changes take effect after restarting Blanc.'],
    ['shield.restart', 'Restart Blanc'],
  ]) {
    assert.ok(overlayScript.includes(`blancI18n.t('${key}')`), `overlay.js still renders ${key}`);
    assert.equal(english(key), literal, `${key} is still "${literal}"`);
  }
  const chooser = art({step:'chooser'}), switching = art({step:'chooser', draft:'ublock-origin'});
  assert.match(chooser.html, /value="blanc" checked/);
  assert.match(chooser.html, new RegExp(`data-provider="blanc">${controls.activeLabel}<`));
  assert.ok(chooser.html.includes('>Done</button>') && chooser.html.includes('Changes take effect after restarting Blanc.'));
  assert.match(switching.html, /value="ublock-origin" checked/);
  assert.ok(switching.html.includes('>Restart Blanc</button>') && switching.html.includes('Restart Blanc to use your selected blocker.'));
  for (const state of [chooser, switching]) assert.match(state.html, /<div id="shieldPopSummary" hidden>/);
  assert.ok(summary.css.includes('#shieldPop {') && summary.css.includes('#shieldPopProvider label {'), 'native popover rules travel with it');
  assert.doesNotMatch(summary.html + chooser.html, /<script|browserAPI|data-i18n/);
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

test('the Spaces demo draws the native space mark and menu from the app’s palette, symbols and strings', async () => {
  const {nativeSpacesArt, loadSpaceIdentity} = await load('site/src/lib/native-island-art.mjs');
  const Identity = require('../../src/renderer/space-identity.js');
  const identity = loadSpaceIdentity(read('src/renderer/space-identity.js'));
  assert.deepEqual(identity.PRESETS, Identity.PRESETS);
  assert.deepEqual(identity.SYMBOLS, Identity.SYMBOLS);
  // The sample spaces use shipped presets and symbols and bundled favicons.
  const component = read('site/src/components/SpacesDemo.astro');
  const spaces = [...component.matchAll(/\{ name: '([^']+)', color: '(#[0-9a-f]{6})', symbol: '(\w+)', tabs: (\d+), domain: '([^']+)', favicon: '([^']+)' \}/g)]
    .map(([, name, color, symbol, tabs, domain, favicon]) => ({name, color, symbol, tabs: Number(tabs), domain, favicon}));
  assert.equal(spaces.length, 4, 'the component lists four sample spaces');
  for (const space of spaces) {
    assert.ok(Identity.presetFor(space.color), `${space.name} uses a preset colour`);
    assert.ok(Identity.isSymbol(space.symbol), `${space.name} uses a shipped symbol`);
    assert.ok(fs.statSync(path.join(root, 'site/public', space.favicon)).size > 100, `${space.name}: bundled favicon`);
    assert.ok(space.tabs <= 8, `${space.name}: the pill shows at most eight dots before +N`);
  }
  // New space… is the menu's own command label.
  const catalog = JSON.parse(read('copy/messages/en.json'));
  assert.match(read('src/renderer/workspace-ui.js'), /button\(t\('ws\.new'\), 'new'/);
  assert.match(component, /newSpaceLabel: messages\['ws\.new'\]\.message/);
  const sources = {...source, overlay: read('src/renderer/overlay.html'), workspaceUi: read('src/renderer/workspace-ui.js'),
    identity, spaces, newSpaceLabel: catalog['ws.new'].message};
  const art = nativeSpacesArt(sources);

  const [work] = spaces;
  const light = Identity.paint(work.color, 'light');
  assert.match(art.pill, new RegExp(`id="pillSpace" class="space-mark"[^>]*aria-expanded="true" data-state="space" data-edge="${light.edge}" style="--space-fill:${light.fill};--space-on:${light.on}"`));
  for (const [, attrs] of Identity.SYMBOLS[work.symbol]) if (attrs.d) assert.ok(art.pill.includes(`d="${attrs.d}"`), 'the mark draws the space’s own symbol');
  assert.match(art.pill, new RegExp(`<span id="pillSpaceName" class="space-mark-name">${work.name}</span>`));
  assert.equal(art.pill.match(/class="island-dot/g).length, work.tabs);
  assert.match(art.pill, new RegExp(`<span id="pillDomain">${work.domain.replace('.', '\\.')}</span>`));
  assert.match(art.pill, /<span id="pillShieldCount"><\/span>/, 'no blocked count is claimed for sample pages');

  assert.equal(art.menu.match(/class="ws-row-main/g).length, spaces.length);
  assert.match(art.menu, new RegExp(`class="ws-row-main on" aria-pressed="true" aria-label="${work.name}, ${work.tabs} tabs"`));
  spaces.forEach(space => {
    const lit = Identity.paint(space.color, 'light'), dark = Identity.paint(space.color, 'dark');
    assert.ok(art.menu.includes(`data-fill="${lit.fill}" data-on="${lit.on}" data-edge-light="${lit.edge}" data-edge-dark="${dark.edge}"`), `${space.name}: painted as the app paints it`);
    assert.ok(art.menu.includes(`<span class="ws-row-name">${space.name}</span><span class="ws-row-count">${space.tabs}</span>`));
  });
  assert.ok(art.menu.includes(`${catalog['ws.new'].message}</div>`));
  assert.match(art.menu, /<div class="ws-cmd" aria-hidden="true">/, 'New space… is shown, not offered');
  for (const rule of ['.space-mark[data-state="space"] .space-mark-symbol {', '.space-mark:hover, .space-mark[aria-expanded="true"] {',
    '#workspaceSwitcher.ws-switcher {', '.ws-tile {', '.ws-row-main.on::after {', '.ws-cmd {']) {
    assert.ok(art.css.includes(rule), `native rule travels with it: ${rule}`);
  }
  assert.doesNotMatch(art.pill + art.menu, /<script|browserAPI|data-i18n/);

  // Native edits flow into the artwork; missing anatomy fails closed.
  const taller = nativeSpacesArt({...sources, styles: source.styles.replace(/(\.ws-row-main \{[^}]*height: )40px/, '$148px')});
  assert.match(taller.css, /\.ws-row-main \{[^}]*height: 48px/);
  assert.throws(() => nativeSpacesArt({...sources, overlay: ''}), /Missing native Spaces menu markup/);
  assert.throws(() => nativeSpacesArt({...sources, workspaceUi: ''}), /Missing native Spaces glyph: plus/);
  assert.throws(() => nativeSpacesArt({...sources, document: source.document.replace('data-state="none" hidden', 'data-state="none"')}), /Missing native Spaces markup/);
  assert.throws(() => nativeSpacesArt({...sources, spaces: [{...work, symbol: 'rocket'}]}), /unknown symbol/);
  assert.throws(() => loadSpaceIdentity(''), /Missing native Spaces identity/);
});

test('the Spaces demo switches like the app, walks once in under five seconds and yields to the visitor', async () => {
  const {initSpacesDemo, fitSpacesDemo} = await load('site/src/scripts/spaces-demo.js');
  const fake = (extras = {}) => {
    const classes = new Set(extras.classes || []);
    return {
      dataset: {}, attrs: {}, listeners: {}, animations: [], children: [],
      style: {props: {}, setProperty(key, value) { this.props[key] = value; }},
      classList: {toggle: (name, on) => on ? classes.add(name) : classes.delete(name), contains: name => classes.has(name)},
      setAttribute(key, value) { this.attrs[key] = value; },
      removeAttribute(key) { delete this.attrs[key]; },
      addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
      animate(frames, options) { this.animations.push({frames, options}); },
      replaceChildren(...nodes) { this.children = nodes; },
      ...extras,
    };
  };
  const samples = [
    ['Work', '#376694', 6, 'github.com'], ['Home', '#426c4c', 4, 'notion.so'],
    ['Reading', '#6757a3', 5, 'nytimes.com'], ['Weekend', '#974f2a', 3, 'netflix.com'],
  ];
  function fixture({reduced = false, width = 520} = {}) {
    const rows = samples.map(([name, fill, tabs, domain], index) => {
      const tile = fake();
      const glyph = fake({cloneNode: () => fake({symbolOf: name})});
      const row = fake({classes: index === 0 ? ['on'] : [], querySelector: selector => ({'.ws-tile': tile, '.ws-symbol': glyph, '.ws-row-name': {textContent: name}})[selector]});
      Object.assign(row.dataset, {fill, on: '#ffffff', edgeLight: 'false', edgeDark: 'true', tabs: String(tabs), domain, favicon: `/favicons/${domain}.ico`});
      return row;
    });
    const symbol = fake(), name = fake({textContent: 'Work'});
    const mark = fake({
      querySelector: selector => ({'.space-mark-symbol': symbol, '.space-mark-name': name})[selector],
      getBoundingClientRect: () => ({left: 111.7}),
    });
    Object.defineProperty(mark, 'offsetWidth', {get: () => 40 + name.textContent.length * 6});
    const dots = fake(), favicon = fake(), domain = fake({textContent: 'github.com'});
    const stage = fake({getBoundingClientRect: () => ({left: 100, width: 520})});
    const shadowRoot = {
      querySelectorAll: selector => selector === '.ws-row-main' ? rows : [],
      querySelector: selector => ({'.space-mark': mark, '.native-stage': stage, '[id$="pillDots"]': dots, '[id$="pillFavicon"]': favicon, '[id$="pillDomain"]': domain})[selector],
    };
    const host = fake({shadowRoot, clientWidth: width});
    host.dataset.appearance = 'light';
    let timers = [], nextId = 0, elapsed = 0, intersect, intersectOptions, mutate;
    const view = {
      matchMedia: () => ({matches: reduced}),
      document: {hidden: false, createElement: () => fake(), fonts: {ready: Promise.resolve()}},
      setTimeout(fn, ms) { timers.push({id: ++nextId, fn, ms}); return nextId; },
      clearTimeout(id) { timers = timers.filter(timer => timer.id !== id); },
      getComputedStyle: () => ({getPropertyValue: name => name === '--demo-width' ? ' 400px' : ''}),
      MutationObserver: class { constructor(fn) { mutate = fn; } observe() {} },
      IntersectionObserver: class { constructor(fn, options) { intersect = fn; intersectOptions = options; } observe() {} },
      ResizeObserver: class { observe() {} },
    };
    initSpacesDemo(host, {view});
    return {host, rows, mark, symbol, name, dots, favicon, domain, stage, view,
      enter: () => intersect([{isIntersecting: true}]), intersectOptions: () => intersectOptions, mutate: () => mutate(),
      pending: () => timers.length, elapsed: () => elapsed,
      tick() { const timer = timers.shift(); elapsed += timer.ms; timer.fn(); }};
  }

  // Fits the stage to its column, at most 1.3×, and lines the menu up with the mark.
  const p = fixture();
  assert.equal(p.host.style.props['--demo-scale'], '1.3');
  assert.ok(Math.abs(parseFloat(p.stage.style.props['--menu-x']) - 9) < 1e-9, 'the menu starts under the mark');
  const narrow = {...p.host, clientWidth: 260, style: {props: {}, setProperty(k, v) { this.props[k] = v; }}};
  fitSpacesDemo(narrow, p.view);
  assert.equal(narrow.style.props['--demo-scale'], '0.65');
  assert.deepEqual(p.rows.map(row => row.querySelector('.ws-tile').dataset.edge), ['false', 'false', 'false', 'false']);

  // Choosing a row repaints the mark, dots, favicon and domain as renderer.js does.
  p.rows[2].listeners.click[0]();
  assert.deepEqual(p.rows.map(row => row.attrs['aria-pressed']), ['false', 'false', 'true', 'false']);
  assert.deepEqual(p.rows.map(row => row.classList.contains('on')), [false, false, true, false]);
  assert.equal(p.mark.style.props['--space-fill'], '#6757a3');
  assert.equal(p.mark.style.props['--space-on'], '#ffffff');
  assert.equal(p.symbol.children[0].symbolOf, 'Reading');
  assert.equal(p.name.textContent, 'Reading');
  assert.equal(p.dots.children.length, 5);
  assert.equal(p.favicon.style.backgroundImage, 'url(/favicons/nytimes.com.ico)');
  assert.equal(p.domain.textContent, 'nytimes.com');
  assert.match(JSON.stringify(p.symbol.animations[0].frames), /translateY\(7px\)/, 'moving down the list, content moves up');
  assert.match(JSON.stringify(p.dots.animations[0].frames), /translateX\(10px\)/);
  assert.deepEqual(p.mark.animations.at(-1).frames, [{width: '64px'}, {width: '82px'}], 'the mark settles to its new width');
  // A visitor's choice ends the walk before it starts.
  p.enter();
  assert.equal(p.pending(), 0);
  // Appearance changes swap in the dark edges.
  p.host.dataset.appearance = 'dark'; p.mutate();
  assert.equal(p.mark.dataset.edge, 'true');
  assert.deepEqual(p.rows.map(row => row.querySelector('.ws-tile').dataset.edge), ['true', 'true', 'true', 'true']);

  // Left alone, it walks through every space once, ending where it began.
  const walk = fixture();
  assert.equal(walk.intersectOptions().threshold, 0.6);
  walk.enter(); walk.enter();
  const seen = [];
  while (walk.pending()) { walk.tick(); seen.push(walk.name.textContent); }
  assert.deepEqual(seen, ['Home', 'Reading', 'Weekend', 'Work']);
  assert.ok(walk.elapsed() + 320 < 5000, 'the walk finishes inside five seconds (WCAG 2.2.2)');
  walk.enter();
  assert.equal(walk.pending(), 0, 'it walks only once');

  // Any interaction, or a hidden page, stops it.
  for (const type of ['pointerdown', 'keydown', 'focusin']) {
    const q = fixture(); q.enter(); q.tick();
    q.host.listeners[type][0]();
    assert.equal(q.pending(), 0, `${type} stops the walk`);
  }
  const hidden = fixture(); hidden.enter(); hidden.view.document.hidden = true; hidden.tick();
  assert.equal(hidden.name.textContent, 'Work');
  assert.equal(hidden.pending(), 0);

  // Reduced Motion: no walk, and switching only cross-fades.
  const still = fixture({reduced: true});
  still.enter();
  assert.equal(still.pending(), 0);
  still.rows[1].listeners.click[0]();
  assert.deepEqual(still.symbol.animations[0].frames, [{opacity: 0}, {opacity: 1}]);
  assert.equal(still.dots.animations.length, 0);
  assert.equal(still.mark.animations.length, 0);
});
