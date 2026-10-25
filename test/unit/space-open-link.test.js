'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { canOpenLinkInSpace, linkTitle, openLinkInSpace } = require('../../src/main/space-open-link');
const { appendTabToCapture } = require('../../src/main/space-move');
const { linkMenuItems } = require('../../src/main/glance-open-link');
const { englishT } = require('../support/english-t');
const { harness, settle } = require('../support/workspace-ui-dom');
const url = 'https://example.test/article';
const opener = { id: 'source' };
const base = { urls: ['https://old.test/'], groupIds: ['group'], pinned: [true], meta: [{ title: 'Old' }], groups: [{ id: 'group' }], activeIndex: 0, localFiles: [false], splitIds: [null], tabIds: ['a'.repeat(32)], documentPolicy: 1, inheritsDocumentPolicy: [true] };
function flow({ visible = false, resident = false, failWrite = false, failCreate = false, failRollback = false } = {}) {
  const events = []; let saved = structuredClone(base);
  const deps = {
    title: '  Read me  ', check: () => ({ ok: true, visible, resident }),
    capture: () => structuredClone(saved),
    write: next => { events.push('write'); if (failWrite) return { ok: false, error: 'storage-failed' }; saved = next; return { ok: true }; },
    create: (u, title, asleep) => { events.push(['create', u, title, asleep]); if (failCreate) throw new Error('fail'); return 'tab'; },
    rollback: () => { events.push('rollback'); if (failRollback) throw new Error('fail'); },
  };
  return { events, run: () => openLinkInSpace(opener, url, 'space', deps), get saved() { return saved; } };
}
test('only normal web links can be sent to spaces; checking OS links has no side effects', () => {
  for (const link of ['mailto:a@b.test', 'tel:123', 'javascript:alert(1)', 'file:///tmp/a', 'data:text/html,a', 'chrome-extension://id/page', 'blanc://settings/', 'nonsense', 'https://']) {
    assert.equal(canOpenLinkInSpace(opener, link), false, link);
  }
  assert.equal(canOpenLinkInSpace(opener, url), true);
  assert.equal(canOpenLinkInSpace({ private: true }, url), false);
  assert.equal(linkTitle(url, '  '), url); assert.equal(linkTitle(url, 'x'.repeat(300)).length, 200);
});
test('visible target loads a background tab without a deferred capture write', () => {
  const h = flow({ visible: true }); assert.equal(h.run().ok, true);
  assert.deepEqual(h.events, [['create', url, 'Read me', false]]);
});
test('resident target writes first, then adds a quiet tab; all columns stay zipped', () => {
  const h = flow({ resident: true }); assert.equal(h.run().ok, true);
  assert.deepEqual(h.events, ['write', ['create', url, 'Read me', true]]);
  for (const column of ['urls', 'groupIds', 'pinned', 'meta', 'localFiles', 'splitIds', 'tabIds', 'inheritsDocumentPolicy']) assert.equal(h.saved[column].length, 2, column);
  assert.equal(h.saved.inheritsDocumentPolicy[1], false); assert.equal(h.saved.tabIds[1], null);
  assert.equal(h.saved.activeIndex, 0); assert.equal(h.saved.groupIds[1], null);
});
test('closed target saves the link without creating a runtime or tab', () => {
  const h = flow(); assert.equal(h.run().ok, true); assert.deepEqual(h.events, ['write']); assert.equal(h.saved.urls[1], url);
});
test('write failure preserves the old record and creates nothing', () => {
  const h = flow({ resident: true, failWrite: true }); assert.equal(h.run().error, 'storage-failed');
  assert.deepEqual(h.events, ['write']); assert.deepEqual(h.saved, base);
});
test('creation failure removes partial additions and restores the previous record', () => {
  const h = flow({ resident: true, failCreate: true }); assert.equal(h.run().error, 'activation-failed');
  assert.deepEqual(h.events, ['write', ['create', url, 'Read me', true], 'rollback', 'write']); assert.deepEqual(h.saved, base);
});
test('uncertain cleanup retains the write-ahead link and reports failure', () => {
  const h = flow({ resident: true, failCreate: true, failRollback: true }); assert.equal(h.run().ok, false);
  assert.equal(h.saved.urls[1], url); assert.equal(h.events.filter(e => e === 'write').length, 1);
});
const main = fs.readFileSync(require.resolve('../../src/main/main.js'), 'utf8');
const sourceOf = name => main.match(new RegExp(`function ${name}\\([\\s\\S]*?\\n\\}`))[0];
function menuHarness() {
  const source = { profileId: 'p', workspaceId: 'here' }, other = {};
  const tab = { id: 'page' }; let owner = source, items = [{ id: 'here', name: 'Here' }, { id: 'there', name: 'There' }];
  const calls = [];
  const sandbox = { rt: () => source, tabs: new Map([[tab.id, tab]]), windowRuntimes: { runtimeForTab: () => owner },
    canOpenLinkInSpace, linkTitle, sessionReadOnly: false, profileDeletions: { hasPendingProfileDeletion: () => false },
    namedWorkspaces: { list: () => items }, MAX_WORKSPACES: 25, spaceCanReceive: () => true,
    withWindowRuntime: (_r, fn) => fn(), openLinkInSpace: (...args) => calls.push(args), mainI18n: { t: englishT },
    showOverlay: (...args) => calls.push(args),
  };
  vm.runInNewContext(`${sourceOf('linkSpaceSource')}\n${sourceOf('linkSpaceMenuItems')}\nthis.menu = linkSpaceMenuItems`, sandbox);
  return { tab, source, calls, menu: () => sandbox.menu(tab, url, 'Read me'), set items(v) { items = v; }, move() { owner = other; } };
}
test('menu order, current-space exclusion, no-space and private hiding, cap and stale source guard', () => {
  const h = menuHarness();
  const items = linkMenuItems({ linkURL: url }, { spaceItems: h.menu }, englishT);
  assert.deepEqual(items.map(i => i.label), ['Open Link in New Tab', 'Open Link in Glance', 'Open Link in Space', 'Copy Link Address']);
  let menu = h.menu()[0].submenu; assert.equal(menu[0].id, 'link-space:there');
  menu.at(-1).click(); assert.equal(h.source.newSpaceLink.url, url);
  h.items = [{ id: 'here' }]; assert.equal(h.menu()[0].submenu.length, 1); assert.equal(h.menu()[0].submenu[0].enabled, true);
  h.items = Array.from({ length: 25 }, (_, i) => ({ id: String(i) })); assert.equal(h.menu()[0].submenu.at(-1).enabled, false);
  h.items = []; assert.equal(h.menu().length, 0);
  h.items = [{ id: 'there' }]; h.tab.private = true; assert.equal(h.menu().length, 0); h.tab.private = false;
  h.move(); assert.equal(h.menu().length, 0);
});
test('New Space with a link uses fixed text, submits only identity, and closes on success', async () => {
  let args; const h = harness({ createSpaceWithLink: async (...values) => { args = values; return { ok: true }; } });
  h.ui.begin('new', null, { start: 'link', tabTitle: 'Chosen article' });
  assert.match(h.text(), /With this link.*Chosen article/); assert.equal(h.byKey('start:empty'), undefined);
  const input = h.doc.getElementById('workspaceName'); input.value = 'Reading'; input.emit('input');
  h.popup.querySelector('#workspaceEditor').emit('submit'); await settle();
  assert.equal(args.length, 2); assert.equal(args[0], 'Reading'); assert.ok(args[1].color); assert.equal(h.ui.opened, false);
});
test('link editor failure keeps the draft and cancel writes nothing; errors use the Spaces list', async () => {
  let calls = 0; const h = harness({ createSpaceWithLink: async () => { calls++; return { ok: false, error: 'storage-failed' }; } });
  h.ui.begin('new', null, { start: 'link' }); const input = h.doc.getElementById('workspaceName'); input.value = 'Reading'; input.emit('input');
  h.popup.querySelector('#workspaceEditor').emit('submit'); await settle();
  assert.equal(h.ui.state.kind, 'new'); assert.equal(h.doc.getElementById('workspaceName').value, 'Reading'); assert.ok(h.ui.state.error);
  h.ui.cancel(); assert.equal(h.ui.opened, false); assert.equal(calls, 1);
  h.ui.showLinkError('Reading', 'storage-failed'); assert.match(h.text(), /Couldn’t open the link in Reading/);
});
test('link creation validates the retained source and commits just one saved capture', () => {
  const source = { overlayMode: 'spaces', overlayPurpose: { newSpaceLinkTitle: 'Read me' }, newSpaceLink: { tabId: 'source', url, title: 'Read me' } };
  let request, allowed = true;
  const sandbox = { rt: () => source, tabs: new Map([['source', opener]]), linkSpaceSource: () => allowed, takeSpaceMoveFault: () => null,
    appendTabToCapture, namedWorkspaces: { create: value => { request = value; return { ok: true, workspace: { id: 'new', name: value.name } }; } },
    noteSpaceCreated() {}, announceSplit() {}, mainI18n: { t: englishT }, broadcastWorkspacesUpdated() {}, workspacesProjection: () => ({ items: [] }) };
  vm.runInNewContext(`${sourceOf('createSpaceWithLink')}\nthis.create = createSpaceWithLink`, sandbox);
  allowed = false; assert.equal(sandbox.create('Reading', {}).ok, false); assert.equal(request, undefined);
  allowed = true; assert.equal(sandbox.create('Reading', { color: '#426c4c', symbol: 'book' }).ok, true);
  assert.equal(request.capture.urls[0], url); assert.equal(request.capture.meta[0].title, 'Read me'); assert.equal(request.color, '#426c4c');
  assert.equal(source.newSpaceLink, null); assert.equal(sandbox.create('Again', {}).ok, false);
});

test('legacy captures with absent metadata keep every appended column aligned', () => {
  const next = appendTabToCapture({ urls: ['https://old.test/'], documentPolicy: 1 }, { url, meta: { title: 'New' } });
  assert.deepEqual(next.groupIds, [null, null]); assert.deepEqual(next.pinned, [false, false]);
  assert.deepEqual(next.meta, [{}, { title: 'New' }]); assert.deepEqual(next.inheritsDocumentPolicy, [false, false]);
});
test('failed rollback write retains the saved link and reports failure rather than success', () => {
  let saved = structuredClone(base), writes = 0;
  const result = openLinkInSpace(opener, url, 'space', {
    check: () => ({ ok: true, resident: true }), capture: () => saved,
    write: next => { if (++writes === 2) return { ok: false }; saved = next; return { ok: true }; },
    create: () => { throw new Error('failed'); }, rollback() {},
  });
  assert.equal(result.ok, false); assert.equal(writes, 2); assert.equal(saved.urls.at(-1), url);
});
