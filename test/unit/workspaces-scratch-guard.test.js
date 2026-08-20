'use strict';

// Overlay half of the scratch guard. After private tabs started counting as
// at-risk, "save first" can leave the window bound and still re-trip: save-as
// never captures private pages. retryScratchGuard used to drop onUnsavedScratch,
// so that re-trip became a dead-end notice and silently abandoned the original
// action. Save first is also a lie when every at-risk tab is private.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '../..');
const overlaySource = fs.readFileSync(path.join(ROOT, 'src/renderer/overlay.js'), 'utf8');

const lift = (name) => {
  const re = new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n  \\}`);
  const found = overlaySource.match(re)?.[0];
  assert.ok(found, `${name} not found in overlay.js — update this test with it`);
  return found;
};

function makeDom() {
  class El {
    constructor(tag) {
      this.tagName = String(tag).toUpperCase();
      this.childNodes = [];
      this.className = '';
      this.textContent = '';
      this.title = '';
    }
    append(...kids) { this.childNodes.push(...kids); }
    setAttribute() {}
    addEventListener() {}
  }
  return {
    createElement: (tag) => new El(tag),
  };
}

function buttonsOf(row) {
  return row.childNodes.filter((n) => n.tagName === 'BUTTON').map((n) => n.textContent);
}

test('retryScratchGuard re-shows the confirm if a post-save retry still trips', () => {
  const sandbox = {
    pendingScratchGuard: { kind: 'create', name: 'Target', tabCount: 2, privateCount: 1 },
    renderList() {},
    runWorkspaceMutation(_promise, opts) { sandbox.mutateOpts = opts; },
    window: {
      browserAPI: {
        createBlankWorkspace() { return Promise.resolve(); },
        closeOverlay() {},
      },
    },
  };
  vm.runInNewContext(
    `${lift('rememberScratchGuard')}
     ${lift('retryScratchGuard')}
     this.__fn = retryScratchGuard;`,
    sandbox,
  );
  sandbox.__fn(false);
  assert.equal(typeof sandbox.mutateOpts.onUnsavedScratch, 'function',
    'a re-trip after save-first must not fall through to the dead-end notice');

  sandbox.mutateOpts.onUnsavedScratch({ tabCount: 1, privateCount: 1 });
  assert.equal(sandbox.pendingScratchGuard.kind, 'create');
  assert.equal(sandbox.pendingScratchGuard.name, 'Target');
  assert.equal(sandbox.pendingScratchGuard.tabCount, 1);
  assert.equal(sandbox.pendingScratchGuard.privateCount, 1);
  assert.equal(sandbox.pendingScratchGuard.awaitingSave, undefined,
    'a re-shown confirm is a fresh decision, not still awaiting the save that just ran');
});

test('scratchGuardRow omits save first when every at-risk tab is private', () => {
  const sandbox = {
    document: makeDom(),
    pendingScratchGuard: { tabCount: 1, privateCount: 1 },
    beginScratchGuardSaveFirst() {},
    discardScratchGuard() {},
    cancelScratchGuard() {},
  };
  vm.runInNewContext(`${lift('scratchGuardRow')}\nthis.__row = scratchGuardRow;`, sandbox);
  const row = sandbox.__row();
  assert.equal(row.childNodes[0].textContent, '1 private tab will close.');
  assert.deepEqual(buttonsOf(row), ['discard', 'cancel'],
    'save-as cannot capture a private tab, so offering save first is a dead end');
});

test('scratchGuardRow still offers save first when a persistable tab is also at risk', () => {
  const sandbox = {
    document: makeDom(),
    pendingScratchGuard: { tabCount: 2, privateCount: 1 },
    beginScratchGuardSaveFirst() {},
    discardScratchGuard() {},
    cancelScratchGuard() {},
  };
  vm.runInNewContext(`${lift('scratchGuardRow')}\nthis.__row = scratchGuardRow;`, sandbox);
  const row = sandbox.__row();
  assert.equal(row.childNodes[0].textContent, '2 unsaved tabs will close.');
  assert.deepEqual(buttonsOf(row), ['save first', 'discard', 'cancel']);
});
