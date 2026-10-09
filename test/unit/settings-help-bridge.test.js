const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { isTrustedPagesEvent } = require('../../src/main/pages-ipc-trust');
const { KNOWN_PAGES, UTILITY_PAGES } = require('../../src/main/utility-pages');

function harness() {
  const handlers = new Map();
  const session = { protocol: { handle() {} } };
  let runtime;
  const checks = [];
  const settings = {
    SEARCH_ENGINES: { duckduckgo: { label: 'DuckDuckGo' } }, APP_ICON_LABELS: {},
    getSettings: () => ({ supporter: { key: 'secret' }, patron: { key: 'secret' }, searchSuggestions: true }),
    isPatronActive: () => false,
  };
  const module = { exports: {} };
  const requireStub = (name) => {
    if (name === 'electron') return {
      app: { getVersion: () => '9.8.7-running', isPackaged: true },
      ipcMain: { handle: (channel, fn) => handlers.set(channel, fn) },
      session: { defaultSession: session },
    };
    if (name === './settings') return settings;
    if (name === './pages-ipc-trust') return { isTrustedPagesEvent };
    if (name === './utility-pages') return { KNOWN_PAGES, UTILITY_PAGES };
    // Built at setup time, so the real (Electron-free) module is needed.
    if (name === './default-browser-status') return require('../../src/main/default-browser-status');
    if (name.startsWith('./')) return {};
    return require(name);
  };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../../src/main/pages.js'), 'utf8'), {
    module, require: requireStub, __dirname: path.resolve(__dirname, '../../src/main'),
    process: { env: {}, versions: { electron: '44.5.1-running', chrome: '152-running' }, platform: 'linux', arch: 'arm64' },
  });
  module.exports.setupPages({
    browserImport: {}, sessions: [session],
    pageSurfaces: { owns: (host, wc) => host === 'settings' && wc.owned === true },
    runInPageRuntime: (event, work) => { runtime = event.sender.runtime; return work(); },
    checkForUpdates: () => { checks.push(runtime); return 'existing-updater'; },
  });
  const event = (url = 'blanc://settings/', owned = true, window = 'background') => {
    const senderFrame = { url };
    return { senderFrame, sender: { mainFrame: senderFrame, session, owned, runtime: window, getURL: () => url } };
  };
  return { handlers, event, checks };
}

test('Settings receives only running non-secret build metadata', () => {
  const h = harness();
  const result = h.handlers.get('pages:settings:get')(h.event());
  assert.deepEqual(JSON.parse(JSON.stringify(result.appInfo)), {
    blancVersion: '9.8.7-running', electronVersion: '44.5.1-running', chromiumVersion: '152-running', platform: 'linux', architecture: 'arm64',
  });
  assert.equal(result.settings.supporter, undefined);
  assert.equal(result.settings.patron, undefined);
});

test('Settings update checks invoke the existing hook in the requesting runtime', () => {
  const h = harness(); const check = h.handlers.get('pages:settings:check-for-updates');
  assert.equal(check(h.event()), 'existing-updater');
  assert.equal(check(h.event('blanc://settings/', true, 'foreground')), 'existing-updater');
  assert.deepEqual(h.checks, ['background', 'foreground']);
});

test('websites, other internal hosts, unowned surfaces and subframes cannot check updates', () => {
  const h = harness(); const check = h.handlers.get('pages:settings:check-for-updates');
  const child = h.event(); child.senderFrame = { url: 'blanc://settings/' };
  for (const event of [h.event('https://example.com/'), h.event('blanc://newtab/'), h.event('blanc://settings/', false), child]) {
    assert.throws(() => check(event), /denied/);
  }
  assert.deepEqual(h.checks, []);
});
