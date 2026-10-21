// Build-time extraction only. Native renderer code is never executed on the site
// (space-identity.js's pure colour and symbol tables are evaluated at build time).
// Fail if the native anatomy changes instead of silently shipping a hand-drawn substitute.
function nativeRules(styles) {
  const clean = styles.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [...clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({
    selector: selector.trim().replace(/\s+/g, ' '), body,
  }));
  const take = selector => {
    const rule = rules.find(rule => rule.selector === selector);
    if (!rule) throw new Error(`Missing native Island rule: ${selector}`);
    return `${selector} {${rule.body}}`;
  };
  const root = rules.filter(rule => rule.selector === ':root');
  if (root.length < 2) throw new Error('Missing native light/dark tokens');
  const tokens = `:host {${root[0].body}}\n:host([data-appearance="dark"]) {${root[1].body}}`;
  // A rule written against the chrome document (:root[data-theme="private"],
  // body.mac …), aimed at the figure's .native-window, which carries the same
  // attributes. `last` takes the final rule of that name, such as the
  // reduced-motion variant of an animated one.
  const scoped = (selector, { last = false } = {}) => {
    const matches = rules.filter(rule => rule.selector === selector);
    const rule = last ? matches.at(-1) : matches[0];
    if (!rule) throw new Error(`Missing native Island rule: ${selector}`);
    return `${selector.replace(/:root|body/g, '.native-window')} {${rule.body}}`;
  };
  return { rules, take, tokens, scoped };
}

export function nativeIslandArt({ styles, document, renderer, extraSelectors = [] }) {
  const { take, tokens } = nativeRules(styles);
  const selectors = [
    // The app's UI-text width and the spacing its buttons inherit.
    '*', '*, *::before, *::after', 'button, input, select, textarea',
    'button', 'button svg', '#islandPill', '#islandPill::after', '#pillDots',
    '.pill-btns', '.pill-btn', '.pill-btn:disabled', '.pill-btn svg', '.pill-sep',
    '.island-dot', '.island-dot.active', '#pillDomain', '.pill-shortcuts',
    '.pill-slash, .pill-shortcut', '.pill-slash::before, .pill-shortcut::before',
    '.pill-shortcut svg', '.shield', '.shield svg', '#pillShieldCount', '#pillShieldCount:empty',
    '.shield.shield-quiet', '.favicon', '.favicon.has-icon', '#pillFavicon',
    ...extraSelectors,
  ];
  const css = `${tokens}\n${selectors.map(take).join('\n')}`;
  const start = document.indexOf('<div id="islandPill"');
  const end = document.indexOf('<header id="glanceHeader"', start);
  if (start < 0 || end < start) throw new Error('Missing native resting Island markup');
  const icon = key => rendererIcon(renderer, key);
  const button = (key, extra = '') => `<button class="pill-btn" ${extra}>${icon(key)}</button>`;
  let html = stripInterfaceKeys(document.slice(start, end).trim());
  html = html.replace('<div id="pillNav" class="pill-btns"></div>',
    `<div id="pillNav" class="pill-btns">${button('back')}${button('forward', 'disabled')}</div>`);
  html = html.replace('<div id="pillDots"></div>', `<div id="pillDots">${[0, 1, 2, 3, 4].map(i => `<button class="island-dot${i === 2 ? ' active' : ''}"></button>`).join('')}</div>`);
  html = html.replace('id="pillFavicon" class="favicon"', 'id="pillFavicon" class="favicon has-icon" style="background-image:url(/favicon.svg)"');
  if (!html.includes('<span id="pillDomain">new tab</span>')) throw new Error('Missing native resting Island markup: pillDomain');
  html = html.replace('<span id="pillDomain">new tab</span>', '<span id="pillDomain">blanc.day</span>');
  html = html.replace(/(<button id="pillSlash"[\s\S]*?<\/button>)/, `$1<button id="pillNewTab" class="pill-btn pill-shortcut">${icon('plus')}</button>`);
  // Match the owner's October 3 reference: original ink shield with a one-count badge.
  // This is a fixed illustration state, not a measurement of this website.
  html = html.replace('id="pillShield" class="shield" aria-expanded="false" hidden', 'id="pillShield" class="shield" aria-expanded="false"');
  html = html.replace('<span id="pillShieldCount"></span>', '<span id="pillShieldCount">1</span>');
  html = html.replace('<div id="pillActions" class="pill-btns"></div>', `<div id="pillActions" class="pill-btns">${button('reload')}${button('heart')}${button('close')}</div>`);
  return { css, html };
}

