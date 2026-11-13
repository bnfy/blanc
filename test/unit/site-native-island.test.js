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
  // The app's UI text (Instrument Sans at a fixed width, with spacing that
  // buttons must inherit) reaches the replica, not just its tokens.
  assert.match(art.css, /\*, \*::before, \*::after \{[^}]*font-variation-settings: "wdth" var\(--text-width\) !important;/);
  assert.match(art.css, /button, input, select, textarea \{[^}]*letter-spacing: inherit;[^}]*word-spacing: inherit;/);
  for (const file of ['site/src/components/NativeIslandHero.astro', 'site/src/components/SpacesDemo.astro', 'site/src/components/bento/demos/ShieldDemo.astro']) {
    const component = read(file);
    assert.match(component, /:host \{[^}]*var\(--font-text\)[^}]*letter-spacing:var\(--text-tracking\);word-spacing:var\(--text-word-spacing\);/, `${file} hosts the app's UI text`);
    assert.match(component, /instrument-sans-latin-wdth-normal\.woff2\?url/, `${file} declares Instrument Sans at document level`);
  }
  assert.match(read('site/src/components/NativeIslandHero.astro'), /aria-hidden="true" inert/);
});

test('the floating Glance card draws from the app’s current card rules, radius included', async () => {
  const {nativeGlanceCardArt} = await load('site/src/lib/native-island-art.mjs');
  const art = nativeGlanceCardArt({ ...source, host: 'example.com', icon: '' });
  const radius = source.styles.match(/--glance-card-radius:[^;]+;/)[0];
  assert.ok(art.css.includes(radius), 'the card carries its own corner radius');
  assert.match(art.css, /\.glance-card \{[^}]*border-radius: var\(--glance-card-radius\)/);
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

test('the Spaces demo draws the open Island and its Spaces menu from the app’s markup, palette, symbols and strings', async () => {
  const {nativeSpacesArt, loadSpaceIdentity} = await load('site/src/lib/native-island-art.mjs');
  const Identity = require('../../src/renderer/space-identity.js');
  const identity = loadSpaceIdentity(read('src/renderer/space-identity.js'));
  assert.deepEqual(identity.PRESETS, Identity.PRESETS);
  assert.deepEqual(identity.SYMBOLS, Identity.SYMBOLS);
  // The sample spaces use shipped presets and symbols, and each page a bundled favicon.
  const component = read('site/src/components/SpacesDemo.astro');
  const spaces = [...component.matchAll(/\{ name: '([^']+)', color: '(#[0-9a-f]{6})', symbol: '(\w+)', pages: \[([\s\S]*?)\] \}/g)]
    .map(([, name, color, symbol, pages]) => ({name, color, symbol,
      pages: [...pages.matchAll(/\{ title: '([^']+)', url: '([^']+)', favicon: '([^']+)' \}/g)].map(([, title, url, favicon]) => ({title, url, favicon}))}))
    .map(space => ({...space, tabs: space.pages.length}));
  assert.equal(spaces.length, 4, 'the component lists four sample spaces');
  for (const space of spaces) {
    assert.ok(Identity.presetFor(space.color), `${space.name} uses a preset colour`);
    assert.ok(Identity.isSymbol(space.symbol), `${space.name} uses a shipped symbol`);
    assert.ok(space.pages.length >= 2, `${space.name}: lists its tabs`);
    for (const page of space.pages) {
      assert.ok(fs.statSync(path.join(root, 'site/public', page.favicon)).size > 100, `${space.name}: bundled favicon ${page.favicon}`);
      assert.match(page.url, /^https:\/\//);
    }
  }
  // New space… is the menu's own command label.
  const catalog = JSON.parse(read('copy/messages/en.json'));
  assert.match(read('src/renderer/workspace-ui.js'), /button\(t\('ws\.new'\), 'new'/);
  assert.match(component, /newSpaceLabel: messages\['ws\.new'\]\.message/);
  const sources = {styles: source.styles, overlay: read('src/renderer/overlay.html'), overlayScript: read('src/renderer/overlay.js'),
    workspaceUi: read('src/renderer/workspace-ui.js'), identity, spaces, newSpaceLabel: catalog['ws.new'].message};
  const art = nativeSpacesArt(sources);

  // The open Island: overlay.html's panel, the current space's tabs listed,
  // its footer's Spaces button bound and open. No Space mark on any Island.
  const [work] = spaces;
  assert.match(art.panel, /^<div id="islandPanel">/);
  assert.ok(art.panel.includes(`value="${work.pages[0].url}"`), 'the address row shows the current tab');
  assert.equal(art.panel.match(/class="island-row tab-row/g).length, work.pages.length);
  assert.match(art.panel, new RegExp(`class="island-row tab-row active"[^]*?<span class="row-title">${work.pages[0].title}</span>`));
  assert.match(art.panel, /id="footerWorkspace"\s+class="footer-act ws bound"[^>]*aria-expanded="true"/);
  assert.match(art.panel, /<span id="footerNewTabKbd" class="footer-kbd">⌘T<\/span>/);
  assert.ok(art.panel.includes(read('src/renderer/overlay.js').match(/\breload: '(<svg[^']+)'/)[1]), 'Reload is overlay.js’s own icon');
  assert.doesNotMatch(art.panel, /space-mark|pillSpace|<!--/);
  assert.match(art.panel, /<div id="islandDrawer" hidden><\/div>/, 'the Other devices drawer stays closed');

  assert.equal(art.menu.match(/class="ws-row-main/g).length, spaces.length);
  assert.match(art.menu, new RegExp(`class="ws-row-main on" aria-pressed="true" aria-label="${work.name}, ${work.tabs} tabs"`));
  spaces.forEach(space => {
    const lit = Identity.paint(space.color, 'light'), dark = Identity.paint(space.color, 'dark');
    assert.ok(art.menu.includes(`data-edge-light="${lit.edge}" data-edge-dark="${dark.edge}"`), `${space.name}: edges as the app paints them`);
    assert.ok(art.menu.includes(`style="--space-fill:${lit.fill};--space-on:${lit.on}"`), `${space.name}: painted as the app paints it`);
    assert.ok(art.menu.includes(`<span class="ws-row-name">${space.name}</span><span class="ws-row-count">${space.tabs}</span>`));
  });
  assert.ok(art.menu.includes(`${catalog['ws.new'].message}</div>`));
  assert.match(art.menu, /<div class="ws-cmd" aria-hidden="true">/, 'New space… is shown, not offered');
  for (const rule of ['#islandPanel {', '.island-row .row-title {', '#islandFooter {', '.footer-act.ws.bound {', '#footerWorkspace svg {',
    '#workspaceSwitcher.ws-switcher {', '.ws-tile {', '.ws-row-main.on::after {', '.ws-cmd {']) {
    assert.ok(art.css.includes(rule), `native rule travels with it: ${rule}`);
  }
  assert.doesNotMatch(art.panel + art.menu, /<script|browserAPI|data-i18n/);

  // Native edits flow into the artwork; missing anatomy fails closed.
  const taller = nativeSpacesArt({...sources, styles: source.styles.replace(/(\.ws-row-main \{[^}]*height: )40px/, '$148px')});
  assert.match(taller.css, /\.ws-row-main \{[^}]*height: 48px/);
  assert.throws(() => nativeSpacesArt({...sources, overlay: ''}), /Missing native Island panel markup/);
  assert.throws(() => nativeSpacesArt({...sources, overlay: sources.overlay.replace('class="footer-act ws"', 'class="footer-act"')}), /Missing native Island panel markup/);
  assert.throws(() => nativeSpacesArt({...sources, overlayScript: ''}), /Missing native Island icon: reload/);
  assert.throws(() => nativeSpacesArt({...sources, workspaceUi: ''}), /Missing native Spaces glyph: plus/);
  assert.throws(() => nativeSpacesArt({...sources, spaces: [{...work, symbol: 'rocket'}]}), /unknown symbol/);
  assert.throws(() => nativeSpacesArt({...sources, spaces: [{...work, pages: []}]}), /has no pages/);
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
      append(...nodes) { this.children.push(...nodes); },
      ...extras,
    };
  };
  const samples = [
    ['Work', [['Pull requests', 'https://github.com/pulls'], ['Inbox', 'https://mail.google.com/']]],
    ['Home', [['Home projects', 'https://www.notion.so/'], ['Watch later', 'https://www.youtube.com/']]],
    ['Reading', [['Today’s Paper', 'https://www.nytimes.com/'], ['Reviews', 'https://www.theverge.com/'], ['9to5Mac', 'https://9to5mac.com/']]],
    ['Weekend', [['Netflix', 'https://www.netflix.com/']]],
  ];
  function fixture({reduced = false, width = 527} = {}) {
    const rows = samples.map(([name, pages], index) => {
      const tile = fake();
      const row = fake({classes: index === 0 ? ['on'] : [], querySelector: selector => ({'.ws-tile': tile, '.ws-row-name': {textContent: name}})[selector]});
      Object.assign(row.dataset, {edgeLight: 'false', edgeDark: 'true', pages: JSON.stringify(pages.map(([title, url]) => ({title, url, favicon: `/favicons/${new URL(url).hostname}.ico`})))});
      return row;
    });
    const list = fake(), address = fake({value: samples[0][1][0][1]});
    // The stage at 0.85×: the Spaces button's centre 460px into it, the 300px menu.
    const stage = fake({getBoundingClientRect: () => ({left: 100, width: 527})});
    const button = fake({getBoundingClientRect: () => ({left: 100 + 0.85 * 450, width: 0.85 * 20})});
    const menu = fake({getBoundingClientRect: () => ({width: 0.85 * 300})});
    const shadowRoot = {
      querySelectorAll: selector => selector === '.ws-row-main' ? rows : [],
      querySelector: selector => ({'.native-stage': stage, '[id$="footerWorkspace"]': button, '.ws-switcher': menu, '[id$="islandList"]': list, '[id$="addressInput"]': address})[selector],
    };
    const host = fake({shadowRoot, clientWidth: width});
    host.dataset.appearance = 'light';
    let timers = [], nextId = 0, elapsed = 0, intersect, intersectOptions, mutate;
    const view = {
      matchMedia: () => ({matches: reduced}),
      document: {hidden: false, createElement: () => fake(), fonts: {ready: Promise.resolve()}},
      setTimeout(fn, ms) { timers.push({id: ++nextId, fn, ms}); return nextId; },
      clearTimeout(id) { timers = timers.filter(timer => timer.id !== id); },
      getComputedStyle: () => ({getPropertyValue: name => name === '--demo-width' ? ' 620px' : ''}),
      MutationObserver: class { constructor(fn) { mutate = fn; } observe() {} },
      IntersectionObserver: class { constructor(fn, options) { intersect = fn; intersectOptions = options; } observe() {} },
      ResizeObserver: class { observe() {} },
    };
    initSpacesDemo(host, {view});
    const titles = () => list.children.map(row => row.children[0].children[1].textContent);
    return {host, rows, list, address, stage, view, titles,
      enter: () => intersect([{isIntersecting: true}]), intersectOptions: () => intersectOptions, mutate: () => mutate(),
      pending: () => timers.length, elapsed: () => elapsed,
      tick() { const timer = timers.shift(); elapsed += timer.ms; timer.fn(); }};
  }

  // Fits the stage to its column, at most 1.8×, and hangs the menu 85% across under the Spaces button.
  const p = fixture();
  assert.equal(p.host.style.props['--demo-scale'], '0.85');
  assert.equal(fixture({width: 2000}).host.style.props['--demo-scale'], '1.8');
  assert.ok(Math.abs(parseFloat(p.stage.style.props['--menu-x']) - (460 - 255)) < 1e-9, 'the menu hangs under the Spaces button');
  assert.deepEqual(p.rows.map(row => row.querySelector('.ws-tile').dataset.edge), ['false', 'false', 'false', 'false']);

  // Choosing a row moves the check and lists that space's tabs, its first current.
  p.rows[2].listeners.click[0]();
  assert.deepEqual(p.rows.map(row => row.attrs['aria-pressed']), ['false', 'false', 'true', 'false']);
  assert.deepEqual(p.rows.map(row => row.classList.contains('on')), [false, false, true, false]);
  assert.deepEqual(p.titles(), ['Today’s Paper', 'Reviews', '9to5Mac']);
  assert.equal(p.list.children[0].className, 'island-row tab-row active');
  assert.equal(p.list.children[1].className, 'island-row tab-row');
  assert.equal(p.list.children[0].children[0].children[0].children[0].style.backgroundImage, 'url(/favicons/www.nytimes.com.ico)');
  assert.equal(p.address.value, 'https://www.nytimes.com/');
  assert.match(JSON.stringify(p.list.animations[0].frames), /translateY\(7px\)/, 'moving down the list, content moves up');
  // A visitor's choice ends the walk before it starts.
  p.enter();
  assert.equal(p.pending(), 0);
  // Appearance changes swap in the dark edges.
  p.host.dataset.appearance = 'dark'; p.mutate();
  assert.deepEqual(p.rows.map(row => row.querySelector('.ws-tile').dataset.edge), ['true', 'true', 'true', 'true']);

  // Left alone, it walks through every space once, ending where it began.
  const walk = fixture();
  assert.equal(walk.intersectOptions().threshold, 0.6);
  walk.enter(); walk.enter();
  const seen = [];
  while (walk.pending()) { walk.tick(); seen.push(walk.titles()[0]); }
  assert.deepEqual(seen, ['Home projects', 'Today’s Paper', 'Netflix', 'Pull requests']);
  assert.ok(walk.elapsed() + 300 < 5000, 'the walk finishes inside five seconds (WCAG 2.2.2)');
  walk.enter();
  assert.equal(walk.pending(), 0, 'it walks only once');

  // Any interaction, or a hidden page, stops it.
  for (const type of ['pointerdown', 'keydown', 'focusin']) {
    const q = fixture(); q.enter(); q.tick();
    q.host.listeners[type][0]();
    assert.equal(q.pending(), 0, `${type} stops the walk`);
  }
  const hidden = fixture(); hidden.enter(); hidden.view.document.hidden = true; hidden.tick();
  assert.equal(hidden.address.value, 'https://github.com/pulls');
  assert.equal(hidden.pending(), 0);

  // Reduced Motion: no walk, and switching only cross-fades.
  const still = fixture({reduced: true});
  still.enter();
  assert.equal(still.pending(), 0);
  still.rows[1].listeners.click[0]();
  assert.deepEqual(still.list.animations[0].frames, [{opacity: 0}, {opacity: 1}]);
});

test('the resting-Island figures draw a native window in the tab states the app renders', async () => {
  const {nativeWindowArt} = await load('site/src/lib/native-island-art.mjs');
  const messages = JSON.parse(read('copy/messages/en.json'));
  const verticalTabs = read('src/renderer/vertical-tabs.js');
  const base = {...source, overlay: read('src/renderer/overlay.html'), verticalTabs, messages, panelLeft: '/panel-left.svg'};
  const text = html => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');

  // A site: its host and icon, Back live and Forward spent, the Plus, the shield.
  const site = nativeWindowArt({...base, tab: {url: 'https://github.com/', favicon: '/favicons/github.com.ico', shield: 2}, dots: {count: 3, active: 1}});
  assert.match(site.strip, /^<div id="strip">/);
  assert.match(site.strip, /<span id="pillDomain">github\.com<\/span>/);
  assert.match(site.strip, /id="pillFavicon" class="favicon has-icon" style="background-image:url\(\/favicons\/github\.com\.ico\)"/);
  assert.match(site.strip, /<div id="pillNav" class="pill-btns"><button class="pill-btn">[\s\S]*?<\/button><button class="pill-btn" disabled>/);
  assert.equal(site.strip.match(/class="island-dot/g).length, 3);
  assert.match(site.strip, /<span id="pillShieldCount">2<\/span>/);
  assert.match(site.strip, /id="pillNewTab"/);
  assert.match(site.strip, /<button id="pillSlash"[^>]* hidden>/, 'a site hides the / keycap (renderPillLabel)');
  assert.match(site.strip, /<button id="pillPrivateChip"[^>]* hidden>/);
  assert.equal(site.rail, '');
  assert.equal(site.popover, '');
  const quiet = nativeWindowArt({...base, tab: {url: 'https://github.com/', favicon: '/f.ico', shield: 'quiet'}, dots: {count: 4, active: 1}});
  assert.match(quiet.strip, /id="pillShield" class="shield shield-quiet"/);
  assert.match(quiet.strip, /<span id="pillShieldCount"><\/span>/);

  // A private new tab: the placeholder and / keycap, no favicon or shield,
  // nowhere to go back to, hollow dots and the private chip and theme.
  const priv = nativeWindowArt({...base, tab: {url: 'blanc://newtab/?private=1', private: true}, dots: {count: 3, active: 1}});
  assert.ok(priv.strip.includes(`<span id="pillDomain" class="placeholder">${messages['pill.placeholder'].message}</span>`));
  assert.match(priv.strip, /<button id="pillSlash"[^>]*>\/<\/button>/);
  assert.doesNotMatch(priv.strip, /<button id="pillSlash"[^>]* hidden>/);
  assert.match(priv.strip, /id="pillFavicon" class="favicon internal"/);
  assert.match(priv.strip, /id="pillShield" class="shield" aria-expanded="false" hidden/);
  assert.match(priv.strip, /<button class="pill-btn" disabled>[\s\S]*?<\/button><button class="pill-btn" disabled>/);
  assert.equal(priv.strip.match(/class="island-dot( active)? private"/g).length, 3);
  assert.doesNotMatch(priv.strip, /<button id="pillPrivateChip"[^>]* hidden>/);
  for (const rule of ['.native-window[data-theme="private"] {', '.island-dot.private {', '#islandPill #pillFavicon.internal {']) {
    assert.ok(priv.css.includes(rule), rule);
  }
  // The placeholder is drawn still: the app's reduced-motion rule, not its shimmer.
  assert.match(priv.css, /#pillDomain\.placeholder \{\s*animation: none;/);

  // The shield popover open over a site, as the app's summary step.
  const open = nativeWindowArt({...base, tab: {url: 'https://www.netflix.com/', favicon: '/f.ico', shield: 3}, dots: {count: 4, active: 1}, popover: {host: 'netflix.com', count: 3, mark: '/mark.png'}});
  assert.match(open.strip, /id="islandPill" class="no-drag shield-open"/);
  assert.match(open.strip, /id="pillShield" class="shield" aria-expanded="true"/);
  assert.match(open.popover, /^<div class="native-shield-view"><div id="shieldPopPointer"/);
  for (const expected of ['Site protection', 'netflix.com', 'Blanc Blocker', '3 ads & trackers blocked on this page', 'Uses HTTPS']) {
    assert.ok(text(open.popover).includes(expected), expected);
  }
  assert.ok(open.css.includes('#islandPill.shield-open {'));

  // Vertical tabs: the rail's own markup with sample rows, and the pill without dots or Plus.
  const rail = nativeWindowArt({...base, tab: {url: 'https://github.com/', favicon: '/f.ico', shield: 'quiet'}, dots: {count: 2, active: 1},
    rail: {active: 1, tabs: [{title: 'Notion', favicon: '/n.ico'}, {title: 'GitHub', favicon: '/g.ico'}]}});
  assert.match(rail.rail, /^<aside id="verticalTabsRail" class="vertical-tabs-rail no-drag" aria-label="Vertical tabs">/);
  assert.ok(rail.rail.includes(`<h2 class="vertical-tabs-section-heading">${messages['rail.section.tabs'].message}<span>2</span></h2>`));
  assert.match(rail.rail, /<div class="vertical-tab-row active" role="listitem">[\s\S]*?GitHub/);
  assert.ok(rail.rail.includes(verticalTabs.match(/\bclose: '(<svg[^']+)'/)[1]), 'rows close with vertical-tabs.js’s own glyph');
  assert.match(rail.rail, /<kbd id="verticalTabsNewShortcut">⌘T<\/kbd>/);
  assert.doesNotMatch(rail.rail, /data-i18n/);
  for (const rule of ['.native-window[data-tab-layout="vertical"] #pillDots {', '.native-window[data-tab-layout="vertical"] #pillNewTab {', '.native-window.mac .vertical-tabs-toolbar {', '.vertical-tab-row.active {']) {
    assert.ok(rail.css.includes(rule), rule);
  }
  assert.match(rail.css, /url\("\/panel-left\.svg"\)/);

  // States the app never draws fail at build time.
  assert.throws(() => nativeWindowArt({...base, tab: {url: 'blanc://newtab/', shield: 1}, dots: {count: 1, active: 0}}), /only a site shows the shield/);
  assert.throws(() => nativeWindowArt({...base, tab: {url: 'blanc://newtab/?private=1', private: true}, dots: {count: 1, active: 0}, popover: {host: 'x', count: 1}}), /popover opens from a regular tab/);
  assert.throws(() => nativeWindowArt({...base, document: source.document.replace('<aside id="verticalTabsRail"', '<aside id="x"'), tab: {url: 'https://a.b/', favicon: '/f', shield: 'quiet'}, dots: {count: 1, active: 0}, rail: {active: 0, tabs: []}}), /Missing native vertical tabs markup/);
});

test('the private-tabs figure draws the private Start Page captured from public v1.36.0', () => {
  const crypto = require('node:crypto');
  const capture = JSON.parse(read('docs/website-captures-v1.36.0.json')).privateStartPage;
  const hash = file => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');
  assert.equal(hash(capture.file), capture.sha256, capture.file);
  assert.equal(hash(capture.webp.file), capture.webp.sha256, capture.webp.file);
  const figure = read('site/src/pages/features/private-tabs.astro');
  assert.ok(figure.includes(`shot="${capture.webp.file.replace('site/public', '')}"`), 'the figure draws the recorded capture');
  // v1.36.0 kept the private strip untinted, so the figure passes no tone. Later
  // builds tint it to the private Start Page's wallpaper; re-capture after release.
  assert.doesNotMatch(figure.match(/<NativeWindowFigure[\s\S]*?\/>/)[0], /\btone=/);
});

test('every resting-Island figure on the site is the native window, not a hand-drawn pill', () => {
  const pages = ['island', 'ad-blocking', 'private-tabs', 'security', 'vertical-tabs'];
  for (const page of pages) {
    const markup = read(`site/src/pages/features/${page}.astro`);
    assert.match(markup, /<NativeWindowFigure\b/, page);
  }
  const walk = dir => fs.readdirSync(path.join(root, dir), {withFileTypes: true})
    .flatMap(entry => entry.isDirectory() ? walk(`${dir}/${entry.name}`) : [`${dir}/${entry.name}`]);
  for (const file of walk('site/src').filter(file => file.endsWith('.astro'))) {
    const markup = read(file);
    assert.doesNotMatch(markup, /<div class="pill">|class="site-controls-popover"|class="demo-rail"/, `${file} draws an Island the app doesn't`);
    // Blanc is desktop only: no figure swaps in a phone layout of the page.
    assert.doesNotMatch(markup, /shots\/mobile\//, `${file} shows a phone layout`);
  }
});
