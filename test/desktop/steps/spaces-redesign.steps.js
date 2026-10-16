'use strict';
// F41 Blanc Spaces redesign: the Island's space mark, the Spaces menu opened
// from it, live editing, Undo, keyboard use, Reduce Motion and the Quick
// Switcher. Spaces and Patron state are reset between scenarios by the
// global Before hook.
const assert = require('node:assert/strict');
const { After, Given, When, Then } = require('@cucumber/cucumber');
const { overlayPage } = require('../support/overlay');
const { openOverlaySurface, waitForValue } = require('../support/poll');
const SpaceIdentity = require('../../../src/renderer/space-identity');
const { SPACES_MENU_PAD, SPACES_MENU_SIDE } = require('../../../src/main/chrome-layout');
const { chromePage } = require('../support/tab-drag');

async function saveSpace(world, name, identity) {
  const saved = await world.call('workspaceAction', 'save', name);
  assert.equal(saved.ok, true, `save ${name}: ${JSON.stringify(saved)}`);
  if (identity) assert.equal((await world.call('workspaceAction', 'update', saved.workspace.id, identity)).ok, true);
  return saved.workspace.id;
}
async function spaceByName(world, name) {
  const data = await world.call('workspaceAction', 'list');
  return data.items.find((w) => w.name === name);
}
const mark = (world, predicate, label) => waitForValue(() => world.call('spaceMarkState'), (m) => !!m && predicate(m), label);
async function menu() {
  const page = await overlayPage();
  await page.waitForSelector('#workspaceSwitcher', { state: 'visible' });
  return page;
}

