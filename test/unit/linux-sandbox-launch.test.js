const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { UNSAFE_SANDBOX_SWITCHES, SETUP_GUIDE_URL, unsafeSandboxSwitch, enforceLinuxSandbox } = require('../../src/main/linux-sandbox-launch');

const WAYLAND = { WAYLAND_DISPLAY: 'wayland-0', XDG_SESSION_TYPE: 'wayland' };

// Runs a refused Linux launch with scripted dialog answers and resolves once
// Blanc exits, recording every native dialog, browser open, copy and exit.
// The environment defaults to an X11 session so results don't depend on the
// session running the tests.
async function refusedLaunch({ argv = ['--no-sandbox'], env = { DISPLAY: ':0', XDG_SESSION_TYPE: 'x11' }, responses = [], openExternal = async () => {}, showMessageBox } = {}) {
  const calls = [];
  let exited;
  const exit = new Promise((resolve) => { exited = resolve; });
  const app = {
    whenReady: () => Promise.resolve(),
    exit: (code) => { calls.push(['exit', code]); exited(); },
    enableSandbox: () => calls.push(['enable']),
  };
  const dialog = {
    showMessageBox: showMessageBox ?? (async (options) => {
      calls.push(['dialog', options]);
      return { response: responses.length ? responses.shift() : options.defaultId ?? 0 };
    }),
  };
  const shell = { openExternal: async (url) => { calls.push(['open', url]); return openExternal(url); } };
  const clipboard = { writeText: (text) => calls.push(['copy', text]) };
  const allowed = enforceLinuxSandbox({ app, dialog, shell, clipboard, platform: 'linux', argv, env, report: (text) => calls.push(['terminal', text]) });
  await exit;
  return { allowed, calls, kinds: calls.map((call) => call[0]), dialogs: calls.filter((call) => call[0] === 'dialog').map((call) => call[1]) };
}

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

test('unsafe Linux launches initialize no browser code and open the setup guide from the native dialog', async () => {
  const { allowed, calls, kinds, dialogs } = await refusedLaunch();
  assert.equal(allowed, false);
  assert.deepEqual(kinds, ['terminal', 'dialog', 'open', 'exit']);
  assert.equal(calls[0][1], 'Blanc refused to start because Chromium sandboxing was disabled. Use a Linux environment that permits '
    + `Chromium sandboxing and launch Blanc without sandbox-disabling options. Setup guidance: ${SETUP_GUIDE_URL}`);
  assert.equal(dialogs[0].type, 'error');
  assert.equal(dialogs[0].message, 'Blanc requires Chromium sandboxing');
  assert.deepEqual(dialogs[0].buttons, ['Open Setup Guide', 'Copy Link', 'Quit']);
  assert.equal(dialogs[0].defaultId, 0);
  assert.equal(dialogs[0].cancelId, 2);
  assert.ok(dialogs[0].detail.includes(SETUP_GUIDE_URL));
  assert.deepEqual(calls[2], ['open', SETUP_GUIDE_URL]);
  assert.deepEqual(calls.at(-1), ['exit', 1]);
  const source = fs.readFileSync(require.resolve('../../src/main/main.js'), 'utf8');
  const enforcement = source.indexOf('if (!enforceLinuxSandbox({ app, dialog, shell, clipboard })) return;');
  assert.ok(enforcement >= 0 && enforcement < source.indexOf("require('./adblock')"));
});

test('copying the setup link keeps Blanc running until its confirmation is dismissed', async () => {
  const { kinds, calls, dialogs } = await refusedLaunch({ responses: [1, 0] });
  assert.deepEqual(kinds, ['terminal', 'dialog', 'copy', 'dialog', 'exit']);
  assert.deepEqual(calls[2], ['copy', SETUP_GUIDE_URL]);
  assert.equal(dialogs[1].message, 'Setup guide link copied');
  assert.deepEqual(dialogs[1].buttons, ['Quit']);
  assert.deepEqual(calls.at(-1), ['exit', 1]);
});

test('a rejected open still exits with the refusal code and copies nothing', async () => {
  const { kinds, calls } = await refusedLaunch({ openExternal: async () => { throw new Error('no xdg-open'); } });
  assert.deepEqual(kinds, ['terminal', 'dialog', 'open', 'exit']);
  assert.deepEqual(calls.at(-1), ['exit', 1]);
});

test('quitting or closing the dialog exits without opening or copying anything', async () => {
  for (const response of [2, 7]) {
    const { kinds, calls } = await refusedLaunch({ responses: [response] });
    assert.deepEqual(kinds, ['terminal', 'dialog', 'exit']);
    assert.deepEqual(calls.at(-1), ['exit', 1]);
  }
});

test('a launch asked to open the guide offers only copying, so a default-browser Blanc cannot relaunch itself', async () => {
  const { kinds, dialogs } = await refusedLaunch({ argv: ['--no-sandbox', SETUP_GUIDE_URL], responses: [0, 0] });
  assert.deepEqual(dialogs[0].buttons, ['Copy Link', 'Quit']);
  assert.equal(dialogs[0].cancelId, 1);
  assert.ok(dialogs[0].detail.includes(SETUP_GUIDE_URL));
  assert.deepEqual(kinds, ['terminal', 'dialog', 'copy', 'dialog', 'exit']);
});

test('on Wayland the dialog offers no Copy Link, because an unfocused client cannot set the clipboard', async () => {
  for (const env of [WAYLAND, { WAYLAND_DISPLAY: 'wayland-1' }, { DISPLAY: ':0', XDG_SESSION_TYPE: 'wayland' }]) {
    const { kinds, calls, dialogs } = await refusedLaunch({ env });
    assert.deepEqual(dialogs[0].buttons, ['Open Setup Guide', 'Quit'], JSON.stringify(env));
    assert.equal(dialogs[0].cancelId, 1);
    assert.ok(dialogs[0].detail.includes(SETUP_GUIDE_URL));
    assert.deepEqual(kinds, ['terminal', 'dialog', 'open', 'exit']);
    assert.deepEqual(calls.at(-1), ['exit', 1]);
  }
});

test('on Wayland a launch asked to open the guide offers only Quit and shows the address', async () => {
  const { kinds, dialogs } = await refusedLaunch({ env: WAYLAND, argv: ['--no-sandbox', SETUP_GUIDE_URL] });
  assert.deepEqual(dialogs[0].buttons, ['Quit']);
  assert.equal(dialogs[0].cancelId, 0);
  assert.match(dialogs[0].detail, /Open this address in another browser\./);
  assert.ok(dialogs[0].detail.includes(SETUP_GUIDE_URL));
  assert.deepEqual(kinds, ['terminal', 'dialog', 'exit']);
});

test('a dialog failure still exits with the refusal code', async () => {
  const { kinds, calls } = await refusedLaunch({ showMessageBox: async () => { throw new Error('no display'); } });
  assert.deepEqual(kinds, ['terminal', 'exit']);
  assert.deepEqual(calls.at(-1), ['exit', 1]);
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
