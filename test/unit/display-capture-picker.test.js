'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createDisplayCapturePicker, projectPickerSources } = require('../../src/main/display-capture-picker');

const screen = { id: 'screen:1:0', name: 'Entire screen', thumbnail: { toDataURL: () => 'data:image/png;base64,AA==' } };
function harness({ platform = 'darwin', portalSelection = true, getSources = async () => [screen] } = {}) {
  const owner = {}, otherOwner = {};
  const owners = new Map([['a', owner], ['b', owner], ['c', otherOwner]]);
  const models = [], cancelled = [], choices = [], dismissed = [];
  let enumerations = 0;
  const picker = createDisplayCapturePicker({
    platform, portalSelection, desktopCapturer: { getSources: () => { enumerations++; return getSources(); } },
    ownerForRequest: (id) => owners.get(id),
    isOwnerSender: (event, target) => event.sender === target,
    present: (target, model) => models.push({ target, model }),
    dismiss: (target, id) => dismissed.push(id),
    onCancel: (id) => cancelled.push(id),
    onChoose: (event, choice, source) => choices.push({ choice, source }),
  });
  return { picker, owner, otherOwner, owners, models, cancelled, choices, dismissed,
    enumerations: () => enumerations };
}
const model = { origin: 'https://conference.example', audioRequested: true };

test('source projection retains only picker metadata and treats names as text', () => {
  assert.deepEqual(projectPickerSources([{ ...screen, secret: 123, name: '<script>bad</script>' }]), [{
    id: screen.id, name: '<script>bad</script>', kind: 'screen', thumbnailDataURL: 'data:image/png;base64,AA==',
  }]);
});

test('only the owning overlay can select; missing source and forged labels cannot grant', async () => {
  const h = harness();
  await h.picker.show('a', model);
  await h.picker.resolve({ sender: h.otherOwner }, { requestId: 'a', sourceId: screen.id });
  await h.picker.resolve({ sender: h.owner }, { requestId: 'a', sourceId: 'screen:missing' });
  assert.equal(h.choices.length, 0);
  await h.picker.resolve({ sender: h.owner }, { requestId: 'a', sourceId: screen.id,
    computerAudioApproved: true, surfaceLabel: 'forged', surfaceKind: 'window' });
  assert.equal(h.choices[0].choice.surfaceLabel, 'Entire screen');
  assert.equal(h.choices[0].choice.surfaceKind, 'screen');
  assert.equal(h.choices[0].choice.computerAudioApproved, true);
  await h.picker.resolve({ sender: h.owner }, { requestId: 'a', sourceId: screen.id });
  assert.equal(h.choices.length, 1);
});

test('computer audio requires the site request as well as consent', async () => {
  const h = harness();
  await h.picker.show('a', { ...model, audioRequested: false });
  await h.picker.resolve({ sender: h.owner }, { requestId: 'a', sourceId: screen.id, computerAudioApproved: true });
  assert.equal(h.choices[0].choice.computerAudioApproved, false);
});

test('second picker in one window denies without replacing first; another window is independent', async () => {
  const h = harness();
  await h.picker.show('a', model);
  await h.picker.show('b', model);
  await h.picker.show('c', model);
  assert.deepEqual(h.cancelled, ['b']);
  assert.equal(h.models.at(-1).target, h.otherOwner);
  await h.picker.resolve({ sender: h.otherOwner }, { requestId: 'a', cancelled: true });
  assert.deepEqual(h.cancelled, ['b']);
});

test('cancel while enumerating prevents late sources reopening the picker', async () => {
  let finish;
  const h = harness({ getSources: () => new Promise((resolve) => { finish = resolve; }) });
  const pending = h.picker.show('a', model);
  await Promise.resolve();
  h.picker.cancel('a');
  finish([screen]);
  await pending;
  assert.equal(h.models.length, 1);
  assert.deepEqual(h.cancelled, ['a']);
  assert.equal(h.choices.length, 0);
});

test('Linux waits for Continue and portal completion, then passes that exact source to capture', async () => {
  let finish;
  const h = harness({ platform: 'linux', getSources: () => new Promise((resolve) => { finish = resolve; }) });
  await h.picker.show('a', model);
  assert.equal(h.enumerations(), 0);
  const pending = h.picker.resolve({ sender: h.owner }, { requestId: 'a', computerAudioApproved: true });
  await Promise.resolve();
  assert.equal(h.choices.length, 0);
  finish([screen]);
  await pending;
  assert.equal(h.enumerations(), 1);
  assert.equal(h.choices[0].source, screen);
  assert.equal(h.choices[0].choice.computerAudioApproved, true);
});

test('Linux portal cancel or late completion after cancellation grants nothing', async () => {
  let finish;
  const h = harness({ platform: 'linux', getSources: () => new Promise((resolve) => { finish = resolve; }) });
  await h.picker.show('a', model);
  const pending = h.picker.resolve({ sender: h.owner }, { requestId: 'a' });
  await Promise.resolve();
  h.picker.cancel('a');
  finish([screen]);
  await pending;
  assert.equal(h.choices.length, 0);
  const empty = harness({ platform: 'linux', getSources: async () => [] });
  await empty.picker.show('a', model);
  await empty.picker.resolve({ sender: empty.owner }, { requestId: 'a' });
  assert.deepEqual(empty.cancelled, ['a']);
});

test('Linux enumerated list requires an explicit source selection', async () => {
  const h = harness({ platform: 'linux', getSources: async () => [screen, { id: 'window:2:0', name: 'Editor' }] });
  await h.picker.show('a', model);
  await h.picker.resolve({ sender: h.owner }, { requestId: 'a' });
  assert.equal(h.choices.length, 0);
  assert.equal(h.models.at(-1).model.portal, false);
  await h.picker.resolve({ sender: h.owner }, { requestId: 'a', sourceId: 'window:2:0' });
  assert.equal(h.choices[0].choice.surfaceLabel, 'Editor');
  assert.equal(h.enumerations(), 1);
});

test('Linux without an established portal requires selection even for a single source', async () => {
  const h = harness({ platform: 'linux', portalSelection: false });
  await h.picker.show('a', model);
  await h.picker.resolve({ sender: h.owner }, { requestId: 'a' });
  assert.equal(h.choices.length, 0);
  await h.picker.resolve({ sender: h.owner }, { requestId: 'a', sourceId: screen.id });
  assert.equal(h.choices.length, 1);
});
