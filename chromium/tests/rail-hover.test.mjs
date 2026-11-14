import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const context = vm.createContext({});
vm.runInContext(fs.readFileSync(new URL('../blanc/island/rail-hover.js', import.meta.url), 'utf8'), context);
const hover = context.BlancRailHover;
const plain = value => JSON.parse(JSON.stringify(value));
const tab = id => ({kind: 'tab', tabId: id});
const group = id => ({kind: 'group', groupId: id});
const row = id => ({kind: 'tab', tabId: id, inList: true});

// Runs events from idle; returns the last state and every effect in order.
function run(...events) {
  let state = hover.initialState();
  const effects = [];
  for (const event of events) {
    const next = hover.step(state, event);
    state = next.state;
    effects.push(...plain(next.effects));
  }
  return {state: plain(state), effects};
}
const shows = effects => effects.filter(e => e.type === 'show');

test('opens after the rest delay', () => {
  assert.equal(hover.OPEN_DELAY_MS, 500);
  const waiting = run({type: 'enter', target: tab(1)});
  assert.deepEqual(waiting.effects.at(-1), {type: 'start-timer', ms: 500});
  assert.equal(shows(waiting.effects).length, 0);
  const shown = run({type: 'enter', target: tab(1)}, {type: 'timer'});
  assert.deepEqual(shows(shown.effects), [{type: 'show', card: 'picture', target: tab(1)}]);
  assert.equal(shown.state.phase, 'shown');
});

test('swaps at once while shown', () => {
  const {effects} = run({type: 'enter', target: tab(1)}, {type: 'timer'}, {type: 'enter', target: tab(2)});
  const after = effects.slice(effects.findIndex(e => e.type === 'show') + 1);
  assert.deepEqual(shows(after), [{type: 'show', card: 'picture', target: tab(2)}]);
  assert.ok(!after.some(e => e.type === 'start-timer'));
});

test('a new row restarts the wait, and only the newest target opens', () => {
  const {state, effects} = run({type: 'enter', target: tab(1)}, {type: 'enter', target: tab(2)}, {type: 'timer'});
  assert.deepEqual(effects.slice(2, 4), [{type: 'cancel-timers'}, {type: 'start-timer', ms: 500}]);
  assert.deepEqual(shows(effects), [{type: 'show', card: 'picture', target: tab(2)}]);
  assert.deepEqual(state.target, tab(2));
});

test('leaving starts the grace; entering the list keeps the cards', () => {
  assert.equal(hover.LEAVE_GRACE_MS, 150);
  const leaving = run({type: 'enter', target: group('g')}, {type: 'timer'}, {type: 'leave-rail'});
  assert.deepEqual(leaving.effects.at(-1), {type: 'start-grace', ms: 150});
  assert.equal(leaving.state.phase, 'leaving');
  const kept = run({type: 'enter', target: group('g')}, {type: 'timer'}, {type: 'leave-rail'}, {type: 'enter-list'});
  assert.deepEqual(kept.effects.at(-1), {type: 'cancel-timers'});
  assert.equal(kept.state.phase, 'shown');
  const gone = run({type: 'enter', target: group('g')}, {type: 'timer'}, {type: 'leave-rail'}, {type: 'grace'});
  assert.deepEqual(gone.effects.at(-1), {type: 'hide', card: 'all'});
  assert.equal(gone.state.phase, 'idle');
});

test('leaving before the delay never opens', () => {
  const {state, effects} = run({type: 'enter', target: tab(1)}, {type: 'leave-rail'}, {type: 'timer'});
  assert.equal(shows(effects).length, 0);
  assert.equal(state.phase, 'idle');
});