// renderer.js ICONS entry `key`, an inline SVG string.
function rendererIcon(renderer, key) {
  const value = renderer.match(new RegExp(`\\b${key}: '(<svg[^']+)'`))?.[1];
  if (!value) throw new Error(`Missing native Island icon: ${key}`);
  return value;
}

// The app's documents carry data-i18n* attributes naming interface-string keys
// (F44). The replica keeps the English inline text and drops the keys, so the
// exact-markup rewrites below match and the site ships no app-only attributes.
function stripInterfaceKeys(html) {
  return html.replace(/\s+data-i18n(?:-[a-z-]+)?(?:="[^"]*")?(?=[\s>/])/g, '');
}

// Rules the resting Island adds while its shield popover is open.
// The floating Glance card (v1.40.0): the app's own card frame and header,
// with Back disabled, Reload and the site filled in as the renderer fills
// them. The Glance page itself is the caller's, slotted below the header.
export function nativeGlanceCardArt({ styles, document, renderer, host, icon }) {
  const { rules, take, tokens } = nativeRules(styles);
  const surface = (selector) => {
    const full = `html[data-surface="glance"] ${selector}`;
    const rule = rules.find((candidate) => candidate.selector === full);
    if (!rule) throw new Error(`Missing native Glance rule: ${full}`);
    return `${selector} {${rule.body}}`;
  };
  const selectors = [
    '*', '*, *::before, *::after', 'button, input, select, textarea', 'button', 'button svg',
    '.favicon', '.favicon.has-icon', '.split-panes, .split-tab-surface, .glance-card',
    '.glance-header', '.glance-copy', '.glance-eyebrow', '.glance-tab-identity',
    '.glance-tab-identity .favicon', '#glanceTitle', '.glance-actions', '.glance-header button',
    '.glance-action', '.glance-action svg, .glance-move svg', '.glance-close', '.glance-move',
    '.glance-nav', '.glance-header .glance-nav-btn', '.glance-nav-btn svg', '.glance-header .glance-nav-btn:disabled',
  ];
  const css = [tokens, ...selectors.map(take), surface('.glance-card'), surface('.glance-header')].join('\n');
  const start = document.indexOf('<header id="glanceHeader"');
  const end = document.indexOf('</header>', start) + '</header>'.length;
  if (start < 0 || end < start) throw new Error('Missing native Glance header markup');
  let html = stripInterfaceKeys(document.slice(start, end));
  const fill = (from, to, label) => {
    if (!html.includes(from)) throw new Error(`Missing native Glance header markup: ${label}`);
    html = html.replace(from, to);
  };
  fill('class="glance-header no-drag" role="group" aria-labelledby="glanceEyebrow" hidden', 'class="glance-header"', 'header');
  fill('aria-label="Back" disabled></button>', `aria-label="Back" disabled>${rendererIcon(renderer, 'back')}</button>`, 'back');
  fill('aria-label="Reload"></button>', `aria-label="Reload">${rendererIcon(renderer, 'reload')}</button>`, 'reload');
  fill('<span id="glanceFavicon" class="favicon" aria-hidden="true"></span>', `<span id="glanceFavicon" class="favicon has-icon" aria-hidden="true" style="background-image:url(${icon})"></span>`, 'favicon');
  fill('<span id="glanceTitle"></span>', `<span id="glanceTitle">${host}</span>`, 'title');
  return { html: `<div class="glance-card">${html}<div class="glance-card-page"><slot></slot></div></div>`, css };
}

export const SHIELD_OPEN_SELECTORS = [
  '.shield:hover, .shield[aria-expanded="true"]', '#islandPill.shield-open',
  '#islandPill.shield-open .shield[aria-expanded="true"]::after',
];

// The Site protection popover (overlay.html #shieldPop with its pointer) in
// one fixed state, for a regular tab whose Blanc Blocker is ready and active
// with default settings, as overlay.js renders it. `step` is 'summary' or
// 'chooser'; in the chooser `draft` is the selected blocker. The state text
// mirrors overlay.js and shield-model.js; test/unit/site-native-island.test.js
// checks it against them.
export function nativeShieldPopoverArt({ styles, overlay, mark, step, host, count, draft = 'blanc' }) {
  const { rules, take } = nativeRules(styles);
  const selectors = rules.map(rule => rule.selector)
    .filter(selector => /#shieldPop|\.shield-pop|\.shield-provider/.test(selector) && !selector.startsWith(':root'));
  if (!selectors.includes('#shieldPop')) throw new Error('Missing native Island rule: #shieldPop');
  const css = ['.sr-only', ...new Set(selectors)].map(take).join('\n');
  const start = overlay.indexOf('<div id="shieldPopPointer"');
  const end = overlay.indexOf('</section>', start);
  if (start < 0 || end < start) throw new Error('Missing native shield popover markup');
  let html = stripInterfaceKeys(overlay.slice(start, end + '</section>'.length));
  const set = (from, to) => {
    if (!html.includes(from)) throw new Error(`Missing native shield popover markup: ${from}`);
    html = html.replace(from, to);
  };
  const unhide = opening => set(`${opening} hidden>`, `${opening}>`);
  unhide('<div id="shieldPopPointer" aria-hidden="true"');
  set('aria-describedby="shieldPopHost" hidden>', `aria-describedby="shieldPopHost" data-step="${step}" data-restart-pending="false">`);
  set('src="sunrise-hero-mark.png"', `src="${mark}"`);
  if (step === 'chooser') {
    set('<h2 id="shieldPopTitle">Site protection</h2>', '<h2 id="shieldPopTitle">Choose a blocker</h2>');
    set('<p id="shieldPopHost"></p>', '<p id="shieldPopHost">For regular tabs on this device.</p>');
    unhide('<button id="shieldPopBack" class="shield-pop-nav shield-pop-back" aria-label="Back to site protection"');
    set('<div id="shieldPopSummary">', '<div id="shieldPopSummary" hidden>');
    unhide('<div id="shieldPopChooser"');
    unhide('<span class="shield-provider-active" data-provider="blanc"');
    set(`value="${draft}" />`, `value="${draft}" checked />`);
    if (draft !== 'blanc') {
      set('<p id="shieldPopRestartNote">Changes take effect after restarting Blanc.</p>', '<p id="shieldPopRestartNote">Restart Blanc to use your selected blocker.</p>');
      set('class="shield-pop-primary">Done</button>', 'class="shield-pop-primary">Restart Blanc</button>');
    }
  } else {
    set('<p id="shieldPopHost"></p>', `<p id="shieldPopHost">${host}</p>`);
    set('<p id="shieldPopProviderStatus" role="status"></p>', '<p id="shieldPopProviderStatus" role="status">Active</p>');
    set('<button id="shieldPopToggle" role="switch"', '<button id="shieldPopToggle" class="on" role="switch"');
    set('<div id="shieldPopCount"></div>', `<div id="shieldPopCount">${count} ${count === 1 ? 'ad or tracker' : 'ads &amp; trackers'} blocked on this page</div>`);
    // Dark websites is off by default; its note shows while Blanc is light.
    unhide('<div id="shieldPopDark" class="shield-pop-dark"');
    unhide('<p id="shieldPopDarkNote" class="shield-pop-note"');
    unhide('<div id="shieldPopConnection"');
    set('<span id="shieldPopConnectionValue"></span>', '<span id="shieldPopConnectionValue">Uses HTTPS</span>');
    set('<p id="shieldPopProviderScope" class="shield-pop-note"></p>', '<p id="shieldPopProviderScope" class="shield-pop-note">Private tabs use Blanc Blocker; uBO isn’t supported in temporary private sessions.\nEach blocker keeps its own site settings.</p>');
  }
  return { css, html };
}

// Prefix every extracted id, and the CSS id selectors and aria references that
// point at them, so several native instances stay distinct in one page.
export function namespaceNativeArt({ html, css }, prefix) {
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));
  const prefixed = id => ids.has(id) ? prefix + id : id;
  return {
    html: html.replace(/\bid="([^"]+)"/g, (_, id) => `id="${prefix}${id}"`)
      .replace(/\b(aria-labelledby|aria-describedby)="([^"]+)"/g, (_, name, list) => `${name}="${list.split(' ').map(prefixed).join(' ')}"`),
    css: css.replace(/#([A-Za-z][\w-]*)/g, (selector, id) => ids.has(id) ? `#${prefix}${id}` : selector),
  };
}

