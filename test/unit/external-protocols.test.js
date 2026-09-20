const assert = require('node:assert/strict');
const test = require('node:test');

const {
  DENIED_HANDOFF_PROTOCOLS,
  DIRECT_HANDOFF_PROTOCOLS,
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

test('valid apostrophes remain intact in external links', async () => {
  const h = harness();
  const url = "mailto:o'brien@example.com";
  assert.equal(h.handOff(url, { trusted: true }), true);
  await settle();
  assert.deepEqual(h.launches, [url]);
  assert.deepEqual(h.prompts, []);
});

test('web, script and local file URLs are never handed to the OS', () => {
  for (const [url, action] of [
    ['https://example.com', 'none'],
    ['javascript:alert(1)', 'none'],
    ['vbscript:x', 'none'],
    ['file:///etc/passwd', 'deny'],
    ['not a url', 'none'],
    ['', 'none'],
  ]) {
    assert.equal(classifyExternalNavigation(url, { trusted: false }).action, action, url);
    assert.equal(classifyExternalNavigation(url, { trusted: true }).action, action, url);
  }
});

test('only familiar typed links bypass confirmation', () => {
  assert.deepEqual([...DIRECT_HANDOFF_PROTOCOLS].sort(), ['facetime:', 'mailto:', 'sms:', 'tel:']);
  assert.ok(DENIED_HANDOFF_PROTOCOLS.has('shell:'));
});

test('installed-app candidates need confirmation without a service whitelist', () => {
  for (const url of ['claude://login?code=secret', 'canva://login?code=secret',
    'another-installed-app://auth/callback', 'vscode://file/tmp/demo',
    'com.googleusercontent.apps.123-abc:/oauthredirect',
    'msauth.com.example.desktop:/callback']) {
    for (const trusted of [true, false]) assert.equal(classifyExternalNavigation(url, { trusted }).action, 'confirm');
  }
});

test('dangerous OS schemes and privileged internals are consumed without launch', () => {
  for (const url of ['shell:AppsFolder', 'ms-msdt:/x', 'ms-appinstaller:?source=x',
    'search-ms:query=x', 'powershell:run', 'blanc-import://x',
    'chrome://settings', 'view-source:https://example.com', 'file:///etc/passwd',
    'ssh://host', 'smb://host', 'x-apple.systempreferences://settings']) {
    assert.equal(classifyExternalNavigation(url, { trusted: false }).action, 'deny', url);
  }
});

test('browser-owned and malformed URLs are not external handoffs', () => {
  for (const url of ['blanc://settings/', 'blob:https://example.com/x',
    'C:\\Windows', ' claude://login', 'clau\nde://login', 'claude://login?x=\u0000',
    'canva://login?x="quoted"', 'canva://login\\evil']) {
    assert.equal(classifyExternalNavigation(url, { trusted: false }).action, 'none', url);
  }
});

test('typed search operators remain searches, not external-app attempts', () => {
  for (const url of ['site:example.com', 'npm:react', 'RFC:3986', 'doi:10.1000/182']) {
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

test('web-initiated OS-control links are consumed without prompting or launching', async () => {
  const h = harness();
  assert.equal(h.handOff('shell:AppsFolder', { source: 'https://example.com' }), true);
  assert.equal(h.handOff('blanc-import://payload', { source: 'https://example.com' }), true);
  assert.equal(h.handOff('shell:AppsFolder', { trusted: true }), false);
  await settle();
  assert.deepEqual(h.lookups, []);
  assert.deepEqual(h.prompts, []);
  assert.deepEqual(h.launches, []);
});

test('confirmation shows source origin and app, never callback secrets; opens exact URL', async () => {
  const h = harness();
  const url = 'claude://login?code=secret&state=opaque';
  assert.equal(h.handOff(url, { source: 'https://example.com/auth?token=private' }), true);
  assert.deepEqual(h.launches, []);
  await settle();
  assert.deepEqual(h.launches, [url]);
  assert.deepEqual(h.lookups, ['claude://']);
  assert.match(h.prompts[0].message, /Example App/);
  assert.equal(
    h.prompts[0].detail,
    'https://example.com wants to open an application on your computer (claude:).'
  );
  assert.doesNotMatch(JSON.stringify(h.prompts), /secret|opaque|private|token/);
  assert.equal(h.prompts[0].defaultId, 1);
});

test('cancel never launches', async () => {
  const h = harness({ showMessageBox: async () => ({ response: 1 }) });
  h.handOff('claude://signin'); await settle();
  assert.deepEqual(h.launches, []);
});

test('page timers cannot reopen app prompts until another native activation', async () => {
  const h = harness();
  h.handOff('canva://first'); await settle();
  for (let i = 0; i < 5; i++) {
    h.handOff(`unrelated-app-${i}://callback`);
    await settle();
  }
  assert.equal(h.prompts.length, 1);
  assert.deepEqual(h.launches, ['canva://first']);
  h.handOff.noteUserGesture();
  h.handOff('canva://retry'); await settle();
  assert.equal(h.prompts.length, 2);
  assert.deepEqual(h.launches, ['canva://first', 'canva://retry']);
});

test('unregistered schemes also consume only one prompt per activation', async () => {
  const h = harness({ getApplicationName: () => '' });
  h.handOff('unregistered-one://callback'); await settle();
  h.handOff('unregistered-two://callback'); await settle();
  assert.equal(h.prompts.length, 1);
  h.handOff.noteUserGesture();
  h.handOff('unregistered-two://callback'); await settle();
  assert.equal(h.prompts.length, 2);
});

test('captured callback remains launchable while the prompt is pending and the guard resets', async () => {
  let answer, count = 0;
  const h = harness({ showMessageBox: () => { count++; return new Promise((resolve) => { answer = resolve; }); } });
  h.handOff('claude://login');
  h.handOff('claude://second'); assert.equal(count, 1);
  answer({ response: 0 }); await settle();
  assert.deepEqual(h.launches, ['claude://login']);
  h.handOff('claude://second'); assert.equal(count, 1);
  h.handOff.noteUserGesture();
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
