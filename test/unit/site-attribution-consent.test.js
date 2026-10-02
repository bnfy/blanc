const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '../../site/src/scripts/site.js'), 'utf8');

function page(choice, { unavailable = false, writeFails = false, href = 'https://blancbrowser.com/download?oppref=offline-fixture' } = {}) {
  const local = new Map(choice ? [['measurement-consent-v2', choice]] : []);
  const session = new Map();
  let storageUnavailable = unavailable;
  let storageWriteFails = writeFails;
  const storage = (map) => ({
    getItem(key) {
      if (storageUnavailable) throw new Error('Storage unavailable');
      return map.get(key) ?? null;
    },
    setItem(key, value) { if (storageWriteFails || storageUnavailable) throw new Error('Storage unavailable'); map.set(key, value); },
    removeItem: (key) => map.delete(key),
  });
  const element = () => ({
    handlers: {}, hidden: true,
    focus() {}, setAttribute() {},
    classList: { add() {}, remove() {} },
    addEventListener(type, handler) { this.handlers[type] = handler; },
  });
  const banner = element();
  const allow = element();
  const deny = element();
  const close = element();
  const choiceButton = element();
  const status = element();
  const scripts = [];
  let reloads = 0;
  const location = { href, origin: 'https://blancbrowser.com', pathname: '/download', reload() { reloads++; } };
  const windowEvents = {};
  const links = ['mac-arm64', 'win'].map((platform) => ({
    href: `https://blancbrowser.com/dl/${platform}?keep=yes#download`,
    dataset: { platform, track: 'download_click', ctaPosition: 'platform-card' },
    closest() { return this; },
  }));
  const clickHandlers = [];
  const document = {
    head: { appendChild(script) { scripts.push(script); } }, body: { dataset: { page: 'download' } },
    createElement: element,
    getElementById: (id) => ({ consent: banner, consentAllow: allow, consentDeny: deny, consentClose: close, consentStatus: status }[id]),
    querySelector: () => null,
    querySelectorAll(selector) {
      return selector.includes('data-download-link') ? links : selector === '[data-consent-open]' ? [choiceButton] : [];
    },
    addEventListener(type, handler) { if (type === 'click') clickHandlers.push(handler); },
  };
  const context = vm.createContext({
    URL, document, window: { addEventListener(type, handler) { windowEvents[type] = handler; }, history: { replaceState(_state, _title, url) { location.href = url; } } }, navigator: { userAgent: 'Macintosh' },
    location,
    localStorage: storage(local), sessionStorage: storage(session),
    fetch: async () => ({ ok: false }),
    setTimeout: () => 1, clearTimeout() {}, requestAnimationFrame() {},
  });
  vm.runInContext(source, context);
  return {
    links, local, session, context, banner, scripts, status, location,
    googleScripts: () => scripts.filter(script => script.src && new URL(script.src).hostname === 'www.googletagmanager.com'),
    reloads: () => reloads,
    openChoice: () => choiceButton.handlers.click(),
    storageEvent: () => windowEvents.storage({ key: 'measurement-consent-v2' }),
    failWrites: () => { storageWriteFails = true; },
    allow: () => allow.handlers.click(),
    deny: () => deny.handlers.click(),
    click: (link = links[0]) => clickHandlers.forEach((handler) => handler({ target: link })),
    failStorage: () => { storageUnavailable = true; },
  };
}

test('a download requires Allow before forwarding the pending ad reference', () => {
  const p = page();
  p.click();
  assert.equal(new URL(p.links[0].href).searchParams.has('oppref'), false);
  p.allow();
  p.click();
  assert.equal(new URL(p.links[0].href).searchParams.get('oppref'), 'offline-fixture');
});

test('withdrawing consent immediately cleans already-used links and future clicks', () => {
  const p = page('granted');
  p.links.forEach(p.click);
  p.deny();
  assert.equal(p.session.has('openai-oppref'), false);
  for (const link of p.links) {
    assert.equal(new URL(link.href).searchParams.has('oppref'), false);
    assert.equal(new URL(link.href).searchParams.get('keep'), 'yes');
    assert.equal(new URL(link.href).hash, '#download');
    p.click(link);
    assert.equal(new URL(link.href).searchParams.has('oppref'), false);
  }
});

