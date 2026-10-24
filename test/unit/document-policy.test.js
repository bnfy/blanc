'use strict';
// Page-opened tabs' inherited document policy (src/main/document-policy.js):
// the fresh-view refusal, the saved stamp, legacy vs malformed records, and
// every pure consumer that must carry or honor the mark.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const policy = require('../../src/main/document-policy');
const { filterRestoredSession } = require('../../src/main/session-restore');
const { entryFrom } = require('../../src/main/session-workspace');
const { syncSnapshot, persistableUrl, sessionTabMeta } = require('../../src/main/session-snapshot');
const { sleepCandidates } = require('../../src/main/tab-sleep');

const keep = () => false;

test('a fresh view is refused only for a marked tab that is not inert', () => {
  assert.equal(policy.mayBuildFreshView(undefined), true);
  assert.equal(policy.mayBuildFreshView({}), true);
  assert.equal(policy.mayBuildFreshView({ inheritsDocumentPolicy: false }), true);
  assert.equal(policy.mayBuildFreshView({ inheritsDocumentPolicy: true }), false);
  assert.equal(policy.mayBuildFreshView({ inheritsDocumentPolicy: true, inert: true }), true);
});

test('the inert page is the error page in its own mode, and unwraps to the real address', () => {
  const url = policy.inertPageUrl('https://example.test/a?b=1', 'A page');
  assert.ok(url.startsWith('blanc://error/?'));
  assert.equal(policy.isInertPageUrl(url), true);
  assert.equal(policy.isInertPageUrl('blanc://error/?url=https%3A%2F%2Fexample.test%2F&code=-105'), false);
  assert.equal(policy.isInertPageUrl('https://example.test/'), false);
  assert.equal(persistableUrl(url), 'https://example.test/a?b=1', 'a relaunch keeps the real address');
  // Unlike an error page, an inert tab keeps its own title in session meta.
  assert.equal(sessionTabMeta({ url, title: 'A page' }).title, 'A page');
  assert.equal(sessionTabMeta({ url: 'blanc://error/?url=x&code=-105', title: 'Page failed to load' }).title, '');
});

test('stamped records need an explicit boolean; legacy records restore as before (4a)', () => {
  const stamped = { documentPolicy: 1, inheritsDocumentPolicy: [true, false, null, 'yes'] };
  assert.equal(policy.restoredMarker(stamped, 0), true);
  assert.equal(policy.restoredMarker(stamped, 1), false);
  assert.equal(policy.restoredMarker(stamped, 2), true, 'null is malformed, so inert');
  assert.equal(policy.restoredMarker(stamped, 3), true, 'a non-boolean is malformed, so inert');
  assert.equal(policy.restoredMarker(stamped, 9), true, 'a missing value is malformed, so inert');
  assert.equal(policy.restoredMarker({ documentPolicy: 1 }, 0), true, 'a stamp without its column');
  assert.equal(policy.restoredMarker({ documentPolicy: 2, inheritsDocumentPolicy: [false] }, 0), true,
    'an unknown stamp is never read as safe');
  assert.equal(policy.restoredMarker({ documentPolicy: null, inheritsDocumentPolicy: [false] }, 0), true);
  assert.equal(policy.restoredMarker({ urls: ['https://a.test/'] }, 0), false, 'legacy: accepted risk (4a)');
  assert.equal(policy.restoredMarker(undefined, 0), false);

  assert.equal(policy.restoredEntryMarker({ documentPolicy: 1, inheritsDocumentPolicy: true }), true);
  assert.equal(policy.restoredEntryMarker({ documentPolicy: 1, inheritsDocumentPolicy: false }), false);
  assert.equal(policy.restoredEntryMarker({ documentPolicy: 1 }), true);
  assert.equal(policy.restoredEntryMarker({ documentPolicy: 1, inheritsDocumentPolicy: 0 }), true);
  assert.equal(policy.restoredEntryMarker({ url: 'https://a.test/' }), false);
});

test('the writer stamps every tab with an explicit boolean', () => {
  assert.deepEqual(policy.stampedColumn([{ inheritsDocumentPolicy: true }, {}, null]), {
    documentPolicy: 1, inheritsDocumentPolicy: [true, false, false],
  });
  assert.deepEqual(policy.stampedEntry({ inheritsDocumentPolicy: true }), { documentPolicy: 1, inheritsDocumentPolicy: true });
  assert.deepEqual(policy.stampedEntry({}), { documentPolicy: 1, inheritsDocumentPolicy: false });
});

