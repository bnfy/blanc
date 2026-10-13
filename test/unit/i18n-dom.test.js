'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const i18n = require('../../src/renderer/pages/i18n');

// Minimal fake DOM: just what the applier touches.
function element(tag, { dataset = {}, children = [], text = '' } = {}) {
  const el = {
    tagName: tag, dataset, attributes: {}, children, ownerDocument: null, _text: text, _nodes: null,
    setAttribute(name, value) { this.attributes[name] = String(value); },
    get textContent() { return this._nodes ? this._nodes.map((n) => n.textContent ?? n.data).join('') : this._text; },
    set textContent(value) { this._text = String(value); this._nodes = null; },
    replaceChildren(...nodes) { this._nodes = nodes; },
  };
  return el;
}
function documentWith(elements, { readyState = 'complete' } = {}) {
  const listeners = {};
  const doc = {
    readyState,
    documentElement: { lang: 'en', dir: '', style: { visibility: '' } },
    querySelectorAll: () => elements,
    createTextNode: (data) => ({ data }),
    addEventListener: (type, fn) => { listeners[type] = fn; },
    fire: (type) => listeners[type]?.(),
  };
  for (const el of elements) el.ownerDocument = doc;
  return doc;
}

test('applyDocument sets text and every supported attribute', () => {
  const t = i18n.createTranslator({ locale: 'de', messages: {
    'a.label': 'Sprache', 'a.title': 'Titel', 'a.aria': 'Bezeichnung', 'a.ph': 'Suchen', 'a.alt': 'Bild', 'a.tip': 'Tipp',
  } });
  const el = element('span', { dataset: {
    i18n: 'a.label', i18nTitle: 'a.title', i18nAriaLabel: 'a.aria', i18nPlaceholder: 'a.ph', i18nAlt: 'a.alt', i18nTooltip: 'a.tip',
  }, text: 'Language' });
  i18n.applyDocument(documentWith([el]), t);
  assert.equal(el.textContent, 'Sprache');
  assert.deepEqual(el.attributes, {
    title: 'Titel', 'aria-label': 'Bezeichnung', placeholder: 'Suchen', alt: 'Bild', 'data-tooltip': 'Tipp',
  });
});

test('rich messages map numbered tags onto existing children, keeping the elements', () => {
  const link = element('a', { text: 'Fill logins' });
  const p = element('p', { dataset: { i18n: 'rich' }, children: [link] });
  const t = i18n.createTranslator({ locale: 'de', messages: { rich: 'Aktiviere <0>Logins ausfüllen</0> in den Einstellungen' } });
  i18n.applyDocument(documentWith([p]), t);
  assert.equal(link.textContent, 'Logins ausfüllen');
  assert.equal(p._nodes[1], link, 'the same child element is reused');
  assert.equal(p.textContent, 'Aktiviere Logins ausfüllen in den Einstellungen');
});

test('a rich message naming a missing child throws', () => {
  const p = element('p', { dataset: { i18n: 'rich' }, children: [] });
  const t = i18n.createTranslator({ locale: 'en', messages: { rich: 'a <0>b</0>' } });
  assert.throws(() => i18n.applyDocument(documentWith([p]), t), /no child element/);
});

test('bootstrap sets lang and dir, hides non-English documents until applied, then reveals', () => {
  const el = element('span', { dataset: { i18n: 'k' }, text: 'Language' });
  const doc = documentWith([el], { readyState: 'loading' });
  const scope = {
    document: doc, console: { warn() {} }, setTimeout: () => {},
    blancStrings: { locale: 'de', dir: 'ltr', formatLocale: 'de-AT', messages: { k: 'Sprache' }, fallback: {} },
  };
  const api = require('../../src/renderer/pages/i18n');
  api.bootstrap(scope);
  assert.equal(doc.documentElement.lang, 'de');
  assert.equal(doc.documentElement.dir, 'ltr');
  assert.equal(doc.documentElement.style.visibility, 'hidden');
  assert.equal(el.textContent, 'Language', 'nothing applied before DOMContentLoaded');
  doc.fire('DOMContentLoaded');
  assert.equal(el.textContent, 'Sprache');
  assert.equal(doc.documentElement.style.visibility, '');
  assert.equal(api.formatLocale(), 'de-AT');
  assert.equal(api.t('k'), 'Sprache');
});

