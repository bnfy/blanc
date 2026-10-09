'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

let scan;
test.before(async () => { scan = await import('../../copy/lib/scan-source.mjs'); });
const en = { 'a.title': { message: 'Settings', note: 'n' }, 'a.rich': { message: 'Turn on <0>Fill</0> now', note: 'n' } };

test('HTML: untagged text node fails; tagged, ignored, svg and symbol-only text pass', () => {
  const bad = scan.scanHtml('<p>Hello there</p>', { en, allow: [] });
  assert.equal(bad.problems.length, 1);
  assert.ok(bad.scanned >= 1);
  const good = scan.scanHtml([
    '<h1 data-i18n="a.title">Settings</h1>',
    '<span data-i18n-ignore>example.com</span>',
    '<svg><title>icon</title></svg>',
    '<button>✕</button>',
    '<p data-i18n="a.rich">Turn on <a href="#">Fill</a> now</p>',
  ].join(''), { en, allow: [] });
  assert.deepEqual(good.problems, []);
  assert.ok(good.scanned >= 4);
});

test('HTML: entities decode exactly once when comparing inline English', () => {
  const amp = { 'a.lt': { message: 'Tom &lt; Jerry', note: 'n' } };
  assert.deepEqual(scan.scanHtml('<p data-i18n="a.lt">Tom &amp;lt; Jerry</p>', { en: amp, allow: [] }).problems, []);
  assert.match(scan.scanHtml('<p data-i18n="a.lt">Tom &lt; Jerry</p>', { en: amp, allow: [] }).problems.join(), /differs/);
});

test('HTML: inline English of rich text comes from its text, not from stripping markup', () => {
  const rich = { 'a.rich': { message: 'Open <0>Settings</0> or <1>Help</1>', note: 'n' } };
  const html = '<p data-i18n="a.rich">Open <a href="#"><b>Settings</b></a> or <a href="#">Help</a></p>';
  assert.deepEqual(scan.scanHtml(html, { en: rich, allow: [] }).problems, []);
});

test('HTML: attribute without data-i18n counterpart fails', () => {
  const r = scan.scanHtml('<button aria-label="Close tab">✕</button>', { en, allow: [] });
  assert.match(r.problems.join(), /aria-label/);
});

test('HTML: inline English that differs from en.json fails', () => {
  const r = scan.scanHtml('<h1 data-i18n="a.title">Preferences</h1>', { en, allow: [] });
  assert.match(r.problems.join(), /differs from en.json/);
});

test('HTML: unknown data-i18n key fails', () => {
  assert.match(scan.scanHtml('<h1 data-i18n="a.nope">x</h1>', { en, allow: [] }).problems.join(), /unknown key/);
});

test('JS renderer: literal assignments fail, t() calls and allowlisted literals pass', () => {
  const bad = scan.scanJs([
    "el.textContent = 'Close tab';",
    'el.title = `Open ${name}`;',
    "el.setAttribute('aria-label', 'Back');",
  ].join('\n'), { allow: [], kind: 'renderer' });
  assert.equal(bad.problems.length, 3);
  const good = scan.scanJs([
    "el.textContent = blancI18n.t('a.title');",
    "el.textContent = '✕';",
    "el.textContent = 'internal';",
    'el.textContent = value;',
  ].join('\n'), { allow: ['internal'], kind: 'renderer' });
  assert.deepEqual(good.problems, []);
  assert.equal(good.scanned, 4);
});

test('JS main: menu/dialog literals fail', () => {
  const r = scan.scanJs("{ label: 'Reload', click }\ndialog.showMessageBox({ message: 'Update ready', buttons: ['Restart Now'] })",
    { allow: [], kind: 'main' });
  assert.equal(r.problems.length, 3);
});

test('JS: a t() call naming a key missing from en.json fails', () => {
  const r = scan.scanJs("el.textContent = blancI18n.t('a.missing');\nx = mainI18n.t('a.title');", { allow: [], kind: 'renderer', en });
  assert.equal(r.problems.length, 1);
  assert.match(r.problems[0], /a\.missing/);
});

test('JS: unknown keys are caught in every literal and call form', () => {
  for (const call of [
    "blancI18n.t('a.missing')", 'blancI18n.t("a.missing")', 'blancI18n.t(`a.missing`)',
    "blancI18n.t?.('a.missing')", "t('a.missing', { n })", 't?.("a.missing")',
    "mainI18n.parts('a.missing')", "blancI18n.parts?.(`a.missing`)",
  ]) {
    const r = scan.scanJs(`x = ${call};`, { allow: [], kind: 'renderer', en });
    assert.deepEqual(r.problems, ["unknown key 'a.missing'"], call);
  }
  for (const call of ["blancI18n.t('a.title')", 'blancI18n.t("a.title")', 'mainI18n.t?.(`a.title`)']) {
    assert.deepEqual(scan.scanJs(`x = ${call};`, { allow: [], kind: 'renderer', en }).problems, [], call);
  }
});

test('JS: an interpolated template key cannot be verified and fails unless allowlisted', () => {
  const js = 'x = blancI18n.t(`slash.${name}.hint`);';
  assert.match(scan.scanJs(js, { allow: [], kind: 'renderer', en }).problems.join(), /dynamic key/);
  assert.deepEqual(scan.scanJs(js, { allow: ['slash.${name}.hint'], kind: 'renderer', en }).problems, []);
});

test('JS: commented-out code is not scanned', () => {
  const r = scan.scanJs("// el.textContent = 'Close tab';\n/* el.title = 'x y' */", { allow: [], kind: 'renderer' });
  assert.deepEqual(r.problems, []);
});
