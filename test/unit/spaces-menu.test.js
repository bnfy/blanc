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

test('names are validated as you type, announced, and an invalid name can never be created', async () => {
  let saves = 0; const h = harness({ saveWorkspaceAs: async () => { saves++; return { ok: true }; } }, TWO);
  h.ui.begin('new'); const field = h.doc.getElementById('workspaceName');
  const error = () => h.doc.getElementById('workspaceEditorError');
  assert.equal(h.byKey('create').disabled, true, 'an empty name cannot be created');
  assert.equal(error().textContent, '', 'no error before the name is touched');
  assert.equal(error().attrs.role, 'alert', 'errors are announced');
  field.value = 'second'; field.emit('input');
  assert.match(error().textContent, /already in use/);
  assert.equal(field.attrs['aria-invalid'], 'true');
  assert.equal(h.byKey('create').disabled, true, 'a duplicate name cannot be created');
  h.doc.getElementById('workspaceEditor').emit('submit'); await settle(); assert.equal(saves, 0);
  field.value = '   '; field.emit('input');
  assert.match(error().textContent, /Enter a space name\./, 'emptying the name is announced');
  h.doc.getElementById('workspaceEditor').emit('submit'); await settle(); assert.equal(saves, 0);
  field.value = 'Fresh'; field.emit('input');
  assert.equal(h.byKey('create').disabled, false);
  assert.equal(error().textContent, '');
  assert.equal(field.attrs['aria-invalid'], 'false');
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
  h.byKey('done').click(); await settle(); assert.equal(h.ui.state.kind, 'list');
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

test('Escape steps back one level at a time', async () => {
  const h = harness({}, TWO); h.ui.begin('edit', TWO.items[0]);
  assert.equal(h.ui.cancel(), true); await settle(); assert.equal(h.ui.state.kind, 'list'); assert.equal(h.ui.opened, true);
  assert.equal(h.ui.cancel(), true); assert.equal(h.ui.opened, false);
  assert.equal(h.ui.cancel(), false, 'nothing left to cancel');
});

test('Done straight after an edit waits for the save, and a failed save keeps the editor with Try again', async () => {
  let attempts = 0; let fail = true;
  const h = harness({ updateWorkspace: async (id, patch) => { attempts++; h.calls.push(['update', id, patch]); return fail ? { ok: false, error: 'storage-failed' } : { ok: true }; } }, TWO);
  h.ui.begin('edit', TWO.items[0]);
  h.byKey('color:sky').click();
  h.byKey('done').click(); // before the 250ms live-save delay has passed
  await settle(); await settle();
  assert.equal(attempts, 1, 'Done sends the waiting edit at once');
  assert.equal(h.ui.state.kind, 'edit', 'a failed save never leaves the editor');
  assert.match(h.doc.getElementById('workspaceEditorError').textContent, /Couldn’t save changes/);
  assert.equal(h.byKey('retry').hidden, false);
  assert.equal(h.ui.close(), false, 'the menu cannot close over an unsaved edit');
  fail = false;
  h.byKey('retry').click(); await settle(); await settle();
  assert.deepEqual(h.calls.filter(([c]) => c === 'update').at(-1).slice(1), ['a', { color: '#376694' }], 'Try again resends the kept edit');
  assert.equal(h.byKey('retry').hidden, true);
  assert.equal(h.doc.getElementById('workspaceEditorError').textContent, '');
  h.byKey('done').click(); await settle(); await settle();
  assert.equal(h.ui.state.kind, 'list');
});

test('a newer edit made while a save is failing is kept with the failed one', async () => {
  let fail = true;
  const h = harness({ updateWorkspace: async (id, patch) => { h.calls.push(['update', id, patch]); return fail ? { ok: false, error: 'storage-failed' } : { ok: true }; } }, TWO);
  h.ui.begin('edit', TWO.items[0]);
  h.byKey('color:sky').click(); h.byKey('done').click(); await settle(); await settle();
  h.byKey('symbol:star').click(); await wait(20);
  fail = false;
  h.byKey('done').click(); await settle(); await settle();
  assert.deepEqual(h.calls.filter(([c]) => c === 'update').at(-1).slice(1), ['a', { color: '#376694', symbol: 'star' }]);
  assert.equal(h.ui.state.kind, 'list');
});

test('closing the menu straight after an edit waits for the save, and a failure keeps it open on the editor', async () => {
  const h = harness({ updateWorkspace: async (id, patch) => { h.calls.push(['update', id, patch]); throw new Error('disk full'); } }, TWO);
  h.ui.begin('edit', TWO.items[0]);
  h.byKey('color:sky').click();
  assert.equal(h.ui.close(), false, 'closing waits for the waiting edit');
  await settle(); await settle();
  assert.deepEqual(h.calls.filter(([c]) => c === 'update').at(-1).slice(1), ['a', { color: '#376694' }], 'the close sends the edit at once');
  assert.equal(h.ui.opened, true, 'a failed save never closes the menu');
  assert.equal(h.ui.state.kind, 'edit');
  assert.match(h.doc.getElementById('workspaceEditorError').textContent, /Couldn’t save changes/);
  assert.equal(h.byKey('retry').hidden, false);
  assert.equal(h.ui.close(), false, 'and it still cannot close over the failed edit');
});

test('closing straight after an edit closes once the edit has saved', async () => {
  const h = harness({}, TWO);
  h.ui.begin('edit', TWO.items[0]);
  h.byKey('symbol:star').click();
  assert.equal(h.ui.close(), false);
  assert.equal(h.ui.opened, true, 'still open while the save is in flight');
  await settle(); await settle();
  assert.deepEqual(h.calls.filter(([c]) => c === 'update').at(-1).slice(1), ['a', { symbol: 'star' }]);
  assert.equal(h.ui.opened, false);
  assert.equal(h.ui.state.kind, 'list');
});

test('a forced dismissal keeps a failed edit, and reopening shows it with Try again', async () => {
  let fail = true;
  const h = harness({ updateWorkspace: async (id, patch) => { h.calls.push(['update', id, patch]); return fail ? { ok: false, error: 'storage-failed' } : { ok: true }; } }, TWO);
  h.ui.begin('edit', TWO.items[0]);
  h.byKey('color:sky').click();
  h.ui.reset(); // a tab switch or window blur dismisses at once
  assert.equal(h.ui.opened, false);
  await settle(); await settle();
  h.ui.open();
  assert.equal(h.ui.state.kind, 'edit', 'reopening goes straight to the failed edit');
  assert.equal(h.ui.state.id, 'a');
  assert.equal(h.ui.state.draft.color, '#376694', 'showing what was chosen, not the saved color');
  assert.match(h.doc.getElementById('workspaceEditorError').textContent, /Couldn’t save changes/);
  assert.equal(h.byKey('retry').hidden, false);
  fail = false;
  h.byKey('retry').click(); await settle(); await settle();
  assert.deepEqual(h.calls.filter(([c]) => c === 'update').at(-1).slice(1), ['a', { color: '#376694' }]);
  assert.equal(h.byKey('retry').hidden, true);
  assert.equal(h.ui.close(), true);
  h.ui.open();
  assert.equal(h.ui.state.kind, 'list', 'once saved, the menu opens normally again');
});

test('a failed edit for a space deleted meanwhile is dropped, and a failure landing after reopening still shows', async () => {
  let release;
  const h = harness({ updateWorkspace: (id, patch) => { h.calls.push(['update', id, patch]); return new Promise((resolve) => { release = resolve; }); } }, TWO);
  h.ui.begin('edit', TWO.items[0]);
  h.byKey('color:sky').click();
  h.ui.reset();
  h.ui.open(); await settle();
  assert.equal(h.ui.state.kind, 'list', 'nothing has failed yet');
  release({ ok: false, error: 'storage-failed' }); await settle(); await settle();
  assert.equal(h.ui.state.kind, 'edit', 'the failure surfaces in the open menu');
  assert.equal(h.byKey('retry').hidden, false);
  h.ui.reset();
  h.ui.apply({ ...TWO, items: [TWO.items[1]] }); // deleted from another window
  h.ui.open();
  assert.equal(h.ui.state.kind, 'list');
  h.ui.close(); h.ui.open();
  assert.equal(h.ui.state.kind, 'list', 'and it stays dropped');
});

test('in the panel the menu hangs below the footer button, never over the Island above it', () => {
  const h = harness();
  h.trigger.getBoundingClientRect = () => ({ top: 120, right: 600, bottom: 150, height: 30 });
  h.ui.open();
  assert.equal(h.popup.dataset.side, 'below');
  assert.equal(h.popup.props['--ws-top'], '156px', 'just under the button');
  assert.equal(h.popup.props['--ws-max-height'], '436px', 'no taller than the room below; the list scrolls');
});

test('only a window too short for the menu below lets it open upward', () => {
  const h = harness(); // the harness button leaves 146px below and 386px above
  h.ui.open();
  assert.equal(h.popup.dataset.side, 'above');
  assert.equal(h.popup.props['--ws-max-height'], '386px');
});

test('a press on a row stays a click: the row captures the pointer only once a drag starts', async () => {
  // In Chromium a captured pointer retargets the click to the capturing row,
  // so capturing on press would stop the row's button from ever switching.
  let opens = 0; const h = harness({ openWorkspace: async () => { opens++; return { ok: true }; } }, TWO); h.ui.open();
  const main = h.byKey('open:b'); const row = main.parent;
  main.emit('pointerdown', { clientY: 100, pointerId: 7 });
  row.emit('pointermove', { clientY: 102, pointerId: 7 });
  assert.equal(row.captured, undefined, 'no capture before the drag threshold');
  row.emit('pointerup', { pointerId: 7 }); main.click(); await settle();
  assert.equal(opens, 1, 'the click switches');
  const again = h.byKey('open:a'); const row2 = again.parent;
  again.emit('pointerdown', { clientY: 100, pointerId: 8 });
  row2.emit('pointermove', { clientY: 140, pointerId: 8 });
  assert.equal(row2.captured, 8, 'a committed drag captures the pointer');
});

test('the footer button never shows a space name: it lives in the tooltip and accessible name', () => {
  // Too little room in the ⌘L footer for a name before it truncates.
  const fs = require('node:fs'); const path = require('node:path');
  const html = fs.readFileSync(path.join(__dirname, '../../src/renderer/overlay.html'), 'utf8');
  const button = html.slice(html.indexOf('id="footerWorkspace"'), html.indexOf('</button>', html.indexOf('id="footerWorkspace"')));
  assert.doesNotMatch(button, /<span/, 'no text-bearing child in the Spaces button');
  const h = harness();
  assert.equal(h.trigger.textContent, '');
  assert.match(h.trigger.title, /First/);
  assert.equal(h.trigger.getAttribute('aria-label'), h.trigger.title);
  assert.equal(h.trigger.classList.contains('bound'), true, 'the fill still shows the window is in a space');
});

test('inside the Island the menu hangs from the Island\'s bottom edge, not over its last row', () => {
  const h = harness();
  // The footer button sits above the panel's hint row; the panel ends at 172.
  h.trigger.getBoundingClientRect = () => ({ top: 112, right: 600, bottom: 140, height: 28 });
  const island = h.doc.createElement('div'); island.id = 'islandPanel';
  island.getBoundingClientRect = () => ({ top: 12, right: 860, bottom: 172, height: 160 });
  h.trigger.parent.append(island); island.append(h.trigger);
  h.ui.open();
  assert.equal(h.popup.dataset.side, 'below');
  assert.equal(h.popup.props['--ws-top'], '178px', 'just under the Island');
  assert.equal(h.popup.props['--ws-max-height'], '414px', 'the room under the Island');
});

test('after a drag the next real click on a row still switches', async () => {
  // A captured pointer sends the drag's own trailing click to the row, never
  // to its button, so nothing must stay armed to swallow a later click.
  let opens = 0; const h = harness({ openWorkspace: async () => { opens++; return { ok: true }; } }, TWO); h.ui.open();
  const main = h.byKey('open:b'); const row = main.parent;
  main.emit('pointerdown', { clientY: 100, pointerId: 1 }); row.emit('pointermove', { clientY: 60, pointerId: 1 }); row.emit('pointerup', { pointerId: 1 });
  row.emit('click', {}); // where Chromium delivers the drag's click
  await new Promise((r) => setTimeout(r, 5));
  h.byKey('open:b').click(); await settle();
  assert.equal(opens, 1, 'the later click switches');
});

test('keyboard focus stays on the row after Option/Alt+arrow moves it', async () => {
  const h = harness({}, TWO); h.ui.open();
  const row = h.byKey('open:a'); row.focus();
  row.emit('keydown', { key: 'ArrowDown', altKey: true }); await settle();
  assert.equal(h.doc.activeElement?.isConnected, true, 'focus is on a live element');
  assert.equal(h.doc.activeElement.dataset.focusKey, 'open:a');
});

test('after Undo, focus lands on the restored row', async () => {
  const h = harness({
    removeWorkspace: async (id) => ({ ok: true, items: [TWO.items[1]], deleted: [{ id, name: 'First', deletedAt: 1 }], status: 'saved' }),
    undoRemoveWorkspace: async () => ({ ok: true, items: TWO.items, deleted: [], status: 'saved' }),
  }, TWO);
  h.ui.begin('delete', TWO.items[0]); await settle();
  h.byKey('undo').focus(); h.byKey('undo').click(); await settle();
  assert.equal(h.doc.activeElement?.isConnected, true, 'focus is on a live element');
  assert.equal(h.doc.activeElement.dataset.focusKey, 'open:a');
});

test('an as-you-type name error never stops the menu closing', () => {
  // Nothing invalid is ever written, so a click outside may close the editor.
  const h = harness({}, TWO); h.ui.begin('edit', TWO.items[0]);
  const field = h.doc.getElementById('workspaceName'); field.value = ''; field.emit('input');
  assert.match(h.doc.getElementById('workspaceEditorError').textContent, /Enter a space name/);
  assert.equal(h.ui.close(), true);
  assert.equal(h.ui.opened, false);
});

test('the list fades in only when the view changes, not on every refresh', () => {
  const h = harness({}, TWO); h.ui.open();
  assert.equal(h.list.classList.contains('ws-view-enter'), true, 'opening fades the list in');
  h.ui.apply({ ...TWO, status: 'pending' });
  assert.equal(h.list.classList.contains('ws-view-enter'), false, 'a background refresh does not');
  h.ui.begin('edit', TWO.items[0]);
  assert.equal(h.list.classList.contains('ws-view-enter'), true, 'the editor fades in');
});
