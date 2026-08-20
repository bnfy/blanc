'use strict';

// Regression: the workspaces row editors (rename / "new…") are built into a
// DETACHED element and only reach the document when renderList runs its
// replaceChildren. `focus()` on a disconnected node is silently a no-op, so
// focusing at build time left the caret in the address input: the user's
// keystrokes went to the address bar, which flipped the panel into search mode
// (destroying the editor row) and made Enter navigate instead of commit. The
// editors must therefore record their intent and let renderList apply it once
// the row is live.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '../..');
const overlaySource = fs.readFileSync(path.join(ROOT, 'src/renderer/overlay.js'), 'utf8');

const lift = (name, source = overlaySource) => {
  const re = new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n  \\}`);
  const found = source.match(re)?.[0];
  assert.ok(found, `${name} not found in overlay.js — update this test with it`);
  return found;
};

/** The minimum DOM needed by the editors, with the one load-bearing browser
 * semantic this regression turns on: focus() only lands on a connected node. */
function makeDom() {
  const doc = { activeElement: null, root: null };
  class El {
    constructor(tag) {
      this.tagName = tag.toUpperCase();
      this.childNodes = [];
      this.parentNode = null;
      this.className = '';
      this.classList = {
        set: new Set(),
        add(c) { this.set.add(c); },
        contains(c) { return this.set.has(c); },
      };
    }
    append(...kids) { for (const k of kids) { k.parentNode = this; this.childNodes.push(k); } }
    replaceChildren(...kids) {
      for (const c of this.childNodes) c.parentNode = null;
      this.childNodes = [];
      this.append(...kids);
    }
    contains(el) { for (let n = el; n; n = n.parentNode) if (n === this) return true; return false; }
    get isConnected() { let n = this; while (n.parentNode) n = n.parentNode; return n === doc.root; }
    setAttribute() {}
    addEventListener() {}
    focus() { if (this.isConnected) doc.activeElement = this; }
    setSelectionRange(a, b) { this.selectionRange = [a, b]; }
    select() { this.selected = true; }
  }
  doc.createElement = (tag) => new El(tag);
  const islandList = new El('div');
  doc.root = islandList; // the list IS the document root for this stub
  return { doc, islandList, El };
}

function sandboxFor({ doc, islandList }, extra = {}) {
  const sandbox = {
    document: doc,
    islandList,
    pendingEditorFocus: null,
    claimEditorFocus: true,
    createWorkspaceValue: '',
    workspaceEditValue: '',
    currentCreateCaret: () => null,
    currentEditCaret: () => null,
    commitCreateWorkspace() {},
    cancelCreateWorkspace() {},
    commitWorkspaceRename() {},
    cancelWorkspaceEdit() {},
    ...extra,
  };
  vm.runInNewContext(
    `${lift('renderCreateWorkspaceEditor')}
     ${lift('renderWorkspaceRenameEditor')}
     ${lift('focusPendingEditor')}
     this.__create = renderCreateWorkspaceEditor;
     this.__rename = renderWorkspaceRenameEditor;
     this.__applyFocus = focusPendingEditor;`,
    sandbox,
  );
  return sandbox;
}

test('an incidental re-render does not yank focus into an already-open editor', () => {
  const dom = makeDom();
  const sandbox = sandboxFor(dom, { claimEditorFocus: true });

  const first = sandbox.__create();
  dom.islandList.replaceChildren(first);
  sandbox.__applyFocus();
  assert.equal(dom.doc.activeElement?.className, 'row-edit-input');

  // The user clicked the address input (a sibling of islandList, so it
  // survives replaceChildren). Mimic that by parking activeElement elsewhere
  // and answering currentCreateCaret with null — the editor is open, but it
  // does not currently hold focus.
  const address = new dom.El('input');
  address.className = 'address-input';
  address.focus = function focus() { dom.doc.activeElement = this; };
  address.focus();
  sandbox.currentCreateCaret = () => null;
  sandbox.claimEditorFocus = false;

  const second = sandbox.__create();
  dom.islandList.replaceChildren(second);
  sandbox.__applyFocus();
  assert.equal(dom.doc.activeElement?.className, 'address-input',
    'tabs:updated must not steal the caret out of the address input');
  assert.equal(sandbox.pendingEditorFocus, null);
});

test('a re-render restores the caret only when the editor already held focus', () => {
  const dom = makeDom();
  const sandbox = sandboxFor(dom, {
    claimEditorFocus: false,
    currentCreateCaret: () => 3,
  });

  const row = sandbox.__create();
  assert.ok(sandbox.pendingEditorFocus, 'an editor that already held focus must re-claim it');
  dom.islandList.replaceChildren(row);
  sandbox.__applyFocus();
  assert.equal(dom.doc.activeElement?.className, 'row-edit-input');
  assert.deepEqual(dom.doc.activeElement.selectionRange, [3, 3]);
});

test('the create editor does not try to focus a row that is still detached', () => {
  const dom = makeDom();
  const sandbox = sandboxFor(dom);

  const row = sandbox.__create();
  assert.equal(dom.doc.activeElement, null,
    'building the editor must not attempt focus — the row is not in the document yet');
  assert.ok(sandbox.pendingEditorFocus, 'the wanted focus must be recorded for renderList');

  dom.islandList.replaceChildren(row);
  sandbox.__applyFocus();
  assert.equal(dom.doc.activeElement?.className, 'row-edit-input',
    'once the row is live, renderList must put the caret in the editor');
  assert.equal(sandbox.pendingEditorFocus, null, 'the intent is consumed exactly once');
});

test('the rename editor defers its focus and selection the same way', () => {
  const dom = makeDom();
  const sandbox = sandboxFor(dom);

  const row = dom.doc.createElement('div');
  sandbox.__rename(row, { id: 'ws-1', name: 'Work' });
  assert.equal(dom.doc.activeElement, null);

  dom.islandList.replaceChildren(row);
  sandbox.__applyFocus();
  assert.equal(dom.doc.activeElement?.className, 'row-edit-input');
  assert.ok(dom.doc.activeElement.selected,
    'a rename starts with the old name selected so typing replaces it');
});

test('a recorded focus for a row that never rendered is dropped, not applied', () => {
  const dom = makeDom();
  const sandbox = sandboxFor(dom);

  sandbox.__create(); // built, then the render took a different branch
  sandbox.__applyFocus();
  assert.equal(dom.doc.activeElement, null, 'a detached editor must never steal focus');
  assert.equal(sandbox.pendingEditorFocus, null, 'and the stale intent must not linger');
});

test('renderList applies the pending editor focus after it inserts the rows', () => {
  const renderList = lift('renderList');
  assert.match(renderList, /focusPendingEditor\(\)/,
    'renderList must apply the deferred editor focus');
  const lastInsert = renderList.lastIndexOf('replaceChildren');
  assert.ok(renderList.indexOf('focusPendingEditor()') > lastInsert,
    'the focus must be applied after the rows are in the document, not before');
  // An inline focus() in either editor is the bug this test exists for.
  assert.doesNotMatch(lift('renderCreateWorkspaceEditor'), /input\.focus\(\)/);
  assert.doesNotMatch(lift('renderWorkspaceRenameEditor'), /input\.focus\(\)/);
  assert.match(lift('renderCreateWorkspaceEditor'), /caret != null \|\| claimEditorFocus/);
  assert.match(lift('renderWorkspaceRenameEditor'), /caret != null \|\| claimEditorFocus/);
  assert.match(lift('beginCreateWorkspace'), /claimEditorFocus = true/);
});
