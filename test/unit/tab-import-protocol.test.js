'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  TAB_IMPORT_SCHEME,
  registerWindowsTabImportProtocol,
} = require('../../src/main/tab-import-protocol');

test('packaged Windows registers the private tab-import scheme', () => {
  const calls = [];
  const result = registerWindowsTabImportProtocol({
    isPackaged: true,
    setAsDefaultProtocolClient(protocol) {
      calls.push(protocol);
      return true;
    },
  }, { platform: 'win32' });
  assert.deepEqual(result, { attempted: true, registered: true });
  assert.deepEqual(calls, [TAB_IMPORT_SCHEME]);
  assert.equal(TAB_IMPORT_SCHEME, 'blanc-import');
});

test('development and non-Windows builds do not mutate protocol ownership', () => {
  const app = {
    isPackaged: false,
    setAsDefaultProtocolClient() {
      assert.fail('development must not register a packaged protocol');
    },
  };
  assert.deepEqual(
    registerWindowsTabImportProtocol(app, { platform: 'win32' }),
    { attempted: false, registered: false },
  );
  app.isPackaged = true;
  for (const platform of ['darwin', 'linux']) {
    assert.deepEqual(
      registerWindowsTabImportProtocol(app, { platform }),
      { attempted: false, registered: false },
    );
  }
});

test('Windows registration failures are contained and reported', () => {
  assert.deepEqual(
    registerWindowsTabImportProtocol({
      isPackaged: true,
      setAsDefaultProtocolClient() { throw new Error('registry denied'); },
    }, { platform: 'win32' }),
    { attempted: true, registered: false },
  );
});
