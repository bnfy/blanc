'use strict';
const { create } = require('../../src/renderer/workspace-ui');
function harness(apiOverrides = {}, payload = {}) {
  let active;
  const ids = new Map();
  class Element {
    constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {}; this.style = {}; this.handlers = {}; this.attrs = {}; this.hidden = false; this.disabled = false; this.scrollTop = 0; this.offsetHeight = 320; this.offsetWidth = 340; this.className = ''; this.textContent = ''; this.classList = { toggle: (name, force) => { const set = new Set(this.className.split(' ')); force ? set.add(name) : set.delete(name); this.className = [...set].join(' '); } }; }
    set id(value) { this._id = value; ids.set(value, this); } get id() { return this._id; }
    append(...nodes) { for (const node of nodes) { node.parent = this; this.children.push(node); } }
    replaceChildren(...nodes) { for (const node of this.children) node.parent = null; this.children = []; this.append(...nodes); }
    contains(node) { return node === this || this.children.some((c) => c.contains(node)); }
    get isConnected() { return this === root || !!this.parent?.isConnected; }
    setAttribute(name, value) { this.attrs[name] = value; }
    addEventListener(name, fn) { (this.handlers[name] ||= []).push(fn); }
    emit(name, props = {}) { for (const fn of this.handlers[name] || []) fn({ target: this, preventDefault() {}, stopPropagation() {}, ...props }); }
    focus() { if (this.isConnected && !this.disabled && !this.hidden) active = this; }
    setSelectionRange(a, b) { this.selectionStart = a; this.selectionEnd = b; }
    getBoundingClientRect() { return { top: 400, right: 600, bottom: 430 }; }
    getClientRects() { return this.hidden ? [] : [this.getBoundingClientRect()]; }
    matches(selector) { return selector === 'button' ? this.tagName === 'BUTTON' : selector === 'input' ? this.tagName === 'INPUT' : selector === '[data-current="true"]' ? this.dataset.current === 'true' : selector.startsWith('#') ? this.id === selector.slice(1) : false; }
    querySelectorAll(selector) { return this.children.flatMap((c) => [...(c.matches(selector) ? [c] : []), ...c.querySelectorAll(selector)]); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  }
  const root = new Element('div');
  const doc = { createElement: (tag) => new Element(tag), getElementById: (id) => ids.get(id), get activeElement() { return active; } };
  const popup = new Element('div'), list = new Element('div'), trigger = new Element('button'), label = new Element('span'), feedback = new Element('div');
  popup.append(list); for (const id of ['wsSwitcherSep', 'wsSwitcherNew', 'wsSwitcherSaveAs']) { const n = new Element('button'); n.id = id; popup.append(n); }
  root.append(trigger, label, popup, feedback); trigger.focus();
  const calls = []; const api = { closeOverlay() {}, openPage(...args) { calls.push(['page', ...args]); }, openWorkspace: async () => ({ ok: true }), saveWorkspaceAs: async () => ({ ok: true }), renameWorkspace: async () => ({ ok: true }), ...apiOverrides };
  const ui = create({ document: doc, window: { innerHeight: 600, innerWidth: 800, addEventListener() {} }, api, popup, list, trigger, label, feedback, onOpenChange() {} });
  ui.apply({ items: [{ id: 'a', name: 'First', active: true, tabCount: 1 }], deleted: [], status: 'saved', patronActive: true, ...payload });
  const button = (text) => popup.querySelectorAll('button').find((b) => b.textContent === text);
  const text = (node = popup) => [node.textContent, ...node.children.map((c) => text(c))].join(' ');
  return { ui, doc, popup, list, trigger, label, feedback, calls, button, text };
}
const settle = () => new Promise((resolve) => setImmediate(resolve));
module.exports = { harness, settle };
