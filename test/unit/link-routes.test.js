'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  MAX_LINK_ROUTES,
  normalizeDomain,
  normalizeContains,
  normalizeLinkRoutes,
  validateLinkRoutes,
  matchLinkRoute,
  linkRouteTargetState,
  linkRoutesWithoutProfile,
  urlHost,
} = require('../../src/main/link-routes');

const rule = (id, kind, value, destination = {}) => ({
  id,
  match: { kind, value },
  destination: { profileId: 'work', spaceId: null, private: false, ...destination },
});

test('normalizeDomain keeps a host in its ASCII, lowercase form without www.', () => {
  assert.deepEqual(normalizeDomain('Example.COM'), { ok: true, value: 'example.com', fromUrl: false });
  assert.deepEqual(normalizeDomain('www.example.com'), { ok: true, value: 'example.com', fromUrl: false });
  assert.equal(normalizeDomain('jira.example.com.').value, 'jira.example.com');
  assert.equal(normalizeDomain('bücher.example').value, 'xn--bcher-kva.example');
  // www. is dropped only when a real domain remains.
  assert.equal(normalizeDomain('www.com').value, 'www.com');
  assert.equal(normalizeDomain('localhost').value, 'localhost');
});

test('normalizeDomain reduces a pasted URL to its host and says so', () => {
  assert.deepEqual(normalizeDomain('https://www.Jira.example.com:8443/browse/X-1?q=1#top'),
    { ok: true, value: 'jira.example.com', fromUrl: true });
  // The userinfo of a pasted URL is never the host.
  assert.equal(normalizeDomain('https://work.example.com@evil.test/').value, 'evil.test');
  assert.equal(normalizeDomain('http://[::1]:3000/').value, '[::1]');
});

test('normalizeDomain refuses anything that is not a bare host', () => {
  for (const value of ['', '   ', 'example.com/path', 'example.com:8080', '*.example.com',
    'user@example.com', 'exa mple.com', 'example..com', '.example.com', 'example.com?x', 'mailto:me@example.com']) {
    assert.equal(normalizeDomain(value).ok, false, value);
  }
  assert.equal(normalizeDomain(undefined).error, 'empty');
  assert.equal(normalizeDomain(`${'a'.repeat(201)}.com`).error, 'too-long');
});

test('normalizeContains trims and bounds the value', () => {
  assert.deepEqual(normalizeContains('  /teams/Design '), { ok: true, value: '/teams/Design' });
  assert.equal(normalizeContains('').ok, false);
  assert.equal(normalizeContains('x'.repeat(201)).error, 'too-long');
  assert.equal(normalizeContains('a\nb').ok, false);
});

test('urlHost reads the parsed host, never userinfo, port or a trailing dot', () => {
  assert.equal(urlHost('https://work.example.com@evil.test/'), 'evil.test');
  assert.equal(urlHost('https://JIRA.Example.com.:443/x'), 'jira.example.com');
  assert.equal(urlHost('https://bücher.example/'), 'xn--bcher-kva.example');
  assert.equal(urlHost('file:///etc/passwd'), null);
  assert.equal(urlHost('not a url'), null);
});

test('a domain rule matches the domain and its subdomains, not look-alikes', () => {
  const routes = [rule('r1', 'domain', 'example.com')];
  for (const url of ['https://example.com/', 'https://jira.example.com/browse/X-1',
    'http://www.example.com/', 'https://EXAMPLE.com./', 'https://a.b.example.com:8443/']) {
    assert.equal(matchLinkRoute(routes, url)?.id, 'r1', url);
  }
  for (const url of ['https://notexample.com/', 'https://example.com.evil.test/',
    'https://evil.test/?u=example.com', 'https://evil.test/example.com']) {
    assert.equal(matchLinkRoute(routes, url), null, url);
  }
});

test('a crafted userinfo cannot fool the domain match', () => {
  const routes = [rule('work', 'domain', 'work.example.com'), rule('evil', 'domain', 'evil.test', { profileId: 'default' })];
  assert.equal(matchLinkRoute(routes, 'https://work.example.com@evil.test/').id, 'evil');
  assert.equal(matchLinkRoute([routes[0]], 'https://work.example.com@evil.test/'), null);
  assert.equal(matchLinkRoute([routes[0]], 'https://user:pw@work.example.com/').id, 'work');
});