test('a changed saved choice removes a stale link reference on the next click', () => {
  const p = page('granted');
  p.click();
  p.local.set('measurement-consent-v2', 'denied');
  p.click();
  assert.equal(new URL(p.links[0].href).searchParams.has('oppref'), false);
});

test('unavailable consent storage does not leave a previously decorated download', () => {
  const p = page('granted');
  p.click();
  p.failStorage();
  assert.doesNotThrow(() => p.click());
  assert.equal(new URL(p.links[0].href).searchParams.has('oppref'), false);
});

test('granting again after withdrawal does not resurrect the discarded reference', () => {
  const p = page('granted');
  p.click(); p.deny(); p.allow(); p.click();
  assert.equal(new URL(p.links[0].href).searchParams.has('oppref'), false);
});

test('attribution never changes an external or non-download destination', () => {
  const p = page('granted');
  for (const href of ['https://example.com/dl/win?oppref=external', 'https://blancbrowser.com/privacy?keep=yes']) {
    p.links[0].href = href;
    p.click();
    assert.equal(p.links[0].href, href);
  }
});

test('unset, denied and inaccessible storage load no Google script or event queue and show no prompt', () => {
  for (const p of [page(), page('denied'), page('granted', { unavailable: true })]) {
    assert.equal(p.googleScripts().length, 0);
    assert.equal(p.context.window.gtag, undefined);
    assert.equal(p.banner.hidden, true);
    assert.ok(p.scripts.some(script => new URL(script.src).hostname === 'static.cloudflareinsights.com'));
    p.click();
    assert.equal(new URL(p.links[0].href).pathname, '/dl/mac-arm64');
    assert.equal(new URL(p.links[0].href).searchParams.has('oppref'), false);
  }
});

test('an explicit or saved grant loads Google exactly once', () => {
  const p = page();
  p.openChoice();
  assert.equal(p.banner.hidden, false);
  assert.equal(p.googleScripts().length, 0);
  p.allow(); p.allow();
  assert.equal(p.googleScripts().length, 1);
  assert.equal(page('granted').googleScripts().length, 1);
});

test('withdrawal denies, stops dispatch, clears references and reloads the granted library', () => {
  const p = page('granted');
  p.click();
  assert.ok(p.context.window.dataLayer.length > 0);
  p.deny(); p.click();
  p.context.window.gtag('event', 'late-event');
  assert.equal(p.local.get('measurement-consent-v2'), 'denied');
  assert.equal(p.context.window['ga-disable-G-MN8BLY6GE9'], true);
  assert.equal(p.context.window.dataLayer.length, 0);
  assert.equal(p.reloads(), 1);
  assert.equal(new URL(p.location.href).searchParams.has('oppref'), false);
  const reloaded = page('denied', { href: p.location.href });
  reloaded.allow(); reloaded.click();
  assert.equal(new URL(reloaded.links[0].href).searchParams.has('oppref'), false);
});

test('a grant that cannot be stored fails closed and leaves downloads working', () => {
  const p = page(undefined, { writeFails: true });
  p.openChoice(); p.allow(); p.click();
  assert.equal(p.googleScripts().length, 0);
  assert.equal(p.banner.hidden, false);
  assert.match(p.status.textContent, /Could not save/);
  assert.equal(new URL(p.links[0].href).searchParams.has('oppref'), false);
});

test('failed denial storage still stops this page and discards the reference', () => {
  const p = page('granted');
  p.click(); p.failWrites(); p.deny(); p.click();
  assert.equal(new URL(p.links[0].href).searchParams.has('oppref'), false);
  assert.equal(p.context.window.dataLayer.length, 0);
  assert.match(p.status.textContent, /could not be saved/);
});

test('withdrawal in another tab disables this page and reloads', () => {
  const p = page('granted');
  p.local.set('measurement-consent-v2', 'denied'); p.storageEvent(); p.click();
  assert.equal(p.reloads(), 1);
  assert.equal(p.context.window.dataLayer.length, 0);
  assert.equal(new URL(p.links[0].href).searchParams.has('oppref'), false);
});
