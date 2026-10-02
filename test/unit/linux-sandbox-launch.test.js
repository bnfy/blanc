const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { UNSAFE_SANDBOX_SWITCHES, unsafeSandboxSwitch, enforceLinuxSandbox } = require('../../src/main/linux-sandbox-launch');

test('both Chromium switch prefixes and assigned values refuse every unsafe switch', () => {
  for (const name of UNSAFE_SANDBOX_SWITCHES) {
    for (const prefix of ['-', '--']) {
      for (const suffix of ['', '=true', '=false', '=0']) {
        assert.equal(unsafeSandboxSwitch(['blanc', `${prefix}${name}${suffix}`]), name);
      }
    }
  }
  assert.equal(unsafeSandboxSwitch([], { hasSwitch: (name) => name === 'no-sandbox' }), 'no-sandbox');
  for (const arg of ['--no-sandbox-helper', '--enable-sandbox', 'https://example.test/--no-sandbox', '--label=no-sandbox', 'no-sandbox']) {
    assert.equal(unsafeSandboxSwitch([arg]), null, arg);
  }
});

test('unsafe Linux launches initialize no browser code while showing native and terminal guidance', async () => {
  const calls = [];
  const app = { whenReady: () => Promise.resolve(), exit: (code) => calls.push(['exit', code]), enableSandbox: () => calls.push(['enable']) };
  const dialog = { showErrorBox: (...args) => calls.push(['dialog', ...args]) };
  const allowed = enforceLinuxSandbox({ app, dialog, platform: 'linux', argv: ['--no-sandbox'], report: (text) => calls.push(['terminal', text]) });
  assert.equal(allowed, false);
  await Promise.resolve();
  assert.deepEqual(calls.map((call) => call[0]), ['terminal', 'dialog', 'exit']);
  assert.equal(calls.at(-1)[1], 1);
  const source = fs.readFileSync(require.resolve('../../src/main/main.js'), 'utf8');
  assert.ok(source.indexOf('if (!enforceLinuxSandbox({ app, dialog })) return;') < source.indexOf("require('./adblock')"));
});

test('permitted Linux enables official sandbox before readiness; other platforms keep their policy', () => {
  let enabled = 0;
  const options = { app: { enableSandbox: () => enabled++ }, dialog: {}, argv: [] };
  assert.equal(enforceLinuxSandbox({ ...options, platform: 'linux' }), true);
  assert.equal(enabled, 1);
  assert.equal(enforceLinuxSandbox({ ...options, platform: 'darwin' }), true);
  assert.equal(enforceLinuxSandbox({ ...options, platform: 'win32', argv: ['--no-sandbox'] }), true);
  assert.equal(enabled, 1);
});