test('a group shows the list card; its rows wait once, then swap at once', () => {
  const list = run({type: 'enter', target: group('g')}, {type: 'timer'});
  assert.deepEqual(shows(list.effects), [{type: 'show', card: 'list', target: group('g')}]);
  const first = run({type: 'enter', target: group('g')}, {type: 'timer'}, {type: 'leave-rail'}, {type: 'enter-list'},
    {type: 'enter-row', target: row(5)});
  assert.deepEqual(first.effects.at(-1), {type: 'start-timer', ms: 500});
  const both = run({type: 'enter', target: group('g')}, {type: 'timer'}, {type: 'leave-rail'}, {type: 'enter-list'},
    {type: 'enter-row', target: row(5)}, {type: 'timer'}, {type: 'enter-row', target: row(6)});
  assert.deepEqual(shows(both.effects).slice(1), [
    {type: 'show', card: 'picture', target: row(5)}, {type: 'show', card: 'picture', target: row(6)}]);
  assert.deepEqual(both.state.list, group('g'));
});

test('moving from a group to a tab swaps the list for a picture', () => {
  const {effects} = run({type: 'enter', target: group('g')}, {type: 'timer'}, {type: 'enter', target: tab(3)});
  const after = effects.slice(effects.findIndex(e => e.type === 'show') + 1);
  assert.deepEqual(after.filter(e => e.type !== 'cancel-timers'),
    [{type: 'hide', card: 'list'}, {type: 'show', card: 'picture', target: tab(3)}]);
});

test('keyboard focus opens and swaps like the pointer; any dismissal closes', () => {
  const focused = run({type: 'focus', target: tab(1)}, {type: 'timer'}, {type: 'focus', target: tab(2)});
  assert.deepEqual(shows(focused.effects).map(e => e.target), [tab(1), tab(2)]);
  for (const reason of ['click', 'scroll', 'key', 'drag', 'blur', 'resize', 'tab-switch', 'surface', 'glance', 'snapshot']) {
    const closed = run({type: 'enter', target: tab(1)}, {type: 'timer'}, {type: 'dismiss', reason});
    assert.deepEqual(closed.effects.slice(-2), [{type: 'cancel-timers'}, {type: 'hide', card: 'all'}], reason);
    assert.equal(closed.state.phase, 'idle');
  }
});

test('pictureFor picks what a card may show', () => {
  const ctx = {activeTabId: 1, visibleTabIds: [1, 2]};
  const picture = tab => hover.pictureFor({url: 'https://example.com/', ...tab}, ctx);
  assert.equal(picture({id: 9, private: true, asleep: true}), 'private');
  assert.equal(picture({id: 1, private: true}), 'private');
  assert.equal(picture({id: 1}), 'none');
  assert.equal(picture({id: 2}), 'none');
  assert.equal(picture({id: 9, url: 'blanc://newtab/'}), 'page');
  assert.equal(picture({id: 9, url: 'chrome://extensions/'}), 'page');
  assert.equal(picture({id: 9, asleep: true}), 'quiet');
  assert.equal(picture({id: 9}), 'live');
});

test('only collapsed groups get a list card', () => {
  assert.equal(hover.groupCardFor({collapsed: true}), true);
  assert.equal(hover.groupCardFor({collapsed: false}), false);
  assert.equal(hover.groupCardFor(null), false);
});

test('suppressed outside the plain vertical rail', () => {
  const calm = {layout: 'vertical', glanceOpen: false, surfaceOpen: false, dragging: false, railHidden: false};
  assert.equal(hover.suppressed(calm), false);
  for (const change of [{layout: 'island'}, {glanceOpen: true}, {surfaceOpen: true}, {dragging: true}, {railHidden: true}])
    assert.equal(hover.suppressed({...calm, ...change}), true, JSON.stringify(change));
});

// Final review fixes.
test('resting off a row cancels the wait, and starts the grace once a card is up', () => {
  const waiting = run({type: 'enter', target: tab(1)}, {type: 'leave-row'}, {type: 'timer'});
  assert.equal(shows(waiting.effects).length, 0);
  assert.equal(waiting.state.phase, 'idle');
  const shown = run({type: 'enter', target: tab(1)}, {type: 'timer'}, {type: 'leave-row'});
  assert.deepEqual(shown.effects.at(-1), {type: 'start-grace', ms: 150});
  const back = run({type: 'enter', target: tab(1)}, {type: 'timer'}, {type: 'leave-row'}, {type: 'enter', target: tab(1)});
  assert.equal(back.state.phase, 'shown');
});