// Rules the resting Island adds once its window is in a space: the space mark
// at the pill's leading edge (renderer.js renderSpaceMark), open while its
// Spaces menu shows.
export const SPACE_MARK_SELECTORS = [
  '.space-mark', '.space-mark:hover, .space-mark[aria-expanded="true"]',
  '.space-mark-symbol', '.space-mark-symbol svg', '.space-mark-name',
  '.space-mark[data-state="space"]', '.space-mark[data-state="space"] .space-mark-symbol',
  '.space-mark[data-state="space"] .space-mark-symbol svg', '.space-mark[data-edge="true"] .space-mark-symbol',
  '#islandPill:has(> .space-mark:not([hidden]))',
];

// The Spaces menu's list and its New space… command (workspace-ui.js). The
// rows' ••• editor button is left out: it only appears on hover, and the demo
// has no editor to open.
const SPACES_MENU_SELECTORS = [
  '#workspaceSwitcher.ws-switcher', '#workspaceSwitcherList', '.ws-commands',
  '.ws-tile', '.ws-tile[data-edge="true"], .ws-editor[data-edge="true"] .ws-symbol-button[aria-checked="true"]',
  '.ws-symbol, .ws-glyph', '.ws-row', '.ws-row-main',
  '.ws-row:hover .ws-row-main, .ws-row-main:focus-visible, .ws-row-main.on', '.ws-row-main:active',
  '.ws-row-name', '.ws-row-count', '.ws-row-main.on::after', '.ws-cmd', '.ws-cmd .ws-glyph',
];

