const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '../../site/src/scripts/site.js'), 'utf8');

function page(choice) {
  const local = new Map(choice ? [['measurement-consent-v2', choice]] : []);
  const session = new Map();
  let storageUnavailable = false;
  const storage = (map) => ({
    getItem(key) {
      if (storageUnavailable) throw new Error('Storage unavailable');
      return map.get(key) ?? null;
    },
    setItem: (key, value) => map.set(key, value),
    removeItem: (key) => map.delete(key),
  });
  const element = () => ({
    handlers: {}, hidden: true,
    classList: { add() {}, remove() {} },
    addEventListener(type, handler) { this.handlers[type] = handler; },
  });
  const banner = element();
  const allow = element();
  const deny = element();
  const links = ['mac-arm64', 'win'].map((platform) => ({
    href: `https://blancbrowser.com/dl/${platform}?keep=yes#download`,
    dataset: { platform, track: 'download_click', ctaPosition: 'platform-card' },
    closest() { return this; },
  }));
  const clickHandlers = [];
  const document = {
    head: { appendChild() {} }, body: { dataset: { page: 'download' } },
    createElement: () => ({}),
    getElementById: (id) => ({ consent: banner, consentAllow: allow, consentDeny: deny }[id]),
    querySelector: () => null,
    querySelectorAll(selector) {
      return selector.includes('data-download-link') ? links : [];
    },
    addEventListener(type, handler) { if (type === 'click') clickHandlers.push(handler); },
  };
  const context = vm.createContext({
    URL, document, window: {}, navigator: { userAgent: 'Macintosh' },
    location: { href: 'https://blancbrowser.com/download?oppref=offline-fixture', origin: 'https://blancbrowser.com', pathname: '/download' },
    localStorage: storage(local), sessionStorage: storage(session),
    fetch: async () => ({ ok: false }),
    setTimeout: () => 1, clearTimeout() {}, requestAnimationFrame() {},
  });
  vm.runInContext(source, context);
  return {
    links, local, session, context,
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