Given('a space named {string} in this window, colored {string} with the symbol {string}', async function (name, color, symbol) {
  this.spaceIds = { [name]: await saveSpace(this, name, { color, symbol }) };
});
Given('spaces named {string} and {string}, with this window in {string}', async function (first, second, current) {
  assert.equal(current, first, 'the scenario saves the current window first');
  this.spaceIds = { [first]: await saveSpace(this, first) };
  const other = await this.call('openNewWindow');
  const saved = await this.call('workspaceActionInWindow', other, 'save', second);
  assert.equal(saved.ok, true);
  this.spaceIds[second] = saved.workspace.id;
  await this.call('closeWindowRuntime', other); // "Reading" is saved but open nowhere
  await waitForValue(async () => (await this.call('workspaceAction', 'list')).items.length, (n) => n === 2, 'both spaces listed');
  // A page still loading here would make the switch ask first (an existing
  // protection), so wait for this window's page to settle.
  await this.waitForState((st) => { const tab = st.tabs.find((t) => t.id === st.activeTabId); return !!tab && !tab.isLoading && !tab.asleep; });
});
Given('a space named {string}, colored {string} with the symbol {string}, deleted today', async function (name, color, symbol) {
  const other = await this.call('openNewWindow');
  const saved = await this.call('workspaceActionInWindow', other, 'save', name);
  assert.equal(saved.ok, true);
  await this.call('closeWindowRuntime', other);
  assert.equal((await this.call('workspaceAction', 'update', saved.workspace.id, { color, symbol })).ok, true);
  assert.equal((await this.call('workspaceAction', 'remove', saved.workspace.id)).ok, true);
});
Given('a space named {string} saved from another window', async function (name) {
  const other = await this.call('openNewWindow');
  assert.equal((await this.call('workspaceActionInWindow', other, 'save', name)).ok, true);
  this.otherWindow = other;
});
Given('a page open in a window that is in no space, and a saved space named {string}', async function (name) {
  const other = await this.call('openNewWindow');
  assert.equal((await this.call('workspaceActionInWindow', other, 'save', name)).ok, true);
  await this.call('closeWindowRuntime', other);
  const tab = await this.call('openTab', this.fixtureUrl('workspace-draft'));
  // Any tab still loading makes the switch refuse to close pages (an existing
  // protection, 'active-page'), so wait for every tab here, not just this one.
  await this.waitForState((st) => st.tabs.some((t) => t.id === tab && t.title === 'workspace-draft')
    && st.tabs.every((t) => !t.isLoading && !t.asleep));
});
Given('spaces named {string}, {string}, {string} and {string}, with this window in {string}', async function (a, b, c, d, current) {
  assert.equal(current, a, 'the scenario saves the current window first');
  this.spaceIds = { [a]: await saveSpace(this, a) };
  for (const name of [b, c, d]) {
    const other = await this.call('openNewWindow');
    const saved = await this.call('workspaceActionInWindow', other, 'save', name);
    assert.equal(saved.ok, true, `save ${name}`);
    this.spaceIds[name] = saved.workspace.id;
    await this.call('closeWindowRuntime', other); // saved, open nowhere
  }
  await waitForValue(async () => (await this.call('workspaceAction', 'list')).items.length, (n) => n === 4, 'all four spaces listed');
  await this.waitForState((st) => st.tabs.every((t) => !t.isLoading && !t.asleep));
});
async function showWebPage(world, { pinned = false } = {}) {
  const id = await world.call('openTab', world.fixtureUrl('workspace-draft'));
  await world.waitForState((st) => st.tabs.some((t) => t.id === id && !t.isLoading && t.title === 'workspace-draft'));
  if (pinned) await world.call('pinTab', id);
  // A switch is refused while any tab in the window still loads (active-page),
  // and on a slow runner the start page can outlast the new page's load.
  await settled(world);
  return id;
}
Given('this window is showing a web page that keeps session storage', async function () {
  this.pageId = await showWebPage(this);
  await this.call('workspacePageScript', this.pageId, "sessionStorage.setItem('kept', 'yes'); true");
});
Given('this window is showing a web page', async function () {
  this.pageId = await showWebPage(this);
});
Given('this window is showing a web page, beside a pinned web page', async function () {
  this.pinnedId = await showWebPage(this, { pinned: true });
  this.pageId = await showWebPage(this);
  await this.call('activateTab', this.pageId);
  await this.waitForState((st) => st.activeTabId === this.pageId && st.tabs.every((t) => !t.isLoading));
});
Given('eight spaces, with this window in the first', async function () {
  this.spaceNames = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8'];
  this.spaceIds = { S1: await saveSpace(this, 'S1') };
  for (const name of this.spaceNames.slice(1)) {
    const other = await this.call('openNewWindow');
    const saved = await this.call('workspaceActionInWindow', other, 'save', name);
    assert.equal(saved.ok, true, `save ${name}`);
    this.spaceIds[name] = saved.workspace.id;
    await this.call('closeWindowRuntime', other);
  }
  this.pageId = await showWebPage(this);
});
Given('Quiet Tabs is off', async function () {
  assert.equal(await this.call('setQuietTabs', 'off'), 'off');
});
After({ tags: '@F41-36 or @F41-39' }, async function () {
  await this.call('setQuietTabs', '1h');
});
// The test hook emulates the media feature through Electron's debugger, but
// Playwright holds its own CDP session on the strip and, on Linux, reapplies
// its own media emulation while the scenario drives the overlay, undoing it
// (the Ubuntu VM reproduced this on main). Playwright's emulation is the one
// that lasts, so the strip gets it from Playwright too, and the step waits
// until the strip itself reports Reduce Motion.
Given('Reduce Motion is on', async function () {
  assert.equal(await this.call('emulateReducedMotion', true), true);
  await (await chromePage()).emulateMedia({ reducedMotion: 'reduce' });
  await waitForValue(() => this.call('pillPlaceholderState'), (pill) => pill?.reducedMotion === true,
    'the strip reporting Reduce Motion');
});
After({ tags: '@F41-23 or @F41-28' }, async function () {
  await this.call('emulateReducedMotion', false);
  await (await chromePage()).emulateMedia({ reducedMotion: 'no-preference' });
});