test('the session normalizer keeps the stamp and turns malformed values into null', () => {
  const urls = ['https://a.test/', 'https://b.test/'];
  const legacy = entryFrom({ urls });
  assert.equal('documentPolicy' in legacy, false);
  assert.equal('inheritsDocumentPolicy' in legacy, false);
  const stamped = entryFrom({ urls, documentPolicy: 1, inheritsDocumentPolicy: [true, 'no'] });
  assert.equal(stamped.documentPolicy, 1);
  assert.deepEqual(stamped.inheritsDocumentPolicy, [true, null]);
  assert.equal(policy.restoredMarker(stamped, 1), true);
  assert.deepEqual(entryFrom({ urls, documentPolicy: 1, inheritsDocumentPolicy: 'x' }).inheritsDocumentPolicy, []);
});

test('restore filtering zips each mark with its own tab', () => {
  const saved = {
    urls: ['https://a.test/', 'blanc://settings/', 'https://c.test/', 'https://d.test/'],
    documentPolicy: 1,
    inheritsDocumentPolicy: [false, true, true, 7],
  };
  const cleaned = filterRestoredSession(saved, (url) => url.startsWith('blanc://settings'));
  assert.deepEqual(cleaned.urls, ['https://a.test/', 'https://c.test/', 'https://d.test/']);
  assert.equal(cleaned.documentPolicy, 1);
  assert.deepEqual(cleaned.inheritsDocumentPolicy, [false, true, true], 'the malformed 7 stays marked');
  const legacy = filterRestoredSession({ urls: ['https://a.test/'] }, keep);
  assert.equal('documentPolicy' in legacy, false, 'legacy stays legacy');
  assert.equal(policy.restoredMarker(legacy, 0), false);
});

test('the Spaces store round-trips the stamp and its column', () => {
  const modelSource = fs.readFileSync(path.join(__dirname, '../../src/main/workspaces-model.js'), 'utf8');
  assert.match(modelSource, /OPTIONAL_CAPTURE_COLUMNS = \[[^\]]*'documentPolicy', 'inheritsDocumentPolicy'/);
  assert.equal((modelSource.match(/\.\.\.savedPolicyColumns\(/g) ?? []).length, 2,
    'both the loader and the capture writer carry the columns');
});

test('a marked tab never leaves this device through tab sync', () => {
  const snapshot = syncSnapshot([
    { id: 'a', url: 'https://a.test/', title: 'A' },
    { id: 'b', url: 'https://b.test/', title: 'B', inheritsDocumentPolicy: true },
    { id: 'c', url: 'https://c.test/', title: 'C', inheritsDocumentPolicy: true, inert: true },
  ], []);
  assert.deepEqual(snapshot.tabs.map((tab) => tab.url), ['https://a.test/']);
});

test('a marked tab never goes quiet unless it is inert', () => {
  const base = { restorableCommit: true, httpEntryCount: 1, lastActiveAt: 0 };
  const tabs = [
    { ...base, id: 'active' },
    { ...base, id: 'plain' },
    { ...base, id: 'marked', inheritsDocumentPolicy: true },
    { ...base, id: 'inert', inheritsDocumentPolicy: true, inert: true },
  ];
  const ids = sleepCandidates(tabs, { activeTabId: 'active', now: 10 * 60 * 60 * 1000, thresholdMs: 1 })
    .map((tab) => tab.id ?? tab);
  assert.ok(ids.includes('plain'));
  assert.ok(ids.includes('inert'));
  assert.ok(!ids.includes('marked'));
});

test('only createTabView builds a tab WebContentsView', () => {
  const dir = path.join(__dirname, '../../src/main');
  for (const file of fs.readdirSync(dir).filter((name) => name.endsWith('.js'))) {
    const source = fs.readFileSync(path.join(dir, file), 'utf8');
    for (const match of source.matchAll(/new WebContentsView\(\{[\s\S]{0,200}?TAB_WEB_PREFERENCES/g)) {
      // The utility sheet shares the page preferences but is never a tab.
      const sheet = file === 'main.js' && /function createUtilitySheet\(\) \{\n[^\n]*\n[^\n]*$/
        .test(source.slice(0, match.index));
      assert.ok(file === 'tab-view.js' || sheet,
        `${file} builds a tab view outside createTabView: ${match[0].slice(0, 60)}`);
    }
  }
  const tabView = fs.readFileSync(path.join(dir, 'tab-view.js'), 'utf8');
  const body = tabView.match(/function createTabView\(tab\) \{[\s\S]*?\n\}/)[0];
  assert.match(body, /if \(!mayBuildFreshView\(tab\)\) return null;/);
});
