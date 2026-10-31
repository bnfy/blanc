import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./prototype/extensions.js', import.meta.url), 'utf8');
function fixture() {
  const doc = { activeElement: null };
  class Element {
    constructor(tag) { this.tag = tag; this.children = []; this.attributes = {}; this.dataset = {}; }
    setAttribute(name, value) { this.attributes[name] = value; }
    append(child) { this.children.push(child); }
    replaceChildren() { this.children = []; doc.activeElement = null; }
    querySelectorAll() {
      return this.children.flatMap(child => [child, ...child.querySelectorAll()])
        .filter(child => child.tag === 'button' && !child.disabled);
    }
    closest() { return this.dataset.themeAction ? this : null; }
    focus() { doc.activeElement = this; }
  }
  doc.createElement = tag => new Element(tag);
  const context = { document: doc, window: {} };
  vm.runInNewContext(source, context);
  const picker = Object.create(context.window.BlancExtensions.prototype);
  Object.assign(picker, { themes: new Element('section'), themeList: new Element('div'),
    search: new Element('input'), panel: { hidden: false }, busy: false });
  return { picker, doc };
}
const item = active => ({ id: 'a'.repeat(32), name: 'Theme A', active });

test('theme actions are native buttons in a labelled group, not a listbox option', () => {
  const { picker } = fixture();
  picker.renderThemes([item(true)]);
  const row = picker.themeList.children[0];
  assert.equal(row.attributes.role, 'group');
  assert.equal(row.attributes['aria-labelledby'], row.children[0].id);
  assert.equal(row.children[0].textContent, 'Theme A — Active');
  assert.deepEqual(row.children.slice(1).map(button => button.attributes['aria-label']),
    ['Apply Theme A', 'Remove Theme A']);
  assert.equal(row.children[1].disabled, true);
  assert.equal(row.children[2].disabled, false);
  assert.equal(picker.themes.hidden, false);
});

test('applying a focused theme moves focus to its remaining enabled action', () => {
  const { picker, doc } = fixture();
  picker.renderThemes([item(false)]);
  picker.themeList.children[0].children[1].focus();
  picker.renderThemes([item(true)]);
  assert.equal(doc.activeElement.dataset.themeAction, 'removeTheme');
  assert.equal(doc.activeElement.dataset.themeId, item(true).id);
});

test('removing the focused theme returns focus to search and hides empty group', () => {
  const { picker, doc } = fixture();
  picker.renderThemes([item(true)]);
  picker.themeList.children[0].children[2].focus();
  picker.renderThemes([]);
  assert.equal(doc.activeElement, picker.search);
  assert.equal(picker.themes.hidden, true);
});
