'use strict';
const test = require('node:test'); const assert = require('node:assert/strict');
const { harness, settle } = require('../support/workspace-ui-dom');
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const TWO = { items: [
  { id: 'a', name: 'First', active: true, tabCount: 1, color: '#426c4c', symbol: 'briefcase' },
  { id: 'b', name: 'Second', active: false, tabCount: 4, color: '#974f2a', symbol: 'house' },
] };

test('rows show a painted symbol tile, the name, the count and the current space', () => {
  const h = harness({}, TWO); h.ui.open();
  const rows = h.list.children.filter((n) => n.className.includes('ws-row'));
  assert.equal(rows.length, 2);
  const [first] = rows;
  const main = first.children[0];
  assert.equal(main.dataset.current, 'true');
  assert.equal(main.attrs['aria-current'], 'true');
  const tile = main.children[0];
  assert.equal(tile.props['--space-ink'], '#426c4c');
  assert.equal(tile.props['--space-wash'], 'rgba(66, 108, 76, 0.15)');
  assert.equal(main.children[1].textContent, 'First');
  assert.equal('data-i18n-ignore' in main.children[1].attrs, true, 'space names are never translated');
  assert.equal(first.children[1].attrs['aria-label'], 'Edit First');
  assert.ok(h.byKey('new'), 'New space… is always offered');
  assert.equal(h.byKey('recently-deleted'), undefined, 'Recently deleted only appears when non-empty');
});

test('with no spaces the menu explains itself and offers the Arc import', () => {
  const h = harness({}, { items: [] }); h.ui.open();
  assert.match(h.text(), /Save a set of tabs and switch back to it any time\./);
  h.byKey('import-arc').click();
  assert.deepEqual(h.calls, [['page', 'tab-import']]);
});

test('New space starts from this window when it is in no space, empty when it is', () => {
  const free = harness({}, { items: [{ ...TWO.items[1] }] }); free.ui.begin('new');
  assert.equal(free.ui.state.start, 'window');
  assert.equal(free.byKey('start:window').attrs['aria-checked'], 'true');
  assert.match(free.byKey('start:window').textContent, /This window · 3 tabs/);
  const bound = harness({}, TWO); bound.ui.begin('new');
  assert.equal(bound.ui.state.start, 'empty');
  assert.deepEqual({ color: bound.ui.state.draft.color, symbol: bound.ui.state.draft.symbol }, { color: '#376694', symbol: 'code' }, 'the next unused preset and symbol');
});

test('creating from this window saves it with the chosen identity', async () => {
  const saves = []; const h = harness({ saveWorkspaceAs: async (...args) => { saves.push(args); return { ok: true }; } }, { items: [] });
  h.ui.begin('new');
  const field = h.doc.getElementById('workspaceName'); field.value = 'Side project'; field.emit('input');
  h.byKey('color:iris').click(); h.byKey('symbol:code').click();
  h.doc.getElementById('workspaceEditor').emit('submit'); await settle();
  assert.deepEqual(saves, [['Side project', { color: '#6757a3', symbol: 'code' }]]);
  assert.equal(h.ui.state.kind, 'list');
});

test('creating an empty space creates and switches with the chosen identity', async () => {
  const creates = []; const h = harness({ createBlankWorkspace: async (...args) => { creates.push(args); return { ok: true }; } }, TWO);
  h.ui.begin('new', null, { name: 'Reading' });
  h.doc.getElementById('workspaceEditor').emit('submit'); await settle();
  assert.deepEqual(creates, [['Reading', { color: '#376694', symbol: 'code' }]]);
  assert.ok(h.calls.some(([c]) => c === 'close-overlay'));
});

test('names are validated as you type and an invalid name never submits', async () => {
  let saves = 0; const h = harness({ saveWorkspaceAs: async () => { saves++; return { ok: true }; } }, TWO);
  h.ui.begin('new'); const field = h.doc.getElementById('workspaceName');
  field.value = 'second'; field.emit('input');
  assert.match(h.doc.getElementById('workspaceEditorError').textContent, /already in use/);
  assert.equal(field.attrs['aria-invalid'], 'true');
  h.doc.getElementById('workspaceEditor').emit('submit'); await settle(); assert.equal(saves, 0);
  field.value = '   '; field.emit('input'); h.doc.getElementById('workspaceEditor').emit('submit'); await settle();
  assert.equal(saves, 0); assert.match(h.text(), /Enter a space name\./);
});

test('edits apply live: color and symbol write at once, the name after a pause', async () => {
  const h = harness({}, TWO); h.ui.begin('edit', TWO.items[0]);
  assert.equal(h.ui.state.kind, 'edit');
  h.byKey('color:sky').click(); h.byKey('symbol:star').click(); await wait(50);
  assert.deepEqual(h.calls.filter(([c]) => c === 'update').map((c) => c.slice(1)), [['a', { color: '#376694', symbol: 'star' }]], 'quick changes merge into one write');
  const field = h.doc.getElementById('workspaceName'); field.value = 'Work'; field.emit('input');
  await wait(100);
  assert.equal(h.calls.filter(([c]) => c === 'update').length, 1, 'the name waits for typing to settle');
  await wait(400);
  assert.deepEqual(h.calls.filter(([c]) => c === 'update').at(-1).slice(1), ['a', { name: 'Work' }]);
  h.byKey('done').click(); assert.equal(h.ui.state.kind, 'list');
});

test('a duplicate name in the editor is shown and not written', async () => {
  const h = harness({}, TWO); h.ui.begin('edit', TWO.items[0]);
  const field = h.doc.getElementById('workspaceName'); field.value = 'Second'; field.emit('input'); await wait(450);
  assert.equal(h.calls.filter(([c]) => c === 'update').length, 0);
  assert.match(h.doc.getElementById('workspaceEditorError').textContent, /already in use/);
});

