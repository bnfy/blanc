// Build-time extraction only. Native renderer code is never executed on the site.
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
  return { rules, take, tokens };
}

export function nativeIslandArt({ styles, document, renderer, extraSelectors = [] }) {
  const { take, tokens } = nativeRules(styles);
  const selectors = [
    '*', 'button', 'button svg', '#islandPill', '#islandPill::after', '#pillDots',
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
  const icon = key => {
    const value = renderer.match(new RegExp(`\\b${key}: '(<svg[^']+)'`))?.[1];
    if (!value) throw new Error(`Missing native Island icon: ${key}`);
    return value;
  };
  const button = (key, extra = '') => `<button class="pill-btn" ${extra}>${icon(key)}</button>`;
  let html = document.slice(start, end).trim();
  html = html.replace('<div id="pillNav" class="pill-btns"></div>',
    `<div id="pillNav" class="pill-btns">${button('back')}${button('forward', 'disabled')}</div>`);
  html = html.replace('<div id="pillDots"></div>', `<div id="pillDots">${[0, 1, 2, 3, 4].map(i => `<button class="island-dot${i === 2 ? ' active' : ''}"></button>`).join('')}</div>`);
  html = html.replace('id="pillFavicon" class="favicon"', 'id="pillFavicon" class="favicon has-icon" style="background-image:url(/favicon.svg)"');
  const domain = /<span id="pillDomain"[^>]*>new tab<\/span>/;
  if (!domain.test(html)) throw new Error('Missing native Island markup: #pillDomain');
  html = html.replace(domain, '<span id="pillDomain">blancbrowser.com</span>');
  html = html.replace(/(<button id="pillSlash"[\s\S]*?<\/button>)/, `$1<button id="pillNewTab" class="pill-btn pill-shortcut">${icon('plus')}</button>`);
  // Match the owner's October 3 reference: original ink shield with a one-count badge.
  // This is a fixed illustration state, not a measurement of this website.
  html = html.replace('id="pillShield" class="shield" aria-expanded="false" hidden', 'id="pillShield" class="shield" aria-expanded="false"');
  html = html.replace('<span id="pillShieldCount"></span>', '<span id="pillShieldCount">1</span>');
  html = html.replace('<div id="pillActions" class="pill-btns"></div>', `<div id="pillActions" class="pill-btns">${button('reload')}${button('heart')}${button('close')}</div>`);
  return { css, html };
}

// Rules the resting Island adds while its shield popover is open.
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
  let html = overlay.slice(start, end + '</section>'.length);
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