/** The app's pure Spaces identity module (presets, symbols, paint), from its source. */
export function loadSpaceIdentity(source) {
  const module = { exports: {} };
  new Function('module', source)(module);
  const identity = module.exports;
  if (!identity?.SYMBOLS || typeof identity.paint !== 'function') throw new Error('Missing native Spaces identity');
  return identity;
}

const escapeHtml = text => String(text).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
// An inline SVG from a [tag, attributes] list on a 24×24 grid, as
// workspace-ui.js svgFrom (with a class) and renderer.js symbolSvg (without).
const svgMarkup = (elements, className) => `<svg viewBox="0 0 24 24" aria-hidden="true"${className ? ` class="${className}"` : ''}>${
  elements.map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([key, value]) => `${key}="${value}"`).join(' ')}/>`).join('')}</svg>`;

// The resting Island in a space, with the Spaces menu open below its mark.
// `spaces` are sample records {name, color, symbol, tabs, domain, favicon};
// the first is current. Each row is a real button carrying what the demo
// script needs to repaint the mark (fill, symbol ink, edge per appearance)
// and the pill (dots, favicon, domain) when it is chosen.
export function nativeSpacesArt({ styles, document, renderer, overlay, workspaceUi, identity, spaces, newSpaceLabel }) {
  const pill = nativeIslandArt({ styles, document, renderer, extraSelectors: SPACE_MARK_SELECTORS });
  const { take } = nativeRules(styles);
  const css = `${pill.css}\n${SPACES_MENU_SELECTORS.map(take).join('\n')}`;
  const painted = spaces.map(space => {
    const light = identity.paint(space.color, 'light'), dark = identity.paint(space.color, 'dark');
    if (!light || !dark) throw new Error(`Spaces demo: invalid colour ${space.color}`);
    if (!identity.isSymbol(space.symbol)) throw new Error(`Spaces demo: unknown symbol ${space.symbol}`);
    return { ...space, fill: light.fill, on: light.on, edge: { light: light.edge, dark: dark.edge } };
  });
  const current = painted[0];

  let html = pill.html;
  const set = (from, to) => {
    if (!html.includes(from)) throw new Error(`Missing native Spaces markup: ${from}`);
    html = html.replace(from, to);
  };
  set('<button id="pillSpace" class="space-mark" type="button" aria-haspopup="dialog" aria-expanded="false" data-state="none" hidden>',
    `<button id="pillSpace" class="space-mark" type="button" aria-haspopup="dialog" aria-expanded="true" data-state="space" data-edge="${current.edge.light}" style="--space-fill:${current.fill};--space-on:${current.on}">`);
  set('<span id="pillSpaceSymbol" class="space-mark-symbol" aria-hidden="true"></span>',
    `<span id="pillSpaceSymbol" class="space-mark-symbol" aria-hidden="true">${svgMarkup(identity.SYMBOLS[current.symbol])}</span>`);
  set('<span id="pillSpaceName" class="space-mark-name"></span>', `<span id="pillSpaceName" class="space-mark-name">${escapeHtml(current.name)}</span>`);
  html = html.replace(/<div id="pillDots">[\s\S]*?<\/div>/, `<div id="pillDots">${Array.from({ length: current.tabs }, (_, i) => `<button class="island-dot${i === 0 ? ' active' : ''}"></button>`).join('')}</div>`);
  set('background-image:url(/favicon.svg)', `background-image:url(${current.favicon})`);
  set('<span id="pillDomain">blanc.day</span>', `<span id="pillDomain">${escapeHtml(current.domain)}</span>`);
  // No blocked count is claimed for sample pages.
  set('<span id="pillShieldCount">1</span>', '<span id="pillShieldCount"></span>');
  set('id="pillShield" class="shield"', 'id="pillShield" class="shield shield-quiet"');

  // overlay.html's menu: a list, then the commands pinned below it.
  if (!/<div id="workspaceSwitcher" class="ws-switcher"[^>]*>\s*<div id="workspaceSwitcherList"><\/div>\s*<div id="workspaceSwitcherCommands" class="ws-commands" hidden><\/div>\s*<\/div>/.test(overlay)) {
    throw new Error('Missing native Spaces menu markup');
  }
  const plus = workspaceUi.match(/\bplus: \[\['path', \{ d: '([^']+)' \}\]\]/)?.[1];
  if (!plus) throw new Error('Missing native Spaces glyph: plus');
  const rows = painted.map((space, index) => {
    const on = index === 0;
    return `<div class="workspace-row ws-row"><button type="button" class="ws-row-main${on ? ' on' : ''}" aria-pressed="${on}" aria-label="${escapeHtml(`${space.name}, ${space.tabs} tabs`)}"`
      + ` data-fill="${space.fill}" data-on="${space.on}" data-edge-light="${space.edge.light}" data-edge-dark="${space.edge.dark}"`
      + ` data-tabs="${space.tabs}" data-domain="${escapeHtml(space.domain)}" data-favicon="${escapeHtml(space.favicon)}">`
      + `<span class="ws-tile" style="--space-fill:${space.fill};--space-on:${space.on}" data-edge="${space.edge.light}">${svgMarkup(identity.SYMBOLS[space.symbol], 'ws-symbol')}</span>`
      + `<span class="ws-row-name">${escapeHtml(space.name)}</span><span class="ws-row-count">${space.tabs}</span></button></div>`;
  }).join('');
  // New space… is shown, not offered: the demo has no editor behind it.
  const command = `<div class="ws-cmd" aria-hidden="true">${svgMarkup([['path', { d: plus }]], 'ws-glyph')}${escapeHtml(newSpaceLabel)}</div>`;
  const menu = `<div id="workspaceSwitcher" class="ws-switcher" role="group" aria-label="Sample spaces"><div id="workspaceSwitcherList">${rows}</div>`
    + `<div id="workspaceSwitcherCommands" class="ws-commands">${command}</div></div>`;
  return { css, pill: html, menu };
}

// A whole Blanc window for the feature pages' resting-Island figures: the
// strip with the resting Island in one tab state, the page below it, and
// optionally the shield popover open (overlay.html) or the vertical tab rail
// (index.html #verticalTabsRail). Each piece is the app's own markup and CSS;
// renderer.js and vertical-tabs.js decide which pieces show for the state:
//
//   tab.url      'https://host/…' for a site, 'blanc://newtab/' for a new tab
//                (placeholder label, the / keycap, no favicon or shield)
//   tab.favicon  the site's icon URL
//   tab.private  a private tab: the private theme, chip and hollow dots
//   tab.shield   'quiet' (nothing blocked) or a blocked count, for a site
//   dots         {count, active} for the active group's tabs
//   popover      {host, count, mark}: the Site protection summary, open
//   rail         {tabs: [{title, favicon}], active}: vertical tabs on, with
//                vertical-tabs.js as `verticalTabs` and panel-left.svg's URL
//
// The strip and the page are laid out at desktop size; the figure scales the
// whole window to fit (NativeWindowFigure.astro). Strings come from the
// interface catalog (`messages`, copy/messages/en.json).
export function nativeWindowArt({ styles, document, renderer, overlay, verticalTabs, messages, tab, dots, popover, rail, panelLeft }) {
  const t = key => {
    const message = messages[key]?.message;
    if (!message) throw new Error(`Missing interface string: ${key}`);
    return message;
  };
  const internal = tab.url.startsWith('blanc://');
  const host = internal ? '' : new URL(tab.url).host;
  if (tab.shield != null && !host) throw new Error('Native window: only a site shows the shield');
  if (popover && (tab.shield == null || tab.private)) throw new Error('Native window: the popover opens from a regular tab’s shield');

  const extraSelectors = [
    '#strip', '.island-dot.private', '.island-dot.private.active', '#islandPill #pillFavicon.internal',
    '#pillDomain.placeholder',
    '#pillPrivateChip, #pillSourceChip', '#pillPrivateChip', '#pillPrivateChip svg',
    ...(popover ? SHIELD_OPEN_SELECTORS : []),
  ];
  const pill = nativeIslandArt({ styles, document, renderer, extraSelectors });
  const { rules, take, scoped } = nativeRules(styles);
  const css = [pill.css,
    // The placeholder's shimmer is motion; a still figure draws its
    // reduced-motion state.
    scoped('#pillDomain.placeholder', { last: true }),
    scoped(':root[data-theme="private"]'),
    ...(rail ? [scoped(':root[data-tab-layout="vertical"] #strip'), scoped(':root[data-tab-layout="vertical"] #pillDots'),
      scoped(':root[data-tab-layout="vertical"] #pillNewTab'), scoped(':root[data-theme="private"] .vertical-tabs-rail::after'),
      scoped('body.mac .vertical-tabs-toolbar'),
      ...[...new Set(rules.map(rule => rule.selector).filter(selector => /^\.vertical-tab/.test(selector)))].map(take)] : []),
  ];

  let html = pill.html;
  const set = (from, to) => {
    if (!html.includes(from)) throw new Error(`Missing native window markup: ${from}`);
    html = html.replace(from, to);
  };
  const icon = key => rendererIcon(renderer, key);
  // renderer.js: a fresh tab has nowhere to go back to.
  html = html.replace(/<div id="pillNav" class="pill-btns">[\s\S]*?<\/div>/,
    `<div id="pillNav" class="pill-btns"><button class="pill-btn"${internal ? ' disabled' : ''}>${icon('back')}</button><button class="pill-btn" disabled>${icon('forward')}</button></div>`);
  html = html.replace(/<div id="pillDots">[\s\S]*?<\/div>/, `<div id="pillDots">${Array.from({ length: dots.count }, (_, i) =>
    `<button class="island-dot${i === dots.active ? ' active' : ''}${tab.private ? ' private' : ''}"></button>`).join('')}</div>`);
  if (internal) {
    // setFavicon: an internal page's mark, which the resting Island hides;
    // renderPillLabel: the placeholder and the / keycap.
    set(' class="favicon has-icon" style="background-image:url(/favicon.svg)"', ' class="favicon internal"');
    set('<span id="pillDomain">blanc.day</span>', `<span id="pillDomain" class="placeholder">${escapeHtml(t('pill.placeholder'))}</span>`);
    html = html.replace(/(<button id="pillSlash"[^>]*?) hidden>/, '$1>');
  } else {
    set('style="background-image:url(/favicon.svg)"', `style="background-image:url(${tab.favicon})"`);
    set('<span id="pillDomain">blanc.day</span>', `<span id="pillDomain">${escapeHtml(host)}</span>`);
  }
  if (tab.private) html = html.replace(/(<button id="pillPrivateChip"[^>]*?) hidden>/, '$1>');
  // shield-model.js: no blockable host hides the chip; nothing blocked is quiet.
  if (tab.shield == null) set('id="pillShield" class="shield" aria-expanded="false"', 'id="pillShield" class="shield" aria-expanded="false" hidden');
  else if (tab.shield === 'quiet') set('id="pillShield" class="shield"', 'id="pillShield" class="shield shield-quiet"');
  set('<span id="pillShieldCount">1</span>', `<span id="pillShieldCount">${typeof tab.shield === 'number' ? tab.shield : ''}</span>`);
  if (popover) {
    set('id="islandPill" class="no-drag"', 'id="islandPill" class="no-drag shield-open"');
    set('id="pillShield" class="shield" aria-expanded="false"', 'id="pillShield" class="shield" aria-expanded="true"');
  }

  let railHtml = '';
  if (rail) {
    const start = document.indexOf('<aside id="verticalTabsRail"');
    const end = document.indexOf('</aside>', start);
    if (start < 0 || end < start) throw new Error('Missing native vertical tabs markup');
    railHtml = stripInterfaceKeys(document.slice(start, end + '</aside>'.length));
    const setRail = (from, to) => {
      if (!railHtml.includes(from)) throw new Error(`Missing native vertical tabs markup: ${from}`);
      railHtml = railHtml.replace(from, to);
    };
    setRail('class="vertical-tabs-rail no-drag" aria-label="Vertical tabs" hidden>', 'class="vertical-tabs-rail no-drag" aria-label="Vertical tabs">');
    const close = verticalTabs.match(/\bclose: '(<svg[^']+)'/)?.[1];
    if (!close) throw new Error('Missing native vertical tabs icon: close');
    // vertical-tabs.js renderNow: no pins, so one Tabs section (staticBucket)
    // of rows (tabRow), each a favicon and title with its close button.
    const rows = rail.tabs.map((row, i) => `<div class="vertical-tab-row${i === rail.active ? ' active' : ''}" role="listitem">`
      + `<button type="button" class="vertical-tab-primary"><span class="favicon vertical-tab-favicon has-icon" aria-hidden="true" style="background-image:url(${row.favicon})"></span>`
      + `<span class="vertical-tab-title" aria-hidden="true"><span class="vertical-tab-title-text">${escapeHtml(row.title)}</span></span></button>`
      + `<button type="button" class="vertical-tab-close">${close}</button></div>`).join('');
    setRail('role="list" aria-label="Open tabs"></div>', `role="list" aria-label="Open tabs"><section class="vertical-tabs-section" role="group" aria-label="${escapeHtml(t('rail.section.tabs'))}">`
      + `<h2 class="vertical-tabs-section-heading">${escapeHtml(t('rail.section.tabs'))}<span>${rail.tabs.length}</span></h2>${rows}</section></div>`);
    setRail('<kbd id="verticalTabsNewShortcut"></kbd>', '<kbd id="verticalTabsNewShortcut">⌘T</kbd>');
    const layoutIcon = css.findIndex(rule => rule.startsWith('.vertical-tabs-layout-icon {'));
    if (layoutIcon < 0 || !css[layoutIcon].includes('url("panel-left.svg")')) throw new Error('Missing native vertical tabs icon');
    css[layoutIcon] = css[layoutIcon].replaceAll('url("panel-left.svg")', `url("${panelLeft}")`);
  }

  let popoverHtml = '', popoverCss = '';
  if (popover) {
    const art = nativeShieldPopoverArt({ styles, overlay, mark: popover.mark, step: 'summary', host: popover.host, count: popover.count });
    popoverHtml = `<div class="native-shield-view">${art.html}</div>`;
    popoverCss = art.css;
  }
  return { css: `${css.join('\n')}\n${popoverCss}`, strip: `<div id="strip">${html}</div>`, rail: railHtml, popover: popoverHtml };
}