test('text a page renders before DOMContentLoaded survives the static pass', () => {
  // The 1.32.0 packaged first-run smoke: the start page rendered "Blocking
  // could not start." from an IPC reply, then DOMContentLoaded put the static
  // "Preparing blocking…" back while the Retry buttons stayed visible.
  const title = element('h2', { dataset: { i18n: 'preparing' }, text: 'Preparing blocking…' });
  const later = element('p', { dataset: { i18n: 'later' }, text: 'Later' });
  const elements = [title];
  const doc = documentWith(elements, { readyState: 'loading' });
  const api = require('../../src/renderer/pages/i18n');
  api.bootstrap({
    document: doc, setTimeout: () => {},
    blancStrings: { locale: 'de', dir: 'ltr', messages: {
      preparing: 'Blockierung wird vorbereitet…', failed: 'Blockierung konnte nicht starten.', later: 'Später',
    }, fallback: {} },
  });
  title.textContent = api.t('failed');
  elements.push(later);
  later.ownerDocument = doc;
  doc.fire('DOMContentLoaded');
  assert.equal(title.textContent, 'Blockierung konnte nicht starten.', 'the rendered text is kept');
  assert.equal(later.textContent, 'Später', 'elements parsed after the first lookup are still translated');
  assert.equal(api.t.has('failed'), true);
  assert.equal(api.t.locale, 'de');
});

test('lookups before DOMContentLoaded rescan only after the document grows', () => {
  const first = element('span', { dataset: { i18n: 'a' }, text: 'A' });
  const second = element('span', { dataset: { i18n: 'b' }, text: 'B' });
  const elements = [first];
  const all = { length: 1 };
  let scans = 0;
  const doc = documentWith(elements, { readyState: 'loading' });
  doc.querySelectorAll = () => { scans += 1; return elements; };
  doc.getElementsByTagName = () => all;
  const api = require('../../src/renderer/pages/i18n');
  api.bootstrap({
    document: doc, setTimeout: () => {},
    blancStrings: { locale: 'de', dir: 'ltr', messages: { a: 'Ä', b: 'Ö' }, fallback: {} },
  });
  api.t('a');
  api.parts('a');
  assert.equal(scans, 1);
  assert.equal(first.textContent, 'Ä');
  elements.push(second);
  second.ownerDocument = doc;
  all.length = 2;
  api.t('a');
  assert.equal(scans, 2);
  assert.equal(second.textContent, 'Ö');
  doc.fire('DOMContentLoaded');
  api.t('a');
  assert.equal(scans, 3, 'DOMContentLoaded scans once more, later lookups never');
});

test('bootstrap never hides an English document', () => {
  const doc = documentWith([]);
  require('../../src/renderer/pages/i18n').bootstrap({
    document: doc, setTimeout: () => {},
    blancStrings: { locale: 'en', dir: 'ltr', messages: {}, fallback: {} },
  });
  assert.equal(doc.documentElement.style.visibility, '');
});

test('bootstrap reveals the document even when applying throws', () => {
  const p = element('p', { dataset: { i18n: 'rich' }, children: [] });
  const doc = documentWith([p]);
  const api = require('../../src/renderer/pages/i18n');
  assert.throws(() => api.bootstrap({
    document: doc, setTimeout: () => {},
    blancStrings: { locale: 'de', dir: 'ltr', messages: { rich: 'a <0>b</0>' }, fallback: {} },
  }));
  assert.equal(doc.documentElement.style.visibility, '');
});

test('strict mode turns a missing key into an exception', () => {
  const el = element('span', { dataset: { i18n: 'absent' } });
  const api = require('../../src/renderer/pages/i18n');
  assert.throws(() => api.bootstrap({
    document: documentWith([el]), setTimeout: () => {},
    blancStrings: { locale: 'en', dir: 'ltr', messages: {}, fallback: {}, strict: true },
  }), /missing interface string: absent/);
});
