const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const mainSource = fs.readFileSync(path.join(__dirname, '../../src/main/main.js'), 'utf8');
const registration = mainSource.match(/app\.on\('login', \(event, _requestingWc, _details, _authInfo, callback\) => \{[\s\S]*?\n  \}\);/)?.[0];

test('all HTTP authentication challenges are cancelled without credentials', () => {
  assert.ok(registration, 'explicit no-dialog login policy must stay registered');
  let listener;
  vm.runInNewContext(registration, {
    app: { on: (name, handler) => { assert.equal(name, 'login'); listener = handler; } },
  });

  for (const challenge of [
    { details: { isRequestForNavigation: true }, authInfo: { isProxy: false } },
    { details: { isRequestForNavigation: false }, authInfo: { isProxy: false } },
    { details: { isRequestForNavigation: true }, authInfo: { isProxy: true } },
  ]) {
    let prevented = false;
    let callbackArgs = null;
    listener(
      { preventDefault: () => { prevented = true; } },
      null,
      challenge.details,
      challenge.authInfo,
      (...args) => { callbackArgs = args; }
    );
    assert.equal(prevented, true);
    assert.deepEqual(callbackArgs, []);
  }
});

test('the separate Blanc credentials page and preload are gone', () => {
  for (const file of [
    'src/main/auth-dialog.js',
    'src/main/auth-preload.js',
    'src/renderer/pages/auth.html',
    'src/renderer/pages/auth.js',
  ]) {
    assert.equal(fs.existsSync(path.join(__dirname, '../..', file)), false, `${file} must not return`);
  }
});