test('IDN hosts match in punycode whichever form the link uses', () => {
  const routes = normalizeLinkRoutes([rule('r', 'domain', 'bücher.example')]);
  assert.equal(routes[0].match.value, 'xn--bcher-kva.example');
  assert.equal(matchLinkRoute(routes, 'https://shop.bücher.example/')?.id, 'r');
  assert.equal(matchLinkRoute(routes, 'https://shop.xn--bcher-kva.example/')?.id, 'r');
});

test('IP addresses match only exactly', () => {
  const routes = [rule('ip', 'domain', '10.0.0.4')];
  assert.equal(matchLinkRoute(routes, 'http://10.0.0.4:8080/admin')?.id, 'ip');
  assert.equal(matchLinkRoute(routes, 'http://110.0.0.4/'), null);
  assert.equal(matchLinkRoute([rule('tail', 'domain', '0.0.4')], 'http://10.0.0.4/'), null);
});

test('a contains rule is a case-insensitive substring of the whole URL', () => {
  const routes = [rule('c', 'contains', '/Teams/Design')];
  assert.equal(matchLinkRoute(routes, 'https://app.example.com/teams/design/board')?.id, 'c');
  assert.equal(matchLinkRoute(routes, 'https://app.example.com/teams/marketing'), null);
});

test('the first matching rule wins', () => {
  const routes = [
    rule('specific', 'domain', 'jira.example.com', { profileId: 'work' }),
    rule('broad', 'domain', 'example.com', { profileId: 'default' }),
  ];
  assert.equal(matchLinkRoute(routes, 'https://jira.example.com/').id, 'specific');
  assert.equal(matchLinkRoute(routes, 'https://wiki.example.com/').id, 'broad');
  assert.equal(matchLinkRoute([...routes].reverse(), 'https://jira.example.com/').id, 'broad');
});

test('a rule whose profile or Space is gone falls through to the next', () => {
  const routes = [
    rule('gone-profile', 'domain', 'example.com', { profileId: 'deleted' }),
    rule('gone-space', 'domain', 'example.com', { profileId: 'work', spaceId: 'space-gone' }),
    rule('live', 'domain', 'example.com', { profileId: 'default' }),
  ];
  const liveness = {
    isLiveProfile: (id) => id !== 'deleted',
    isLiveSpace: (_profileId, spaceId) => spaceId !== 'space-gone',
  };
  assert.equal(matchLinkRoute(routes, 'https://example.com/', liveness).id, 'live');
  assert.equal(matchLinkRoute(routes.slice(0, 2), 'https://example.com/', liveness), null);
  assert.equal(linkRouteTargetState(routes[0], liveness), 'profile-deleted');
  assert.equal(linkRouteTargetState(routes[1], liveness), 'space-deleted');
  assert.equal(linkRouteTargetState(routes[2], liveness), 'ok');
});

test('normalizeLinkRoutes repairs: drops malformed rows and repeated ids, keeps order', () => {
  const routes = normalizeLinkRoutes([
    rule('a', 'domain', 'WWW.Example.com'),
    { id: 'bad kind', match: { kind: 'regex', value: '.*' }, destination: { profileId: 'work' } },
    rule('b', 'regex', 'x'),
    rule('a', 'domain', 'dup.example'),
    rule('c', 'contains', '/org/'),
    rule('d', 'domain', 'example.com/path'),
    { ...rule('e', 'domain', 'e.example'), destination: { profileId: 'bad id!' } },
    { ...rule('f', 'domain', 'f.example'), destination: { profileId: 'work', private: 'yes' } },
    { ...rule('g', 'domain', 'g.example'), destination: { profileId: 'work', spaceId: 'space-1', private: true }, extra: 1 },
    null,
  ]);
  assert.deepEqual(routes.map((route) => route.id), ['a', 'c', 'g']);
  assert.equal(routes[0].match.value, 'example.com');
  assert.deepEqual(routes[2], {
    id: 'g', match: { kind: 'domain', value: 'g.example' },
    destination: { profileId: 'work', spaceId: 'space-1', private: true },
  });
  assert.deepEqual(normalizeLinkRoutes('nope'), []);
});