When('I open the Spaces menu from the space mark', async function () {
  await this.call('clickPillSpace');
});
When('I edit {string} to the color {string} and the symbol {string}', async function (name, color, symbol) {
  const page = await menu(); const space = await spaceByName(this, name);
  await page.click(`[data-focus-key="edit:${space.id}"]`);
  await page.click(`[data-focus-key="color:${color}"]`);
  await page.click(`[data-focus-key="symbol:${symbol}"]`);
});
When('I give {string} the custom color {string}', async function (name, hex) {
  const page = await menu(); const space = await spaceByName(this, name);
  await page.click(`[data-focus-key="edit:${space.id}"]`);
  await page.click('[data-focus-key="color:custom"]');
  await page.fill('.space-picker-hex', hex);
});
When('I rename {string} to a 60-character name', async function (name) {
  const before = await mark(this, (m) => m.state === 'space' && m.name === name, `the mark for ${name}`);
  this.squareBefore = before.square;
  const long = 'This is a really long title for a space that keeps going on.'.slice(0, 60);
  assert.equal(long.length, 60);
  const space = await spaceByName(this, name);
  assert.equal((await this.call('workspaceAction', 'update', space.id, { name: long })).ok, true);
  this.longName = long;
});
When('I open Recently Deleted', async function () {
  const page = await menu();
  await page.click('[data-focus-key="recently-deleted"]');
  await page.waitForSelector('.ws-recovery-row');
});
// A page still loading or waking makes a switch ask first (the existing
// 'active-page' protection), so let the space's page settle, as a person would.
const settled = (world) => world.waitForState((st) => st.tabs.every((t) => !t.isLoading)
  && st.tabs.some((t) => t.id === st.activeTabId && !t.asleep));
