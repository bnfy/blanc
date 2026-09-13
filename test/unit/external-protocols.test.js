const assert = require('node:assert/strict');
const test = require('node:test');

const {
  APP_HANDOFF_PROTOCOLS,
  DIRECT_HANDOFF_PROTOCOLS,
  HANDOFF_PROTOCOLS,
  classifyExternalNavigation,
  createExternalHandoff,
  installExternalNavigationHandlers,
} = require('../../src/main/external-protocols');
const { EventEmitter } = require('node:events');
const settle = () => new Promise((resolve) => setImmediate(resolve));

test('web-initiated external protocols require confirmation, never open directly', () => {
  for (const url of ['mailto:a@b.c', 'tel:+15550100', 'sms:+15550100', 'facetime:a@b.c']) {
    const decision = classifyExternalNavigation(url, { trusted: false });
    assert.equal(decision.action, 'confirm', `${url} must be confirmed`);
  }
  // Default is untrusted — an entry point that forgets the option must
  // land on the confirm path, not the open path.
  assert.equal(classifyExternalNavigation('mailto:a@b.c').action, 'confirm');
});

test('typed address-bar input opens without a prompt', () => {
  const decision = classifyExternalNavigation('mailto:a@b.c', { trusted: true });
  assert.equal(decision.action, 'open');
  assert.equal(decision.protocol, 'mailto:');
});

test('web, script and local file URLs are never handed to the OS', () => {
  for (const url of [
    'https://example.com',
    'javascript:alert(1)',
    'vbscript:x',
    'file:///etc/passwd',
    'not a url',
    '',
  ]) {
    assert.equal(classifyExternalNavigation(url, { trusted: false }).action, 'none', url);
    assert.equal(classifyExternalNavigation(url, { trusted: true }).action, 'none', url);
  }
});

test('only familiar typed links bypass confirmation', () => {
  assert.deepEqual([...DIRECT_HANDOFF_PROTOCOLS].sort(), ['facetime:', 'mailto:', 'sms:', 'tel:']);
  assert.ok(HANDOFF_PROTOCOLS.has('claude:'));
  assert.deepEqual([...APP_HANDOFF_PROTOCOLS], ['claude:']);
});

test('reviewed app and OAuth callback schemes always require confirmation', () => {
  for (const url of ['claude://login?code=secret',
    'com.googleusercontent.apps.123-abc:/oauthredirect',
    'msauth.com.example.desktop:/callback']) {
    for (const trusted of [true, false]) assert.equal(classifyExternalNavigation(url, { trusted }).action, 'confirm');
  }
});

test('unreviewed schemes, search operators, browser internals and malformed URLs never launch', () => {
  for (const url of ['shell:AppsFolder', 'ms-msdt:/x', 'ms-appinstaller:?source=x',
    'search-ms:query=x', 'powershell:run', 'blanc-import://x', 'blanc://settings/',
    'chrome://settings', 'view-source:https://example.com', 'blob:https://example.com/x',
    'ssh://host', 'smb://host', 'steam://run/1', 'vscode://file/tmp/demo',
    'site:example.com', 'npm:react', 'RFC:3986', 'doi:10.1000/182',
    'C:\\Windows', ' claude://login', 'clau\nde://login', 'claude://login?x=\u0000']) {
    assert.equal(classifyExternalNavigation(url, { trusted: true }).action, 'none', url);
  }
});

function harness(options = {}) {
  const prompts = [], launches = [], lookups = [];
  const handOff = createExternalHandoff({
    getWindow: () => ({ isDestroyed: () => false }),
    getApplicationName: (url) => { lookups.push(url); return 'Example App'; },
    showMessageBox: async (_, prompt) => { prompts.push(prompt); return { response: 0 }; },
    openExternal: async (url) => { launches.push(url); },
    ...options,
  });
  return { handOff, prompts, launches, lookups };
}

test('confirmation shows source origin and app, never callback secrets; opens exact URL', async () => {
  const h = harness();
  const url = 'claude://login?code=secret&state=opaque';
  assert.equal(h.handOff(url, { source: 'https://example.com/auth?token=private' }), true);
  assert.deepEqual(h.launches, []);
  await settle();
  assert.deepEqual(h.launches, [url]);
  assert.deepEqual(h.lookups, ['claude://']);
  assert.match(h.prompts[0].message, /Example App/);
  assert.match(h.prompts[0].detail, /https:\/\/example.com/);
  assert.doesNotMatch(JSON.stringify(h.prompts), /secret|opaque|private|token/);
  assert.equal(h.prompts[0].defaultId, 1);
});

test('cancel never launches', async () => {
  const h = harness({ showMessageBox: async () => ({ response: 1 }) });
  h.handOff('claude://signin'); await settle();
  assert.deepEqual(h.launches, []);
});

test('captured callback remains launchable while the prompt is pending and the guard resets', async () => {
  let answer, count = 0;
  const h = harness({ showMessageBox: () => { count++; return new Promise((resolve) => { answer = resolve; }); } });
  h.handOff('claude://login');
  h.handOff('claude://second'); assert.equal(count, 1);
  answer({ response: 0 }); await settle();
  assert.deepEqual(h.launches, ['claude://login']);
  h.handOff('claude://second'); assert.equal(count, 2);
  answer({ response: 1 }); await settle();
});

test('single-slash OAuth callback uses a normalized handler probe and launches unchanged', async () => {
  const h = harness();
  const url = 'msauth.com.example.desktop:/oauthredirect?code=secret';
  h.handOff(url); await settle();
  assert.deepEqual(h.lookups, ['msauth.com.example.desktop://']);
  assert.deepEqual(h.launches, [url]);
});

test('missing handler and failed launch are visible without exposing URLs', async () => {
  const missing = harness({ getApplicationName: () => '' });
  missing.handOff('claude://login?code=secret'); await settle();
  assert.equal(missing.prompts[0].title, 'No application found');
  assert.deepEqual(missing.launches, []);
  const failure = harness({ openExternal: async () => { throw new Error('secret URL'); } });
  failure.handOff('claude://login?code=secret'); await settle();
  assert.equal(failure.prompts[1].title, 'Could not open application');
  assert.doesNotMatch(JSON.stringify(failure.prompts), /secret/);
});

test('redirect and frame callbacks are consumed, ordinary web navigation remains untouched', () => {
  const wc = new EventEmitter();
  wc.getURL = () => 'https://example.com'; wc.isDestroyed = () => false;
  const calls = [];
  installExternalNavigationHandlers(wc, (url, options) => {
    calls.push({ url, options }); return classifyExternalNavigation(url).action !== 'none';
  });
  for (const type of ['will-frame-navigate', 'will-redirect']) {
    let prevented = false;
    wc.emit(type, { url: 'claude://callback', preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
    assert.equal(calls.at(-1).options.source, 'https://example.com');
    prevented = false;
    wc.emit(type, { url: 'https://example.com/callback', preventDefault() { prevented = true; } });
    assert.equal(prevented, false);
  }
});
