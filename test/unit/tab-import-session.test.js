const assert = require('node:assert/strict');
const test = require('node:test');
const { createTabImportSessionStore, SESSION_TTL_MS } = require('../../src/main/tab-import-session');

const NOW = 1_700_000_000_000;
let seq = 0;
let byteSeq = 0;
const randomId = () => `id-${++seq}`;
const randomBytes = (size) => Buffer.alloc(size, ++byteSeq);
const store = () => createTabImportSessionStore({
  now: () => NOW,
  randomId,
  randomBytes,
});

const candidates = [
  {
    url: 'https://article.example/',
    title: 'Article',
    sourceWindow: 1,
    sourceTabOrder: 0,
    sourceGroupName: 'reading',
    sourceGroupToken: 'token-reading',
    pinned: true,
  },
  {
    url: 'https://other.example/',
    title: 'Other',
    sourceWindow: 2,
    sourceTabOrder: 0,
    sourceGroupName: null,
    sourceGroupToken: null,
    pinned: false,
  },
];

test('createSession assigns ids and replaces an existing runtime session', () => {
  const s = store();
  const first = s.createSession({
    runtimeId: 'rt-1',
    profileId: 'profile-a',
    sourceKind: 'chromium',
    sourceLabel: 'Chrome',
  });
  const second = s.createSession({
    runtimeId: 'rt-1',
    profileId: 'profile-a',
    sourceKind: 'chromium',
    sourceLabel: 'Chrome',
  });
  assert.notEqual(first.sessionId, second.sessionId);
  assert.notEqual(first.generation, second.generation);
  assert.equal(s.projectCandidates(first.sessionId).error, 'session-unavailable');
  assert.equal(s.getSession, undefined);
});

test('projectCandidates omits exact URLs', () => {
  const s = store();
  const { sessionId } = s.createSession({
    runtimeId: 'rt-1',
    profileId: 'profile-a',
    sourceKind: 'chromium',
    sourceLabel: 'Chrome',
  });
  s.assignCandidates(sessionId, candidates);
  const projected = s.projectCandidates(sessionId);
  assert.equal(projected.candidates.length, 2);
  assert.equal('url' in projected.candidates[0], false);
  assert.equal(projected.candidates[0].hostname, 'article.example');
  assert.equal(projected.candidates[0].sourceWindow, 1);
  assert.equal(projected.candidates[0].sourceGroupName, 'reading');
  assert.equal(projected.candidates[0].pinned, true);
  assert.equal(JSON.stringify(projected).includes('https://'), false);
});

test('resolveApply is valid only in ready and rejects stale generation', () => {
  const s = store();
  const { sessionId, generation } = s.createSession({
    runtimeId: 'rt-1',
    profileId: 'profile-a',
    sourceKind: 'chromium',
    sourceLabel: 'Chrome',
  });
  const { candidateIds } = s.assignCandidates(sessionId, candidates);
  const stale = s.resolveApply(sessionId, {
    generation: 'stale',
    groups: [],
    ungroupedCandidateIds: candidateIds,
  });
  assert.equal(stale.error, 'stale-generation');

  const resolved = s.resolveApply(sessionId, {
    generation,
    groups: [],
    ungroupedCandidateIds: candidateIds,
  });
  assert.equal(resolved.ok, true);
  assert.equal(resolved.entries.length, 2);
  assert.equal(resolved.entries[0].url, 'https://article.example/');
  assert.equal(resolved.focusCandidateId, candidateIds[0]);
});

test('ready to tabsApplied is one-way and blocks duplicate tab apply', () => {
  const s = store();
  const { sessionId, generation } = s.createSession({
    runtimeId: 'rt-1',
    profileId: 'profile-a',
    sourceKind: 'chromium',
    sourceLabel: 'Chrome',
  });
  const { candidateIds } = s.assignCandidates(sessionId, candidates);
  s.resolveApply(sessionId, {
    generation,
    groups: [],
    ungroupedCandidateIds: candidateIds,
  });
  assert.equal(
    s.markTabsApplied(sessionId, generation, {
      tabIds: ['tab-a', 'tab-b'],
      focusTabId: 'tab-a',
    }).ok,
    true,
  );

  const again = s.resolveApply(sessionId, {
    generation,
    groups: [],
    ungroupedCandidateIds: candidateIds,
  });
  assert.equal(again.error, 'session-not-ready');

  const markAgain = s.markTabsApplied(sessionId, generation, {
    tabIds: ['tab-c'],
    focusTabId: 'tab-c',
  });
  assert.equal(markAgain.error, 'session-not-ready');
  assert.deepEqual(s.projectCandidates(sessionId), { candidates: [] });
  assert.equal(
    s.storeEmbeddings(sessionId, generation, [[0.1, 0.2]]).error,
    'session-not-ready',
  );
});