test('the same row again while waiting keeps the running wait', () => {
  let state = hover.step(hover.initialState(), {type: 'enter', target: tab(1)}).state;
  assert.deepEqual(plain(hover.step(state, {type: 'enter', target: tab(1)}).effects), []);
});

test('keys: row keys keep the card, Escape is taken only from a card on screen', () => {
  assert.equal(hover.keyAction('ArrowDown', {onRow: true, cardUp: true}), 'keep');
  assert.equal(hover.keyAction('Home', {onRow: false, cardUp: true}), 'dismiss');
  assert.equal(hover.keyAction('Escape', {onRow: true, cardUp: true}), 'swallow');
  assert.equal(hover.keyAction('Escape', {onRow: true, cardUp: false}), 'dismiss');
  assert.equal(hover.keyAction('a', {onRow: true, cardUp: true}), 'dismiss');
});

test('only focus that follows a key press opens a card', () => {
  assert.equal(hover.keyboardFocus(1000, 1300), true);
  assert.equal(hover.keyboardFocus(1000, 1700), false);
  assert.equal(hover.keyboardFocus(null, 1000), false);
});

// Pictures ahead of time (owner, 2026-11-14): one picture of each background
// tab once it finishes loading, so a tab's first card never waits.
test('warmTargets: a loaded background tab, once per address', () => {
  const tabs = [
    {id: 1, url: 'https://a.example/', isLoading: false},
    {id: 2, url: 'https://b.example/', isLoading: false},
    {id: 3, url: 'https://c.example/', isLoading: true},
    {id: 4, url: 'https://d.example/', isLoading: false, private: true},
    {id: 5, url: 'https://e.example/', isLoading: false, asleep: true},
    {id: 6, url: 'blanc://newtab/', isLoading: false},
    {id: 7, url: 'https://g.example/', isLoading: false},
    {id: 8, url: 'https://h.example/', isLoading: false},
  ];
  const snapshot = {tabs, activeTabId: 1, splits: [{id: 's', tabIds: [1, 7]}]};
  assert.deepEqual(plain(hover.warmTargets(snapshot, new Map())), [{id: 2, url: 'https://b.example/'}, {id: 8, url: 'https://h.example/'}]);
  assert.deepEqual(plain(hover.warmTargets(snapshot, new Map([[2, 'https://b.example/'], [8, 'https://h.example/']]))), []);
  const moved = new Map([[2, 'https://b.example/old'], [8, 'https://h.example/']]);
  assert.deepEqual(plain(hover.warmTargets(snapshot, moved)).map(t => t.id), [2], 'a new address gets a new picture');
  assert.deepEqual(plain(hover.warmTargets({...snapshot, glanceTabId: 8}, new Map())).map(t => t.id), [2], 'not the Glance page on screen');
});

test('suppressed while a permission prompt is up; a window going to the background closes cards once', () => {
  const calm = {layout: 'vertical', glanceOpen: false, surfaceOpen: false, dragging: false, railHidden: false};
  assert.equal(hover.suppressed({...calm, promptOpen: false}), false);
  assert.equal(hover.suppressed({...calm, promptOpen: true}), true, 'a site permission prompt');
  // macOS lets a background window take hover, so cards may open there; only
  // the moment another app comes to the front (⌘-Tab with the page focused) closes them.
  assert.equal(hover.windowWentAway(true, false), true);
  assert.equal(hover.windowWentAway(false, false), false);
  assert.equal(hover.windowWentAway(null, false), false);
  assert.equal(hover.windowWentAway(false, true), false);
});