When('I switch this window to {string}, then {string}, then {string}', async function (first, second, third) {
  const names = [first, second, third];
  this.switchResults = [];
  for (const name of names) {
    const result = await this.call('workspaceAction', 'open', this.spaceIds[name]);
    this.switchResults.push({ name, ok: result?.ok === true, result });
    if (!result?.ok) break;
    await mark(this, (m) => m.state === 'space' && m.name === name, `the window in ${name}`);
    await settled(this);
  }
});
When('I switch this window through the other seven', async function () {
  this.switchResults = [];
  for (const name of this.spaceNames.slice(1)) {
    const result = await this.call('workspaceAction', 'open', this.spaceIds[name]);
    this.switchResults.push({ name, ok: result?.ok === true, result });
    assert.equal(result?.ok, true, `switch to ${name}: ${JSON.stringify(result)}`);
    await mark(this, (m) => m.state === 'space' && m.name === name, `the window in ${name}`);
    await settled(this);
  }
});
When('I switch this window to {string}', async function (name) {
  const result = await this.call('workspaceAction', 'open', this.spaceIds[name]);
  assert.equal(result?.ok, true, JSON.stringify(result));
  await mark(this, (m) => m.state === 'space' && m.name === name, `the window in ${name}`);
  await settled(this);
});
When('I switch back to {string} while its page is being quieted', async function (name) {
  this.race = await this.call('raceSwitchBackDuringQuiet', this.spaceIds[name]);
  assert.equal(this.race.result?.ok, true, JSON.stringify(this.race));
  // Positive control: the switch really landed mid-teardown.
  assert.equal(this.race.sleepingAtSwitch, true, `the quiet was under way at the switch: ${JSON.stringify(this.race)}`);
});
When('I open the color picker for {string}', async function (name) {
  const page = await menu(); const space = await spaceByName(this, name);
  await page.click(`[data-focus-key="edit:${space.id}"]`);
  await page.click('[data-focus-key="color:custom"]');
  await page.waitForSelector('.space-picker-hex');
});
When('I type the custom color {string} into the picker', async function (hex) {
  const page = await menu();
  await page.fill('.space-picker-hex', hex);
});
When('I delete {string} from its editor', async function (name) {
  const page = await menu(); const space = await spaceByName(this, name);
  await page.click(`[data-focus-key="edit:${space.id}"]`);
  await page.click('[data-focus-key="delete"]');
  await page.waitForSelector('[data-focus-key="undo"]');
});
When('I undo the delete', async function () {
  const page = await menu();
  await page.click('[data-focus-key="undo"]');
});
When('I move {string} down with Option or Alt and the down arrow', async function (name) {
  const page = await menu(); const space = await spaceByName(this, name);
  await page.focus(`[data-focus-key="open:${space.id}"]`);
  assert.equal(await this.call('pressOverlayKey', 'Down', ['alt']), true);
});
When('I press Escape in the Spaces menu', async function () {
  assert.equal(await this.call('pressOverlayKey', 'Escape'), true);
});
When('I close the Spaces menu and click the mark again before it has faded', async function () {
  await menu();
  assert.equal(await this.call('pressOverlayKey', 'Escape'), true);
  await waitForValue(() => this.call('spacesMenuExitState'), (f) => f.mode == null && f.showing, 'the menu to start fading');
  await this.call('clickPillSpace');
});
// A real press on the mark moves OS focus to the strip, and the overlay's
// blur closes the menu before the click arrives. Acceptance turns blur
// dismissal off (main.js), so the step performs that close itself, in the
// same order a mouse does: press, blur close, then the click.
When('I press the space mark with the pointer, which takes focus from the menu', async function () {
  await menu();
  await waitForValue(() => this.call('spaceMarkState'), (m) => m?.expanded === 'true', 'the mark to show its menu open');
  const strip = await chromePage();
  await strip.evaluate(() => document.getElementById('pillSpace').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse' })));
  await this.call('closeOverlay');
  await waitForValue(() => this.call('spaceMarkState'), (m) => m?.expanded === 'false', 'the blur close to reach the strip');
  await strip.evaluate(() => document.getElementById('pillSpace').click());
});
When('I switch to {string} from the Spaces menu', async function (name) {
  await this.call('clickPillSpace');
  const page = await menu(); const space = await spaceByName(this, name);
  await page.click(`[data-focus-key="open:${space.id}"]`);
});
When('I pick {string} in the Spaces menu', async function (name) {
  const page = await menu(); const space = await spaceByName(this, name);
  await page.click(`[data-focus-key="open:${space.id}"]`);
});
When('I type {string} into the panel and pick the space result', async function (text) {
  await openOverlaySurface(this, 'openPanel', 'panel');
  const page = await overlayPage();
  await page.fill('#addressInput', text);
  const row = page.locator('.island-row', { has: page.locator('.row-space-tile') }).first();
  await row.waitFor();
  await row.click();
});

Then('the Island shows no space mark', async function () {
  await mark(this, (m) => m.hidden === true && m.state === 'none', 'no space mark');
});
Then('the Island shows the quiet Spaces mark', async function () {
  const m = await mark(this, (s) => s.hidden === false && s.state === 'neutral', 'the neutral mark');
  assert.equal(m.name, '');
  assert.equal(m.label, 'Spaces');
});
const rgb = (hex) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;
// The quiet mark: the space's exact colour fills the square behind its
// symbol; the mark itself stays clear and the name is the Island's own text.
Then('the Island\'s space mark reads {string} in {string} with the symbol {string}', async function (name, color, symbol) {
  // At rest the mark has no fill of its own; open, it takes the Island's
  // control highlight, never the space's colour. The hover and open
  // highlight fades over 350 ms (styles.css), so a mark just closed is still
  // fading: wait for rest, not a frame of it.
  const m = await mark(this, (s) => s.state === 'space' && s.name === name && s.fill === color && s.symbol === symbol
    && s.squareBackground === rgb(color) && (s.expanded !== 'false' || s.markBackground === 'rgba(0, 0, 0, 0)'),
  `the mark for ${name} in ${color} with ${symbol}, at rest`);
  if (m.expanded === 'false') assert.equal(m.markBackground, 'rgba(0, 0, 0, 0)', 'the mark has no fill of its own at rest');
  else assert.notEqual(m.markBackground, rgb(color), 'open, the mark is highlighted, not filled');
  assert.equal(m.nameColor, m.islandText, 'the name is the Island\'s ordinary text');
});
Then('the mark\'s symbol is {string} on its color', async function (on) {
  const m = await mark(this, (s) => s.on === on && s.symbolColor === rgb(on), `the symbol in ${on}`);
  assert.equal(m.on, on);
});
Then('the Island\'s space mark reads {string}', async function (name) {
  const m = await mark(this, (s) => s.state === 'space' && s.name === name, `the mark for ${name}`);
  assert.equal(m.label, `Space: ${name}`);
});
Then('the Spaces menu opens directly below the mark', async function () {
  await waitForValue(() => this.call('overlayRendererMode'), (m) => m === 'spaces', 'the spaces overlay mode');
  // The Island may still be settling from the mark's arrival; main re-anchors
  // the menu as the pill reports its new position.
  const { bounds, m } = await waitForValue(
    async () => ({ bounds: await this.call('overlayBounds'), m: await this.call('spaceMarkState') }),
    ({ bounds: b, m: s }) => !!b && !!s && Math.abs(b.x + SPACES_MENU_SIDE - Math.round(s.left)) <= 1,
    'the menu to line up under the mark',
  );
  assert.equal(m.expanded, 'true');
  assert.ok(bounds.y < m.bottom + 6, 'the menu starts just below the mark');
  // The overlay view starts 16px above the menu (room for its shadow), so the
  // menu's top edge is bounds.y + 16: it must clear the Island (spec D18).
  assert.ok(bounds.y + 16 > m.islandBottom, `the menu does not cover the Island: ${JSON.stringify({ bounds, islandBottom: m.islandBottom })}`);
});
Then('the Spaces menu is closed', async function () {
  await waitForValue(() => this.call('overlayRendererMode'), (m) => m == null, 'the overlay to close');
  assert.equal((await this.call('spaceMarkState')).expanded, 'false');
});
Then('the Spaces menu is closed and the space mark has focus', async function () {
  await waitForValue(() => this.call('overlayRendererMode'), (m) => m == null, 'the overlay to close');
  await waitForValue(() => this.call('chromeFocusedId'), (id) => id === 'pillSpace', 'focus to return to the space mark');
});
// Sample the close every 10ms until the overlay view is gone, then look for
// a frame where main had already closed the overlay but the menu was still
// being drawn, fading, in the place it opened.
async function closingFrames(world) {
  const frames = []; const deadline = Date.now() + 3000;
  for (;;) {
    const frame = await world.call('spacesMenuExitState');
    frames.push(frame);
    if (frame.mode == null && !frame.showing) break;
    if (Date.now() > deadline) throw new Error(`the overlay never closed: ${JSON.stringify(frames.slice(-3))}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  const fading = frames.filter((f) => f.mode == null && f.showing && f.hidden && f.display !== 'none');
  assert.ok(fading.length > 0, `the menu is still drawn after the overlay closes: ${JSON.stringify(frames)}`);
  // Opened from the mark it sits SPACES_MENU_SIDE in from its view's left and
  // SPACES_MENU_PAD down (styles.css); it must not jump back to the panel's
  // placement as it goes.
  for (const f of fading) assert.deepEqual([f.top, f.left], [`${SPACES_MENU_PAD}px`, `${SPACES_MENU_SIDE}px`], `the menu fades where it opened: ${JSON.stringify(f)}`);
  await waitForValue(() => world.call('spacesMenuExitState'), (f) => f.display === 'none' && f.closing === '', 'the menu to finish closing');
  return fading;
}
Then('the Spaces menu fades out below the mark before it is removed', async function () {
  await closingFrames(this);
});
Then('the Spaces menu fades out without moving', async function () {
  const fading = await closingFrames(this);
  for (const f of fading) assert.equal(f.transform, 'none', `only opacity changes: ${JSON.stringify(f)}`);
});
Then('the Spaces menu is closed and stays closed', async function () {
  await new Promise((resolve) => setTimeout(resolve, 500));
  assert.equal(await this.call('overlayMode'), null, 'the click must not reopen the menu');
  assert.equal((await this.call('spaceMarkState')).expanded, 'false');
});
Then('the Spaces menu stays open below the mark', async function () {
  await waitForValue(() => this.call('spacesMenuExitState'), (f) => f.mode === 'spaces', 'the menu to reopen');
  // Past the old fade's end: its timers must not take the reopened menu away.
  await new Promise((resolve) => setTimeout(resolve, 500));
  const f = await this.call('spacesMenuExitState');
  assert.deepEqual({ mode: f.mode, showing: f.showing, hidden: f.hidden, closing: f.closing, top: f.top, left: f.left },
    { mode: 'spaces', showing: true, hidden: false, closing: '', top: `${SPACES_MENU_PAD}px`, left: `${SPACES_MENU_SIDE}px` });
  assert.equal(f.opacity, 1);
});
Then('the space {string} is saved with the color {string}', async function (name, color) {
  await waitForValue(() => spaceByName(this, name), (w) => w?.color === color, `${name} saved as ${color}`);
});
// A name clipped by its own box (overflow: hidden, for the ellipsis) loses
// the bottoms of g, p and y when its line is shorter than the font. Measure
// each name's ink with its own font and check it fits inside that box.
function inkInsideBox(selector) {
  return [...document.querySelectorAll(selector)].filter((el) => el.getClientRects().length).map((el) => {
    const cs = getComputedStyle(el);
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const m = ctx.measureText(el.textContent);
    const line = parseFloat(cs.lineHeight) || el.clientHeight;
    const baseline = (line - (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent)) / 2 + m.fontBoundingBoxAscent;
    return { text: el.textContent, box: el.clientHeight, inkTop: +(baseline - m.actualBoundingBoxAscent).toFixed(2), inkBottom: +(baseline + m.actualBoundingBoxDescent).toFixed(2) };
  });
}
Then('every space name in the menu and on the mark is drawn whole', async function () {
  const page = await menu();
  await page.waitForFunction(() => document.querySelectorAll('#workspaceSwitcher .ws-row-name').length >= 2);
  await page.evaluate(() => document.fonts.ready);
  const rows = await page.evaluate(inkInsideBox, '#workspaceSwitcher .ws-row-name');
  const strip = await chromePage();
  await strip.evaluate(() => document.fonts.ready);
  const mark = await strip.evaluate(inkInsideBox, '#pillSpaceName');
  assert.deepEqual(rows.map((r) => r.text).sort(), ['Reading', 'Typing gym']);
  assert.equal(mark.length, 1, 'the mark shows its name');
  for (const n of [...rows, ...mark]) {
    assert.ok(n.inkTop >= -0.5 && n.inkBottom <= n.box + 0.5, `"${n.text}" fits its ${n.box}px box: ${JSON.stringify(n)}`);
  }
});
Then('the mark\'s colour square keeps its size and place, and the name is cut short', async function () {
  const m = await mark(this, (s) => s.name === this.longName, 'the mark with the long name');
  assert.ok(m.square.width > 0 && Math.abs(m.square.width - m.square.height) < 0.5, `still square: ${JSON.stringify(m.square)}`);
  assert.deepEqual(
    [m.square.width, m.square.height, m.square.inset].map((v) => Math.round(v * 10) / 10),
    [this.squareBefore.width, this.squareBefore.height, this.squareBefore.inset].map((v) => Math.round(v * 10) / 10),
    'the same size, at the same place in the mark',
  );
  assert.equal(m.nameTruncated, true, 'the name ellipsizes instead');
});
const recoveryRow = (page, name) => page.evaluate((wanted) => {
  const row = [...document.querySelectorAll('.ws-recovery-row')].find((r) => r.querySelector('.ws-row-name')?.textContent === wanted);
  if (!row) return null;
  const nameEl = row.querySelector('.ws-row-name'); const bin = row.querySelector('.ws-recovery-forget');
  return {
    tile: getComputedStyle(row.querySelector('.ws-tile')).backgroundColor,
    title: nameEl.title, truncated: nameEl.scrollWidth > nameEl.clientWidth,
    when: row.querySelector('.ws-recovery-when')?.textContent ?? null,
    bin: bin && { label: bin.getAttribute('aria-label'), title: bin.title, text: bin.textContent.trim() },
  };
}, name);
Then('{string} is listed in {string}, deleted today, with its full name as a tooltip', async function (name, color) {
  const page = await menu();
  const row = await waitForValue(() => recoveryRow(page, name), Boolean, `the row for ${name}`);
  assert.equal(row.tile, rgb(color), 'its own colour');
  assert.equal(row.when, 'Deleted today');
  assert.equal(row.truncated, true, 'a name this long is cut short in the row');
  assert.equal(row.title, name, 'and is there in full as its tooltip');
  this.recoveryName = name;
});
Then('it has a trash button labelled {string}', async function (label) {
  const row = await recoveryRow(await menu(), this.recoveryName);
  assert.deepEqual(row.bin, { label: `Delete ${this.recoveryName} permanently…`, title: label, text: '' }, 'named for screen readers; the tooltip is the plain label');
});
Then('every switch went through', async function () {
  assert.deepEqual(this.switchResults.map((r) => [r.name, r.ok]), this.switchResults.map((r) => [r.name, true]), JSON.stringify(this.switchResults));
  assert.equal(this.switchResults.length, 3);
});
Then('the space set aside first, {string}, has had its web page quieted', async function (name) {
  const page = (all) => all.find((s) => s.name === name)?.tabs.find((t) => t.id === this.pageId);
  let spaces;
  try {
    spaces = await waitForValue(() => this.call('residentSpaces'), (all) => page(all)?.asleep && !page(all).live, `${name}'s web page to be quieted`, 10000);
  } catch (error) {
    error.message += `; room pass: ${JSON.stringify(await this.call('roomPass'))}`;
    throw error;
  }
  assert.equal(spaces.length, 3, `three spaces set aside: ${JSON.stringify(spaces)}`);
  this.firstSetAside = name;
});
Then('its pinned page is still loaded', async function () {
  const spaces = await this.call('residentSpaces');
  const pinned = spaces.find((s) => s.name === this.firstSetAside)?.tabs.find((t) => t.id === this.pinnedId);
  assert.deepEqual({ pinned: pinned?.pinned, live: pinned?.live, asleep: pinned?.asleep }, { pinned: true, live: true, asleep: false });
});
Then('the window shows that page, awake', async function () {
  await mark(this, (m) => m.state === 'space' && m.name === 'One', 'the window back in One');
  await this.waitForState((st) => st.activeTabId === this.race.tabId && st.tabs.some((t) => t.id === this.race.tabId && !t.asleep), 10000);
});
Then('at most six spaces are set aside', async function () {
  const spaces = await waitForValue(() => this.call('residentSpaces'), (all) => all.length <= 6, 'at most six set aside', 10000);
  assert.equal(spaces.length, 6, `the cap, exactly: ${JSON.stringify(spaces.map((s) => s.name))}`);
  this.setAside = spaces.map((s) => s.name);
});
Then('the first space was released, and switching back to it brings its page back', async function () {
  assert.equal(this.setAside.includes('S1'), false, `S1 was released: ${this.setAside}`);
  const pageUrl = this.fixtureUrl('workspace-draft');
  const result = await this.call('workspaceAction', 'open', this.spaceIds.S1);
  assert.equal(result?.ok, true, JSON.stringify(result));
  await this.waitForState((st) => st.tabs.some((t) => t.url === pageUrl), 10000);
});
Then('{string} and {string} are still loaded in the background', async function (first, second) {
  const names = [first, second];
  const spaces = await this.call('residentSpaces');
  for (const name of names) {
    assert.ok(spaces.find((s) => s.name === name)?.tabs.some((t) => t.live), `${name} is loaded: ${JSON.stringify(spaces)}`);
  }
});
Then('Blanc made no room because Quiet Tabs is off', async function () {
  // The pass ran after the last switch, and declined: not merely not run.
  await waitForValue(() => this.call('roomPass'), (pass) => pass?.outcome === 'quiet-tabs-off', 'the make-room pass to decline');
  const spaces = await this.call('residentSpaces');
  assert.equal(spaces.length, 3);
  assert.ok(spaces.every((s) => s.tabs.every((t) => t.live && !t.asleep)), JSON.stringify(spaces));
});
Then('the editor shows no readability note', async function () {
  const page = await menu();
  // Every colour is drawn exactly as chosen, so nothing needs explaining.
  assert.equal(await page.$('.ws-guard'), null);
  assert.equal(await page.evaluate(() => document.getElementById('workspaceSwitcher').textContent.includes('Kept readable')), false);
});
Then('this window is in the space {string} again', async function (name) {
  await waitForValue(() => spaceByName(this, name), (w) => w?.active === true, `${name} bound again`);
  await mark(this, (m) => m.state === 'space' && m.name === name, 'the mark again');
});
Then('the spaces are listed as {string} then {string}', async function (first, second) {
  await waitForValue(async () => (await this.call('workspaceAction', 'list')).items.map((w) => w.name).join(','), (v) => v === `${first},${second}`, 'the new order');
});
Then('the space mark changes to {string} without sliding', async function (name) {
  const m = await mark(this, (s) => s.name === name && s.animatedProperties.length > 0, `the switch animation to ${name}`);
  assert.equal(m.animatedProperties.includes('transform'), false,
    `only opacity animates: ${m.animatedProperties} (strip reduced motion ${m.reducedMotion}; ${JSON.stringify(m.animations)})`);
});
Then('the switch prompt offers save, new window, close, then cancel', async function () {
  const page = await menu();
  await page.waitForSelector('.ws-decision');
  const order = await page.$$eval('.ws-decision-actions button', (buttons) => buttons.map((b) => b.dataset.focusKey));
  assert.deepEqual(order, ['save-first', 'new-window', 'close-and-switch', 'cancel']);
});

Given('a private tab beside an ordinary tab, with the ordinary tab selected', async function () {
  const ordinary = (await this.state()).activeTabId;
  this.privateTabId = await this.call('openTab', this.fixtureUrl('workspace-private'), { private: true });
  await this.waitForState((st) => st.tabs.some((t) => t.id === this.privateTabId && !t.isLoading));
  await this.call('activateTab', ordinary);
  await this.waitForState((st) => st.activeTabId === ordinary && st.tabs.every((t) => !t.isLoading));
  // Settle on the ordinary theme first, so the switch is the only change.
  assert.equal(SpaceIdentity.paint('#426c4c', 'light').edge, false);
  await mark(this, (m) => m.fill === '#426c4c' && m.edge === 'false', 'the mark in the ordinary theme, no edge');
});
When('I select the private tab', async function () {
  await this.call('activateTab', this.privateTabId);
});
Then('the Island\'s space mark is drawn for the private theme', async function () {
  // The colour is the same on every theme; against the private Island's
  // near-black surface Sage needs the edge.
  assert.equal(SpaceIdentity.paint('#426c4c', 'private').edge, true);
  await mark(this, (m) => m.fill === '#426c4c' && m.edge === 'true', 'the mark redrawn for the private surface, with its edge');
});
