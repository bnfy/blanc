'use strict';
// #1634 follow-up: a local HTML file the static preview refuses says why, in
// the interface language, from the reason code the preview attached.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createTranslator } = require('../../src/renderer/pages/i18n.js');
const { REASON_KEYS, refusalReason, localHtmlRefusalMessage } = require('../../src/main/local-html-refusal');
const { REFUSALS } = require('../../src/main/local-html-preview');

const translator = locale => createTranslator({ locale,
  messages: require(`../../src/renderer/pages/strings.${locale}.js`).messages });
const t = translator('en');
const refusal = reason => Object.assign(new Error('English for logs'), { localHtmlRefusal: reason });
const file = name => path.join(path.sep, 'Users', 'someone', name);

test('every reason the preview can give has its own message', () => {
  assert.deepEqual(Object.keys(REASON_KEYS).sort(), [...REFUSALS].sort());
  const texts = new Set(REFUSALS.map(reason => t(REASON_KEYS[reason])));
  assert.equal(texts.size, REFUSALS.length);
});

test('an untagged or unknown error reads as unreadable', () => {
  assert.equal(refusalReason(new Error('EIO')), 'unreadable');
  assert.equal(refusalReason(Object.assign(new Error(), { code: 'ENOENT' })), 'unreadable');
  assert.equal(refusalReason(refusal('__proto__')), 'unreadable');
  assert.equal(refusalReason(null), 'unreadable');
  assert.equal(refusalReason(refusal('too-large')), 'too-large');
});

test('one refused file is named, with the plain reason', () => {
  const text = localHtmlRefusalMessage(t, [{ file: file('report.html'), error: refusal('too-large') }]);
  assert.equal(text.message, 'Blanc couldn’t open “report.html”');
  assert.match(text.detail, /larger than 8 MB/);
  assert.notEqual(
    localHtmlRefusalMessage(t, [{ file: file('a.html'), error: new Error('x') }]).detail, text.detail,
    'too large and unreadable say different things');
  assert.match(localHtmlRefusalMessage(t, [{ file: file('a.html'), error: new Error('x') }]).detail, /couldn’t read/);
});

test('several refused files are counted and each gets a line', () => {
  const text = localHtmlRefusalMessage(t, [
    { file: file('big.html'), error: refusal('too-large') },
    { file: file('gone.html'), error: new Error('ENOENT') },
  ]);
  assert.equal(text.message, 'Blanc couldn’t open 2 files');
  const lines = text.detail.split('\n');
  assert.equal(lines.length, 2);
  assert.match(lines[0], /^big\.html: The file is larger than 8 MB/);
  assert.match(lines[1], /^gone\.html: Blanc couldn’t read the file/);
});

test('nothing refused shows nothing', () => {
  assert.equal(localHtmlRefusalMessage(t, []), null);
  assert.equal(localHtmlRefusalMessage(t, undefined), null);
});

test('the message follows the interface language', () => {
  for (const locale of ['de', 'es', 'fr', 'pt-BR', 'it']) {
    const local = translator(locale);
    const one = localHtmlRefusalMessage(local, [{ file: file('report.html'), error: refusal('changed') }]);
    assert.ok(one.message.includes('report.html'), locale);
    assert.notEqual(one.detail, t(REASON_KEYS.changed), locale);
    const many = localHtmlRefusalMessage(local, [
      { file: file('a.html'), error: refusal('not-html') }, { file: file('b.html'), error: refusal('too-large') },
    ]);
    assert.ok(many.message.includes('2'), locale);
    assert.equal(many.detail.split('\n').length, 2, locale);
  }
});

// Without this wiring the refusal is silent again (#1630's symptom).
test('main shows the refusals the ECS preview returns', () => {
  const fs = require('node:fs');
  const source = fs.readFileSync(path.join(__dirname, '../../src/main/main.js'), 'utf8');
  assert.ok(source.includes('drmSupport.openLocalFiles(paths).then(showLocalHtmlRefusals)'));
  assert.match(source, /function showLocalHtmlRefusals\(refused\) \{[\s\S]*?localHtmlRefusalMessage\(mainI18n\.t, batch\)[\s\S]*?dialog\.showMessageBox/);
});
