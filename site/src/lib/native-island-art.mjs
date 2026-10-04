// Build-time extraction only. Native renderer code is never executed on the site.
// Fail if the native anatomy changes instead of silently shipping a hand-drawn substitute.
export function nativeIslandArt({ styles, document, renderer }) {
  const clean = styles.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [...clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({
    selector: selector.trim().replace(/\s+/g, ' '), body,
  }));
  const take = selector => {
    const rule = rules.find(rule => rule.selector === selector);
    if (!rule) throw new Error(`Missing native Island rule: ${selector}`);
    return `${selector} {${rule.body}}`;
  };
  const selectors = [
    '*', 'button', 'button svg', '#islandPill', '#islandPill::after', '#pillDots',
    '.pill-btns', '.pill-btn', '.pill-btn:disabled', '.pill-btn svg', '.pill-sep',
    '.island-dot', '.island-dot.active', '#pillDomain', '.pill-shortcuts',
    '.pill-slash, .pill-shortcut', '.pill-slash::before, .pill-shortcut::before',
    '.pill-shortcut svg', '.shield', '.shield-art', '#pillShieldCount:empty',
    '.shield.shield-quiet', '.favicon', '.favicon.has-icon', '#pillFavicon',
  ];
  const root = rules.filter(rule => rule.selector === ':root');
  if (root.length < 2) throw new Error('Missing native light/dark tokens');
  const css = `:host {${root[0].body}}\n:host([data-appearance="dark"]) {${root[1].body}}\n${selectors.map(take).join('\n')}`;
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
  html = html.replace('<span id="pillDomain">new tab</span>', '<span id="pillDomain">blancbrowser.com</span>');
  html = html.replace(/(<button id="pillSlash"[\s\S]*?<\/button>)/, `$1<button id="pillNewTab" class="pill-btn pill-shortcut">${icon('plus')}</button>`);
  html = html.replace('id="pillShield" class="shield" aria-expanded="false" hidden', 'id="pillShield" class="shield shield-quiet" aria-expanded="false"');
  html = html.replace('src="shield-horizon.png"', 'src="/horizon-shield.webp"');
  html = html.replace('<div id="pillActions" class="pill-btns"></div>', `<div id="pillActions" class="pill-btns">${button('reload')}${button('heart')}${button('close')}</div>`);
  return { css, html };
}
