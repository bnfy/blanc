'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../../src/renderer/pages/tab-handoff.js'), 'utf8');

async function review() {
  function element() {
    return { checked: false, disabled: true, hidden: true, textContent: '', children: [], events: {},
      append(...children) { this.children.push(...children); },
      replaceChildren() { this.children = []; },
      addEventListener(name, fn) { this.events[name] = fn; } };
  }
  const elements = Object.fromEntries(['summary', 'error', 'list', 'skipped', 'accept', 'cancel', 'newWindow']
    .map((id) => [id, element()]));
  const calls = [];
  const control = { result: { ok: true } };
  vm.runInNewContext(source, {
    document: { getElementById: (id) => elements[id], createElement: element },
    window: { bowserPages: { tabHandoff: {
      get: async () => ({ state: 'ready', sourceBrowser: 'brave', profileName: 'Personal', tabs: [{ title: '<script>untrusted</script>', domain: 'example.test' }] }),
      accept: async (destination) => { calls.push(destination); return control.result; },
      cancel() {},
    } } },
  });
  await Promise.resolve();
  return { elements, calls, control };
}

test('review defaults to this window, updates destination copy, and sends the selected choice', async () => {
  const { elements: e, calls } = await review();
  assert.equal(e.newWindow.checked, false);
  assert.equal(e.accept.textContent, 'Open in this window');
  assert.match(e.summary.textContent, /this Personal window/);
  assert.equal(e.list.children[0].children[0].children[0].textContent, '<script>untrusted</script>');
  e.newWindow.checked = true;
  e.newWindow.events.change();
  assert.equal(e.accept.textContent, 'Open in new window');
  assert.match(e.summary.textContent, /a new Personal window/);
  await e.accept.events.click();
  assert.deepEqual(calls, ['new-window']);
  assert.equal(e.accept.disabled, true);
});

test('retryable failures keep the preview and destination usable for retry', async () => {
  const { elements: e, calls, control } = await review();
  control.result = { ok: false, retryable: true };
  await e.accept.events.click();
  assert.equal(e.error.hidden, false);
  assert.equal(e.list.hidden, false);
  assert.equal(e.accept.disabled, false);
  assert.equal(e.newWindow.disabled, false);
  assert.equal(e.cancel.disabled, false);
  assert.equal(e.accept.textContent, 'Open in this window');
  control.result = { ok: true };
  await e.accept.events.click();
  assert.deepEqual(calls, ['current-window', 'current-window']);
});
