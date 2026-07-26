const assert = require('node:assert/strict');
const test = require('node:test');

const { buildAddressMenu } = require('../../src/main/address-menu-model');

const ALL_FLAGS = {
  canUndo: true, canRedo: true, canCut: true, canCopy: true,
  canPaste: true, canDelete: true, canSelectAll: true,
};

function build(overrides = {}) {
  return buildAddressMenu({
    editFlags: ALL_FLAGS,
    clipboardText: 'https://paste.example/',
    fieldText: 'https://ex.com/?utm_source=x',
    ...overrides,
  });
}

test('buildAddressMenu: item order, labels, separators', () => {
  const items = build();
  assert.deepEqual(
    items.map((i) => i.type === 'separator' ? '—' : i.id),
    ['undo', 'redo', '—', 'cut', 'copy', 'copy-clean-link', 'paste',
     'paste-and-go', 'delete', '—', 'select-all']
  );
  const byId = Object.fromEntries(items.filter((i) => i.id).map((i) => [i.id, i]));
  assert.equal(byId['undo'].label, 'Undo');
  assert.equal(byId['redo'].label, 'Redo');
  assert.equal(byId['cut'].label, 'Cut');
  assert.equal(byId['copy'].label, 'Copy');
  assert.equal(byId['copy-clean-link'].label, 'Copy Clean Link');
  assert.equal(byId['paste'].label, 'Paste');
  assert.equal(byId['paste-and-go'].label, 'Paste and Go');
  assert.equal(byId['delete'].label, 'Delete');
  assert.equal(byId['select-all'].label, 'Select All');
});

test('buildAddressMenu: accelerators only where a real shortcut exists', () => {
  const byId = Object.fromEntries(build().filter((i) => i.id).map((i) => [i.id, i]));
  assert.equal(byId['undo'].accelerator, 'CmdOrCtrl+Z');
  assert.equal(byId['redo'].accelerator, 'Shift+CmdOrCtrl+Z');
  assert.equal(byId['cut'].accelerator, 'CmdOrCtrl+X');
  assert.equal(byId['copy'].accelerator, 'CmdOrCtrl+C');
  assert.equal(byId['paste'].accelerator, 'CmdOrCtrl+V');
  assert.equal(byId['select-all'].accelerator, 'CmdOrCtrl+A');
  assert.equal(byId['copy-clean-link'].accelerator, undefined);
  assert.equal(byId['paste-and-go'].accelerator, undefined);
  assert.equal(byId['delete'].accelerator, undefined);
});

test('buildAddressMenu: each editFlag gates exactly its item', () => {
  const flagToId = {
    canUndo: 'undo', canRedo: 'redo', canCut: 'cut', canCopy: 'copy',
    canPaste: 'paste', canDelete: 'delete', canSelectAll: 'select-all',
  };
  for (const [flag, id] of Object.entries(flagToId)) {
    const items = build({ editFlags: { ...ALL_FLAGS, [flag]: false } });
    const byId = Object.fromEntries(items.filter((i) => i.id).map((i) => [i.id, i]));
    assert.equal(byId[id].enabled, false, `${flag} off disables ${id}`);
    for (const [otherFlag, otherId] of Object.entries(flagToId)) {
      if (otherFlag !== flag) assert.equal(byId[otherId].enabled, true, `${otherId} unaffected`);
    }
  }
});

test('buildAddressMenu: missing editFlags disable everything flag-gated', () => {
  const items = build({ editFlags: {} });
  const byId = Object.fromEntries(items.filter((i) => i.id).map((i) => [i.id, i]));
  for (const id of ['undo', 'redo', 'cut', 'copy', 'paste', 'delete', 'select-all']) {
    assert.equal(byId[id].enabled, false, id);
  }
});

test('buildAddressMenu: Copy Clean Link enabled only for http(s) fieldText', () => {
  const enabled = (fieldText) => build({ fieldText })
    .find((i) => i.id === 'copy-clean-link').enabled;
  assert.equal(enabled('https://ex.com/?utm_source=x'), true);
  assert.equal(enabled('https://ex.com/clean-already'), true);
  assert.equal(enabled('how tall is everest'), false);
  assert.equal(enabled('blanc://settings/'), false);
  assert.equal(enabled(''), false);
});

test('buildAddressMenu: Paste and Go needs canPaste AND non-blank clipboard', () => {
  const item = (opts) => build(opts).find((i) => i.id === 'paste-and-go');
  assert.equal(item({}).enabled, true);
  assert.equal(item({ clipboardText: '' }).enabled, false);
  assert.equal(item({ clipboardText: '   \n' }).enabled, false);
  assert.equal(item({ editFlags: { ...ALL_FLAGS, canPaste: false } }).enabled, false);
});
