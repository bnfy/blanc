'use strict';
const { create } = require('../../src/renderer/workspace-ui');
function harness(apiOverrides = {}, payload = {}, options = {}) {
  let active;
  const ids = new Map();
  class Element {
    constructor(tag) {
      this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {}; this.handlers = {}; this.attrs = {}; this.hidden = false; this.disabled = false; this.scrollTop = 0; this.offsetHeight = 320; this.offsetWidth = 340; this.className = ''; this.textContent = '';
      this.props = {}; this.style = { setProperty: (k, v) => { this.props[k] = v; } };
      const classes = () => new Set(this.className.split(' ').filter(Boolean));
      this.classList = {
        toggle: (name, force) => { const set = classes(); (force ?? !set.has(name)) ? set.add(name) : set.delete(name); this.className = [...set].join(' '); },
        add: (name) => this.classList.toggle(name, true), remove: (name) => this.classList.toggle(name, false), contains: (name) => classes().has(name),
      };
    }
    set id(value) { this._id = value; ids.set(value, this); } get id() { return this._id; }
    append(...nodes) { for (const node of nodes) { node.parent = this; this.children.push(node); } }
    prepend(...nodes) { for (const node of nodes) node.parent = this; this.children.unshift(...nodes); }
    replaceChildren(...nodes) { for (const node of this.children) node.parent = null; this.children = []; this.append(...nodes); }
    contains(node) { return node === this || this.children.some((c) => c.contains(node)); }
    get isConnected() { return this === root || !!this.parent?.isConnected; }
    setAttribute(name, value) { if (name === 'class') this.className = String(value); else this.attrs[name] = String(value); }
    getAttribute(name) { return this.attrs[name] ?? null; }
    addEventListener(name, fn) { (this.handlers[name] ||= []).push(fn); }
    removeEventListener(name, fn) { this.handlers[name] = (this.handlers[name] || []).filter((f) => f !== fn); }
    emit(name, props = {}) { for (const fn of [...(this.handlers[name] || [])]) fn({ target: this, button: 0, preventDefault() {}, stopPropagation() {}, ...props }); }
    click() { if (!this.disabled) this.emit('click'); }
    focus() { if (this.isConnected && !this.disabled && !this.hidden) active = this; }
    setSelectionRange(a, b) { this.selectionStart = a; this.selectionEnd = b; }
    setPointerCapture(id) { this.captured = id; }
    getBoundingClientRect() { return { top: 400, right: 600, bottom: 440, height: 40 }; }
    getClientRects() { return this.hidden ? [] : [this.getBoundingClientRect()]; }
    matches(selector) {
      if (selector === 'button') return this.tagName === 'BUTTON';
      if (selector === 'input') return this.tagName === 'INPUT';
      if (selector === '[data-current="true"]') return this.dataset.current === 'true';
      if (selector.startsWith('#')) return this.id === selector.slice(1);
      if (selector.startsWith('.')) return this.classList.contains(selector.slice(1));
      return false;
    }
    closest(selector) { let node = this; while (node) { if (node.matches?.(selector)) return node; node = node.parent; } return null; }
    querySelectorAll(selector) { return this.children.flatMap((c) => [...(c.matches(selector) ? [c] : []), ...c.querySelectorAll(selector)]); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  }
  const root = new Element('div');
  const doc = { createElement: (tag) => new Element(tag), createElementNS: (_ns, tag) => new Element(tag), getElementById: (id) => ids.get(id), get activeElement() { return active; } };
  const popup = new Element('div'), list = new Element('div'), commands = new Element('div'), trigger = new Element('button'), feedback = new Element('div');
  popup.append(list, commands);
  root.append(trigger, popup, feedback); trigger.focus();
  const calls = [];
  const api = {
    closeOverlay() { calls.push(['close-overlay']); }, openPage(...args) { calls.push(['page', ...args]); },
    openWorkspace: async () => ({ ok: true }), saveWorkspaceAs: async () => ({ ok: true }), createBlankWorkspace: async () => ({ ok: true }),
    updateWorkspace: async (...args) => { calls.push(['update', ...args]); return { ok: true }; },
    removeWorkspace: async (id) => { calls.push(['remove', id]); return { ok: true, items: [], deleted: [{ id, name: 'First', deletedAt: 1 }], status: 'saved' }; },
    undoRemoveWorkspace: async (id) => { calls.push(['undo', id]); return { ok: true }; },
    moveWorkspaceTo: async (...args) => { calls.push(['move', ...args]); return { ok: true }; },
    ...apiOverrides,
  };
  const ui = create({ document: doc, window: { innerHeight: 600, innerWidth: 800, addEventListener() {} }, api, popup, list, commands, trigger, feedback, onOpenChange() {}, ...options });
  ui.apply({ items: [{ id: 'a', name: 'First', active: true, tabCount: 1, color: '#426c4c', symbol: 'briefcase' }], deleted: [], status: 'saved', windowTabCount: 3, ...payload });
  const buttons = () => popup.querySelectorAll('button');
  const button = (text) => buttons().find((b) => b.textContent === text);
  const byKey = (key) => buttons().find((b) => b.dataset.focusKey === key);
  const text = (node = popup) => [node.textContent, ...node.children.map((c) => text(c))].join(' ');
  return { ui, doc, popup, list, commands, trigger, feedback, calls, button, byKey, text };
}
const settle = () => new Promise((resolve) => setImmediate(resolve));
module.exports = { harness, settle };
