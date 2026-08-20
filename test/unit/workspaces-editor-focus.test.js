'use strict';

// Regression: workspace name editors (create / save-as / rename) live in the
// footer popover. They are built into a DETACHED tree and only reach the
// document when renderWorkspaceSwitcherList runs replaceChildren — and the
// open path briefly measures with visibility:hidden, which also makes
// focus() a silent no-op. Focusing at the wrong moment left the caret in the
// address input: keystrokes never reached the name field and Enter did not
// commit. Editors must record intent and apply it only once the input is
// connected AND the switcher is visible.

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

/** Minimum DOM: focus() only lands on a connected node that is not under a
 * visibility:hidden ancestor (the openWorkspaceSwitcher measure window). */
function makeDom() {
  const state = { active: null, root: null };
  class El {
    constructor(tag) {
      this.tagName = tag.toUpperCase();
      this.childNodes = [];
      this.parentNode = null;
      this.className = '';
      this.hidden = false;
      this.style = { visibility: '' };
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
    get isConnected() { let n = this; while (n.parentNode) n = n.parentNode; return n === state.root; }
    isFocusable() {
      if (!this.isConnected) return false;
      for (let n = this; n; n = n.parentNode) {
        if (n.hidden || n.style?.visibility === 'hidden') return false;
      }
      return true;
    }
    setAttribute() {}
    addEventListener() {}
    focus() { if (this.isFocusable()) state.active = this; }
    setSelectionRange(a, b) { this.selectionRange = [a, b]; }
    select() { this.selected = true; }
  }
  const doc = {
    createElement: (tag) => new El(tag),
    get activeElement() { return state.active; },
    set activeElement(v) { state.active = v; },
  };
  const islandList = new El('div');
  const workspaceSwitcher = new El('div');
  const workspaceSwitcherList = new El('div');
  workspaceSwitcher.append(workspaceSwitcherList);
  const root = new El('div');
  root.append(islandList, workspaceSwitcher);
  state.root = root;
  return { doc, islandList, workspaceSwitcher, workspaceSwitcherList, El, state };
}

function sandboxFor(dom, extra = {}) {
  const sandbox = {
    document: dom.doc,
    islandList: dom.islandList,
    workspaceSwitcher: dom.workspaceSwitcher,
    pendingEditorFocus: null,
    claimEditorFocus: true,
    createWorkspaceValue: '',
    saveAsWorkspaceValue: '',
    workspaceEditValue: '',
    currentSwitcherCaret: () => null,
    ...extra,
  };
  vm.runInNewContext(
    `${lift('renderSwitcherNameInput')}
     ${lift('focusPendingEditor')}
     this.__nameInput = renderSwitcherNameInput;
     this.__applyFocus = focusPendingEditor;`,
    sandbox,
  );
  return sandbox;
}

function mountCreateEditor(sandbox, dom) {
  const input = sandbox.__nameInput({
    value: sandbox.createWorkspaceValue,
    placeholder: 'name this workspace',
    ariaLabel: 'Name for the new workspace',
    onInput: (v) => { sandbox.createWorkspaceValue = v; },
    onCommit() {},
    onCancel() {},
    selectAll: false,
    caret: sandbox.currentSwitcherCaret(),
  });
  const wrap = dom.doc.createElement('div');
  wrap.className = 'ws-switcher-editor';
  wrap.append(input);
  return { wrap, input };
}

test('an incidental re-render does not yank focus into an already-open editor', () => {
  const dom = makeDom();
  const sandbox = sandboxFor(dom, { claimEditorFocus: true });

  const first = mountCreateEditor(sandbox, dom);
  dom.workspaceSwitcherList.replaceChildren(first.wrap);
  sandbox.__applyFocus();
  assert.equal(dom.doc.activeElement?.className, 'ws-switcher-input');

  const address = new dom.El('input');
  address.className = 'address-input';
  address.focus = function focus() { dom.state.active = this; };
  address.focus();
  sandbox.currentSwitcherCaret = () => null;
  sandbox.claimEditorFocus = false;

  const second = mountCreateEditor(sandbox, dom);
  dom.workspaceSwitcherList.replaceChildren(second.wrap);
  sandbox.__applyFocus();
  assert.equal(dom.doc.activeElement?.className, 'address-input',
    'tabs:updated must not steal the caret out of the address input');
  assert.equal(sandbox.pendingEditorFocus, null);
});

test('a re-render restores the caret only when the editor already held focus', () => {
  const dom = makeDom();
  const sandbox = sandboxFor(dom, {
    claimEditorFocus: false,
    currentSwitcherCaret: () => 3,
  });

  const { wrap, input } = mountCreateEditor(sandbox, dom);
  assert.ok(sandbox.pendingEditorFocus, 'an editor that already held focus must re-claim it');
  // Pretend the caret helper saw focus in this input.
  sandbox.currentSwitcherCaret = () => 3;
  dom.workspaceSwitcherList.replaceChildren(wrap);
  sandbox.__applyFocus();
  assert.equal(dom.doc.activeElement?.className, 'ws-switcher-input');
  assert.deepEqual(dom.doc.activeElement.selectionRange, [3, 3]);
  void input;
});

test('the create editor does not try to focus a row that is still detached', () => {
  const dom = makeDom();
  const sandbox = sandboxFor(dom);

  const { wrap } = mountCreateEditor(sandbox, dom);
  assert.equal(dom.doc.activeElement, null,
    'building the editor must not attempt focus — the input is not in the document yet');
  assert.ok(sandbox.pendingEditorFocus, 'the wanted focus must be recorded');

  dom.workspaceSwitcherList.replaceChildren(wrap);
  sandbox.__applyFocus();
  assert.equal(dom.doc.activeElement?.className, 'ws-switcher-input',
    'once the input is live and visible, focus must land in the editor');
  assert.equal(sandbox.pendingEditorFocus, null, 'the intent is consumed exactly once');
});

test('the rename editor defers its focus and selection the same way', () => {
  const dom = makeDom();
  const sandbox = sandboxFor(dom);

  const input = sandbox.__nameInput({
    value: 'Work',
    placeholder: '',
    ariaLabel: 'New name for Work',
    onInput() {},
    onCommit() {},
    onCancel() {},
    selectAll: true,
    caret: null,
  });
  assert.equal(dom.doc.activeElement, null);

  const row = dom.doc.createElement('div');
  row.append(input);
  dom.workspaceSwitcherList.replaceChildren(row);
  sandbox.__applyFocus();
  assert.equal(dom.doc.activeElement?.className, 'ws-switcher-input');
  assert.ok(dom.doc.activeElement.selected,
    'a rename starts with the old name selected so typing replaces it');
});

test('a recorded focus for a row that never rendered is dropped, not applied', () => {
  const dom = makeDom();
  const sandbox = sandboxFor(dom);

  mountCreateEditor(sandbox, dom); // built, then never mounted
  sandbox.__applyFocus();
  assert.equal(dom.doc.activeElement, null, 'a detached editor must never steal focus');
  assert.equal(sandbox.pendingEditorFocus, null, 'and the stale intent must not linger');
});

test('focus is deferred while the switcher is visibility:hidden (measure window)', () => {
  const dom = makeDom();
  const sandbox = sandboxFor(dom);

  const { wrap } = mountCreateEditor(sandbox, dom);
  dom.workspaceSwitcherList.replaceChildren(wrap);
  dom.workspaceSwitcher.style.visibility = 'hidden';

  sandbox.__applyFocus();
  assert.equal(dom.doc.activeElement, null,
    'focus() must not run (or must no-op) while the popover is measuring');
  assert.ok(sandbox.pendingEditorFocus, 'intent must remain until the popover is visible');

  dom.workspaceSwitcher.style.visibility = '';
  sandbox.__applyFocus();
  assert.equal(dom.doc.activeElement?.className, 'ws-switcher-input');
  assert.equal(sandbox.pendingEditorFocus, null);
});

test('openWorkspaceSwitcher focuses only after visibility is restored', () => {
  const open = lift('openWorkspaceSwitcher');
  const visClear = open.indexOf("workspaceSwitcher.style.visibility = ''");
  const focusCall = open.indexOf('focusPendingEditor()');
  assert.ok(visClear >= 0, 'openWorkspaceSwitcher must clear visibility:hidden');
  assert.ok(focusCall > visClear,
    'focusPendingEditor must run after the popover is visible, not during measure');
  assert.match(lift('paintWorkspaceSwitcher'), /deferFocus/);
  assert.match(lift('renderSwitcherNameInput'), /caret != null \|\| claimEditorFocus/);
  assert.doesNotMatch(lift('renderSwitcherNameInput'), /input\.focus\(\)/);
  assert.match(lift('beginCreateWorkspace'), /claimEditorFocus = true/);
  assert.match(lift('beginSaveWorkspace'), /claimEditorFocus = true/);
});