test('ownSession tracks tabsApplied ownership without candidates', () => {
  const s = store();
  const owner = { runtimeId: 'rt-1', profileId: 'profile-a' };
  const { sessionId, generation } = s.createSession({
    runtimeId: 'rt-1',
    profileId: 'profile-a',
    sourceKind: 'chromium',
    sourceLabel: 'Chrome',
  });
  s.assignCandidates(sessionId, candidates);
  assert.equal(s.ownSession(sessionId, owner).state, 'ready');
  s.markTabsApplied(sessionId, generation, {
    tabIds: ['tab-a'],
    focusTabId: 'tab-a',
  });
  const owned = s.ownSession(sessionId, owner);
  assert.equal(owned.ok, true);
  assert.equal(owned.state, 'tabsApplied');
  assert.equal(owned.focusTabId, 'tab-a');
  assert.deepEqual(owned.tabIds, ['tab-a']);
});

test('destroySession and idle expiry remove secrets', () => {
  const s = store();
  const { sessionId, generation } = s.createSession({
    runtimeId: 'rt-1',
    profileId: 'profile-a',
    sourceKind: 'chromium',
    sourceLabel: 'Chrome',
  });
  s.assignCandidates(sessionId, candidates);
  s.storeEmbeddings(sessionId, generation, [[0.1, 0.2]]);
  s.destroySession(sessionId, 'cancel');
  assert.equal(s.projectCandidates(sessionId).error, 'session-unavailable');

  const { sessionId: expiredId } = s.createSession({
    runtimeId: 'rt-2',
    profileId: 'profile-a',
    sourceKind: 'html',
    sourceLabel: 'HTML file',
  });
  s.assignCandidates(expiredId, candidates);
  s.expireIdleSessions(NOW + SESSION_TTL_MS + 1);
  assert.equal(s.projectCandidates(expiredId).error, 'session-unavailable');
});

test('idle expiry fires at the exact 15-minute boundary', () => {
  let clock = NOW;
  const s = createTabImportSessionStore({ now: () => clock, randomId, randomBytes });
  const { sessionId } = s.createSession({
    runtimeId: 'rt-ttl',
    profileId: 'profile-a',
    sourceKind: 'chromium',
    sourceLabel: 'Chrome',
  });
  clock = NOW + SESSION_TTL_MS;
  assert.equal(s.expireIdleSessions(), 1);
  assert.equal(s.projectCandidates(sessionId).error, 'session-unavailable');
});

test('candidate and applied-tab payloads are bounded inside the store', () => {
  const s = store();
  const { sessionId, generation } = s.createSession({
    runtimeId: 'rt-bounds',
    profileId: 'profile-a',
    sourceKind: 'chromium',
    sourceLabel: 'Chrome',
  });
  const tooMany = Array.from({ length: 501 }, (_, index) => ({
    ...candidates[0],
    url: `https://example.com/${index}`,
  }));
  assert.deepEqual(s.assignCandidates(sessionId, tooMany), {
    error: 'too-many-candidates',
    count: 501,
  });

  s.assignCandidates(sessionId, candidates);
  assert.deepEqual(s.markTabsApplied(sessionId, generation, {
    tabIds: Array.from({ length: 501 }, (_, index) => `tab-${index}`),
    focusTabId: 'tab-0',
  }), { error: 'invalid-apply-result' });
  assert.deepEqual(s.markTabsApplied(sessionId, generation, {
    tabIds: [],
    focusTabId: null,
  }), { error: 'invalid-apply-result' });
});

test('untrusted collection payloads fail closed instead of throwing', () => {
  const s = store();
  const { sessionId, generation } = s.createSession({
    runtimeId: 'rt-payload',
    profileId: 'profile-a',
    sourceKind: 'chromium',
    sourceLabel: 'Chrome',
  });
  s.assignCandidates(sessionId, candidates);
  assert.deepEqual(s.setSelection(sessionId, null), { error: 'invalid-selection' });
  assert.deepEqual(s.resolveApply(sessionId, null), { error: 'invalid-apply-request' });
  assert.deepEqual(s.resolveApply(sessionId, {
    generation,
    groups: {},
    ungroupedCandidateIds: [],
  }), { error: 'invalid-apply-request' });
  assert.deepEqual(s.markTabsApplied(sessionId, generation, null), {
    error: 'invalid-apply-result',
  });
});

test('ownership rejects cross-runtime access', () => {
  const s = store();
  const { sessionId } = s.createSession({
    runtimeId: 'rt-1',
    profileId: 'profile-a',
    sourceKind: 'chromium',
    sourceLabel: 'Chrome',
  });
  const denied = s.assignCandidates(sessionId, candidates, {
    runtimeId: 'rt-2',
    profileId: 'profile-a',
  });
  assert.equal(denied.error, 'forbidden');
  const wrongProfile = s.projectCandidates(sessionId, {
    runtimeId: 'rt-1',
    profileId: 'profile-b',
  });
  assert.equal(wrongProfile.error, 'forbidden');
});