test('normalizeLinkRoutes caps the list at 50 rules', () => {
  const many = Array.from({ length: 60 }, (_, i) => rule(`r${i}`, 'domain', `d${i}.example`));
  const routes = normalizeLinkRoutes(many);
  assert.equal(MAX_LINK_ROUTES, 50);
  assert.equal(routes.length, 50);
  assert.equal(routes.at(-1).id, 'r49');
});

test('validateLinkRoutes stores all or nothing', () => {
  const good = [rule('a', 'domain', 'https://www.example.com/x'), rule('b', 'contains', '/org/')];
  const result = validateLinkRoutes(good);
  assert.equal(result.ok, true);
  assert.equal(result.routes[0].match.value, 'example.com');
  assert.deepEqual(validateLinkRoutes([...good, rule('c', 'domain', '*.bad')]), { ok: false, error: 'invalid', index: 2 });
  assert.deepEqual(validateLinkRoutes([good[0], good[0]]), { ok: false, error: 'invalid', index: 1 });
  assert.deepEqual(validateLinkRoutes({}), { ok: false, error: 'invalid' });
  const many = Array.from({ length: 51 }, (_, i) => rule(`r${i}`, 'domain', `d${i}.example`));
  assert.deepEqual(validateLinkRoutes(many), { ok: false, error: 'too-many' });
  assert.deepEqual(validateLinkRoutes([]), { ok: true, routes: [] });
});

test('deleting a profile removes the rules that point at it', () => {
  const routes = [rule('a', 'domain', 'a.example', { profileId: 'work' }), rule('b', 'domain', 'b.example', { profileId: 'default' })];
  assert.deepEqual(linkRoutesWithoutProfile(routes, 'work').map((route) => route.id), ['b']);
});

test('resolveRoutedRuntime picks the Space window, else the profile window used last', () => {
  const { resolveRoutedRuntime } = require('../../src/main/link-routes');
  const personal = { profileId: 'default', workspaceId: null };
  const workOld = { profileId: 'work', workspaceId: null };
  const workNew = { profileId: 'work', workspaceId: 'space-b' };
  const order = new Map([[personal, 9], [workOld, 1], [workNew, 5]]);
  const opened = [];
  const deps = {
    runtimes: [personal, workOld, workNew],
    focusOrder: (runtime) => order.get(runtime) ?? 0,
    openSpace: (destination) => { opened.push(['space', destination.spaceId]); return null; },
    openProfileWindow: (profileId) => { opened.push(['profile', profileId]); return { profileId, fresh: true }; },
  };
  assert.equal(resolveRoutedRuntime({ profileId: 'work', spaceId: null }, personal, deps), workNew);
  assert.equal(resolveRoutedRuntime({ profileId: 'work', spaceId: null }, workOld, deps), workOld, 'an earlier choice is kept');
  assert.equal(resolveRoutedRuntime({ profileId: 'work', spaceId: 'space-b' }, personal, deps), workNew);
  assert.deepEqual(opened, []);

  // A Space that isn't showing opens in a new window.
  const spaceWindow = { profileId: 'work', workspaceId: 'space-c' };
  const withSpace = { ...deps, openSpace: () => spaceWindow };
  assert.equal(resolveRoutedRuntime({ profileId: 'work', spaceId: 'space-c' }, personal, withSpace), spaceWindow);

  // A refused Space open falls back to a new window of the same profile.
  const fallback = resolveRoutedRuntime({ profileId: 'work', spaceId: 'space-c' }, personal, deps);
  assert.deepEqual(fallback, { profileId: 'work', fresh: true });
  assert.deepEqual(opened, [['space', 'space-c'], ['profile', 'work']]);

  // A Space open that lands in another profile is never used.
  const wrong = { ...deps, openSpace: () => personal };
  assert.equal(resolveRoutedRuntime({ profileId: 'work', spaceId: 'space-c' }, null, wrong).fresh, true);

  // No window of the profile: a new one.
  assert.equal(resolveRoutedRuntime({ profileId: 'other', spaceId: null }, personal, deps).profileId, 'other');
});
