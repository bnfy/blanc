'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { create, hsvToHex, hexToHsv } = require('../../src/renderer/space-picker');

class Node {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.attrs = {}; this.handlers = {}; this.props = {}; this.value = ''; this.className = ''; this.textContent = ''; this.captured = null; this.style = { setProperty: (k, v) => { this.props[k] = v; } }; }
  append(...nodes) { this.children.push(...nodes); }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  addEventListener(name, fn) { (this.handlers[name] ||= []).push(fn); }
  emit(name, props = {}) { for (const fn of this.handlers[name] || []) fn({ preventDefault() {}, ...props }); }
  setPointerCapture(id) { this.captured = id; }
  focus() {}
  getBoundingClientRect() { return { left: 10, top: 20, width: 100, height: 200 }; }
}
const t = (key, params) => (params ? `${key} ${JSON.stringify(params)}` : key);
function picker(hex = '#426c4c') {
  const inputs = []; const commits = [];
  const doc = { createElement: (tag) => new Node(tag) };
  const p = create({ document: doc, hex, t, onInput: (v) => inputs.push(v), onCommit: (v) => commits.push(v) });
  const [square, hue, hexRow] = p.element.children;
  return { p, square, hue, hexInput: hexRow.children[1], inputs, commits };
}

test('HSV and hex round-trip', () => {
  for (const hex of ['#426c4c', '#f5e663', '#000000', '#ffffff', '#3a3a3a']) assert.equal(hsvToHex(...Object.values(hexToHsv(hex))), hex);
});

test('the picker opens on the stored colour', () => {
  const { square, hue, hexInput } = picker('#376694');
  assert.equal(hexInput.value, '#376694');
  assert.equal(hue.value, String(Math.round(hexToHsv('#376694').h)));
  assert.equal(square.attrs.role, 'slider');
  assert.match(square.attrs['aria-valuetext'], /saturation/);
});

test('dragging the square tracks the pointer 1:1 and commits once on release', () => {
  const { square, inputs, commits } = picker('#ff0000');
  square.emit('pointerdown', { pointerId: 7, clientX: 110, clientY: 20 });
  assert.equal(square.captured, 7, 'the pointer is captured so tracking survives leaving the square');
  square.emit('pointermove', { pointerId: 7, clientX: 60, clientY: 120 });
  square.emit('pointermove', { pointerId: 8, clientX: 10, clientY: 220 });
  assert.deepEqual(inputs, ['#ff0000', hsvToHex(0, 0.5, 0.5)], 'a second pointer is ignored');
  assert.equal(square.props['--x'], '50.00%');
  assert.equal(square.props['--y'], '50.00%');
  assert.deepEqual(commits, []);
  square.emit('pointerup', { pointerId: 7 });
  assert.deepEqual(commits, [hsvToHex(0, 0.5, 0.5)]);
});

test('arrow keys move saturation and brightness, Shift in larger steps', () => {
  const { square, commits } = picker('#808080');
  square.emit('keydown', { key: 'ArrowRight', shiftKey: true });
  square.emit('keydown', { key: 'ArrowDown' });
  const expected = hexToHsv('#808080');
  assert.equal(commits.at(-1), hsvToHex(expected.h, 0.1, expected.v - 0.01));
  square.emit('keydown', { key: 'Enter' });
  assert.equal(commits.length, 2, 'other keys are ignored');
});

test('the hue slider keeps saturation and brightness', () => {
  const { hue, inputs, commits } = picker('#426c4c');
  const { s, v } = hexToHsv('#426c4c');
  hue.value = '200'; hue.emit('input');
  assert.equal(inputs.at(-1), hsvToHex(200, s, v));
  hue.emit('change');
  assert.equal(commits.at(-1), hsvToHex(200, s, v));
});

test('a typed hex applies when valid and is flagged while invalid', () => {
  const { p, hexInput, commits } = picker('#426c4c');
  hexInput.value = 'F5E6'; hexInput.emit('input');
  assert.equal(hexInput.attrs['aria-invalid'], 'false', 'still typing');
  assert.deepEqual(commits, []);
  hexInput.value = 'F5E66Z'; hexInput.emit('input');
  assert.equal(hexInput.attrs['aria-invalid'], 'true');
  hexInput.value = 'F5E663'; hexInput.emit('input');
  assert.deepEqual(commits, ['#f5e663']);
  assert.equal(hexInput.value, 'F5E663', 'the field keeps what the person typed');
  p.setHex('#3a3a3a');
  assert.equal(hexInput.value, '#3A3A3A');
  assert.equal(commits.length, 1, 'setHex never fires callbacks');
});