test('the custom swatch opens the picker and a typed hex shows the readability note', async () => {
  const h = harness({}, TWO); h.ui.begin('edit', TWO.items[0]);
  h.byKey('color:custom').click();
  const hex = h.popup.querySelectorAll('input').find((i) => i.className === 'space-picker-hex');
  assert.ok(hex, 'the picker is drawn inside the menu');
  hex.value = '#F5E663'; hex.emit('input'); await wait(300);
  assert.match(h.text(), /Kept readable: shown as #6D6400 in light mode\./);
  assert.deepEqual(h.calls.filter(([c]) => c === 'update').map((c) => c.slice(1)), [['a', { color: '#f5e663' }]]);
  assert.equal(h.byKey('color:custom').attrs['aria-checked'], 'true');
});

test('delete is immediate and Undo brings the space back until the menu closes', async () => {
  const h = harness({ undoRemoveWorkspace: async (id) => { h.calls.push(['undo', id]); return { ok: true, ...TWO, deleted: [], status: 'saved' }; } }, TWO);
  h.ui.begin('edit', TWO.items[0]);
  h.byKey('delete').click(); await settle();
  assert.deepEqual(h.calls.filter(([c]) => c === 'remove'), [['remove', 'a']]);
  assert.equal(h.ui.state.kind, 'list');
  assert.match(h.text(), /First deleted/);
  h.byKey('undo').click(); await settle();
  assert.deepEqual(h.calls.filter(([c]) => c === 'undo'), [['undo', 'a']]);
  assert.equal(h.byKey('undo'), undefined, 'the Undo row goes once used');
});

test('right-click Delete removes at once too', async () => {
  const h = harness({}, TWO); h.ui.begin('delete', TWO.items[1]); await settle();
  assert.deepEqual(h.calls.filter(([c]) => c === 'remove'), [['remove', 'b']]);
  h.ui.close(); h.ui.open(); assert.equal(h.byKey('undo'), undefined, 'closing the menu ends the Undo offer');
});

test('Option/Alt+arrow moves a row, and a drag past the threshold moves it to where it lands', async () => {
  const h = harness({}, TWO); h.ui.open();
  h.byKey('open:a').emit('keydown', { key: 'ArrowDown', altKey: true }); await settle();
  assert.deepEqual(h.calls.filter(([c]) => c === 'move'), [['move', 'a', 1]]);
  h.byKey('open:b').emit('keydown', { key: 'ArrowDown', altKey: true }); await settle();
  assert.equal(h.calls.filter(([c]) => c === 'move').length, 1, 'the last row cannot move further down');
  const row = h.byKey('open:a').parent;
  h.byKey('open:a').emit('pointerdown', { clientY: 100, pointerId: 1 });
  row.emit('pointermove', { clientY: 103 });
  assert.equal(row.classList.contains('dragging'), false, 'small movements are still a click');
  row.emit('pointermove', { clientY: 145 });
  assert.equal(row.props['--drag-y'], '45px', 'the row follows the pointer 1:1');
  row.emit('pointerup', {}); await settle();
  assert.deepEqual(h.calls.filter(([c]) => c === 'move').at(-1), ['move', 'a', 1]);
  let opens = 0; const h2 = harness({ openWorkspace: async () => { opens++; return { ok: true }; } }, TWO); h2.ui.open();
  const row2 = h2.byKey('open:b').parent; h2.byKey('open:b').emit('pointerdown', { clientY: 100, pointerId: 1 }); row2.emit('pointermove', { clientY: 60 }); row2.emit('pointerup', {});
  h2.byKey('open:b').click(); await settle(); assert.equal(opens, 0, 'the click that ends a drag does not switch');
});

test('the switch prompt leads with saving, then a new window, then the destructive choice', async () => {
  const h = harness({ openWorkspace: async () => ({ ok: false, error: 'unsaved-scratch', tabCount: 5, privateCount: 0, decision: 'token' }) }, TWO);
  h.ui.switchTo(TWO.items[1]); await settle();
  assert.equal(h.ui.state.kind, 'decision');
  assert.match(h.text(), /Switch to Second\?/);
  const order = h.popup.querySelectorAll('button').map((b) => b.dataset.focusKey);
  assert.deepEqual(order, ['save-first', 'new-window', 'close-and-switch', 'cancel']);
  h.byKey('save-first').click();
  assert.equal(h.ui.state.kind, 'new'); assert.equal(h.ui.state.fixedStart, true);
  assert.equal(h.byKey('start:window'), undefined, 'saving first always saves this window');
});

test('Recently deleted keeps a confirmation only for permanent deletion', async () => {
  let forgets = 0; const h = harness({ forgetWorkspace: async () => { forgets++; return { ok: true, items: TWO.items, deleted: [], status: 'saved' }; } }, { ...TWO, deleted: [{ id: 'z', name: 'Old', deletedAt: 1 }] });
  h.ui.open(); h.byKey('recently-deleted').click();
  assert.equal(h.ui.state.kind, 'recovery');
  h.byKey('forget:z').click(); assert.equal(h.ui.state.kind, 'forget'); assert.equal(forgets, 0);
  h.byKey('forget').click(); await settle(); assert.equal(forgets, 1);
});

test('Escape steps back one level at a time', () => {
  const h = harness({}, TWO); h.ui.begin('edit', TWO.items[0]);
  assert.equal(h.ui.cancel(), true); assert.equal(h.ui.state.kind, 'list'); assert.equal(h.ui.opened, true);
  assert.equal(h.ui.cancel(), true); assert.equal(h.ui.opened, false);
  assert.equal(h.ui.cancel(), false, 'nothing left to cancel');
});
