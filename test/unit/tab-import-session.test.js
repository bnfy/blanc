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
    addedAt: NOW - 1000,
    folderPath: ['reading'],
    favoriteFolder: 'reading',
    sourceFolderId: 'folder-reading',
  },
  {
    url: 'https://other.example/',
    title: 'Other',
    addedAt: NOW - 500,
    folderPath: [],
    favoriteFolder: null,
    sourceFolderId: 'folder-root',
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
    sourceKind: 'html',
    sourceLabel: 'HTML file',
  });
  s.assignCandidates(sessionId, candidates);
  const projected = s.projectCandidates(sessionId);
  assert.equal(projected.candidates.length, 2);
  assert.equal('url' in projected.candidates[0], false);
  assert.equal(projected.candidates[0].hostname, 'article.example');
  assert.deepEqual(projected.candidates[0].folderPath, ['reading']);
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
  const resolved = s.resolveApply(sessionId, {
    generation,
    groups: [],
    ungroupedCandidateIds: candidateIds,
  });
  assert.equal(
    s.markTabsApplied(sessionId, generation, {
      tabIds: ['tab-a', 'tab-b'],
      focusTabId: 'tab-a',
      favoriteEntries: resolved.entries.map((entry) => ({
        url: entry.url,
        title: entry.title,
        favicon: null,
        addedAt: entry.addedAt,
        folder: entry.favoriteFolder,
      })),
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
    favoriteEntries: [],
  });
  assert.equal(markAgain.error, 'session-not-ready');
  assert.deepEqual(s.projectCandidates(sessionId), { candidates: [] });
  assert.equal(
    s.storeEmbeddings(sessionId, generation, [[0.1, 0.2]]).error,
    'session-not-ready',
  );
});

test('resolveFavoritesRetry returns bounded payload only after tabsApplied', () => {
  const s = store();
  const { sessionId, generation } = s.createSession({
    runtimeId: 'rt-1',
    profileId: 'profile-a',
    sourceKind: 'chromium',
    sourceLabel: 'Chrome',
  });
  const favoriteEntries = [{
    url: 'https://article.example/',
    title: 'Article',
    favicon: null,
    addedAt: NOW,
    folder: 'reading',
  }];
  assert.equal(s.resolveFavoritesRetry(sessionId, generation).error, 'session-not-ready');
  s.markTabsApplied(sessionId, generation, {
    tabIds: ['tab-a'],
    focusTabId: 'tab-a',
    favoriteEntries,
  });
  const retry = s.resolveFavoritesRetry(sessionId, generation);
  assert.deepEqual(retry.favoriteEntries, favoriteEntries);
  assert.equal('tabIds' in retry, false);
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

test('candidate and retry payloads are bounded inside the store', () => {
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
    favoriteEntries: [],
  }), { error: 'invalid-apply-result' });
  assert.deepEqual(s.markTabsApplied(sessionId, generation, {
    tabIds: ['tab-a'],
    focusTabId: 'tab-a',
    favoriteEntries: Array.from({ length: 501 }, () => ({
      url: 'https://example.com/',
    })),
  }), { error: 'invalid-apply-result' });
  assert.deepEqual(s.markTabsApplied(sessionId, generation, {
    tabIds: [],
    focusTabId: null,
    favoriteEntries: [],
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
