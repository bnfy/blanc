'use strict';
// Phase 2b chrome surfaces: the permission prompt and the 1Password fill
// capsule take their text from the interface catalog (F44).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createTranslator } = require('../../src/renderer/pages/i18n.js');

const renderer = path.resolve(__dirname, '../../src/renderer');
const translator = (locale) => {
  const data = require(`../../src/renderer/pages/strings.${locale}.js`);
  return createTranslator({ locale, messages: data.messages, fallback: data.fallback });
};

// permission.js is a browser IIFE; lift its pure host helper.
function liftElideHost() {
  const source = fs.readFileSync(path.join(renderer, 'permission.js'), 'utf8');
  const fn = source.match(/function elideHost\(host\) \{[\s\S]*?\n {2}\}/)?.[0];
  assert.ok(fn, 'lift found elideHost in permission.js');
  return new Function(`${fn}; return elideHost;`)();
}

test('a short permission host is shown whole', () => {
  const elideHost = liftElideHost();
  assert.equal(elideHost('meet.google.com'), 'meet.google.com');
});

test('a long permission host is shortened from the start, keeping the registrable domain', () => {
  const elideHost = liftElideHost();
  const host = 'accounts.google.com.secure-login.verification.evil.example';
  const shown = elideHost(host);
  assert.ok(shown.length <= 32, shown);
  assert.ok(shown.startsWith('…'), shown);
  assert.ok(host.endsWith(shown.slice(1)), 'the end of the host is kept verbatim');
  assert.ok(shown.endsWith('evil.example'));
});

test('every permission prompt names the host in tag 0 and the request in full', () => {
  for (const locale of ['en', 'de']) {
    const t = translator(locale);
    for (const key of ['cameraMicrophone', 'camera', 'microphone', 'geolocation', 'notifications']) {
      const parts = t.parts(`permission.prompt.${key}`, { host: 'example.com' });
      assert.deepEqual(parts.filter((p) => p.tag !== undefined), [{ tag: 0, text: 'example.com' }], `${locale} ${key}`);
      assert.ok(parts.some((p) => p.tag === undefined && /\p{L}{3}/u.test(p.text)), `${locale} ${key} has request text`);
    }
  }
});

test('the fill copy table is built from the catalog and keeps its shape', () => {
  const { fillCopy, FILL_COPY } = require('../../src/renderer/fill-status-copy');
  const en = fillCopy(translator('en'));
  assert.deepEqual(FILL_COPY, en, 'the exported English table is the catalog English');
  assert.equal(en['setup-enable'].primaryLabel, 'Open Settings');
  assert.equal(en.filled.body, '', 'success notice stays title-only');
  const de = fillCopy(translator('de'));
  assert.equal(de['confirm-heuristic'].title, 'Dieses Anmeldeformular ausfüllen?');
  assert.deepEqual(Object.keys(de).sort(), Object.keys(en).sort());
});

test('every fill kind resolves every key in every language (strict: a missing key throws)', () => {
  const { fillCopy } = require('../../src/renderer/fill-status-copy');
  for (const locale of ['en', 'de']) {
    const data = require(`../../src/renderer/pages/strings.${locale}.js`);
    const strict = createTranslator({
      locale, messages: data.messages, fallback: {},
      onMissing: (key) => { throw new Error(`${locale} missing ${key}`); },
    });
    assert.doesNotThrow(() => fillCopy(strict), locale);
  }
});

test('the fill capsule and its native fallback never use a hard-coded table', () => {
  const capsule = fs.readFileSync(path.join(renderer, 'fill-status.js'), 'utf8');
  assert.match(capsule, /window\.blancFillCopy/);
  const main = fs.readFileSync(path.join(__dirname, '../../src/main/main.js'), 'utf8');
  const fallback = main.match(/async function showFillFallbackDialog[\s\S]*?\n\}/)?.[0];
  assert.ok(fallback, 'lift found showFillFallbackDialog');
  assert.match(fallback, /fillCopy\(mainI18n\.t\)\[kind\]/);
  assert.match(fallback, /mainI18n\.t\('dialog\.ok'\)/);
});
