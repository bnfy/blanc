// Shared helpers for drag-to-reorder scenarios (F3-6..16, F28-10/11).
//
// Drags use real pointer input through Playwright — down on the source, a move
// past the 4px threshold, stepped moves to the target, up — never synthesized
// DragEvents, because the product deliberately has no HTML5 drag-and-drop.
const assert = require('node:assert/strict');
const ctx = require('./context');
const { waitForValue, openOverlaySurface } = require('./poll');
const { overlayPage } = require('./overlay');

async function chromePage() {
  const deadline = Date.now() + 7000;
  for (;;) {
    const page = ctx.app.windows().find((candidate) =>
      !candidate.isClosed() && candidate.url() === 'blanc-chrome://index/');
    if (page) {
      await page.waitForLoadState('domcontentloaded');
      return page;
    }
    if (Date.now() > deadline) throw new Error('timed out locating the chrome window');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

// A real drag implies an unoccluded, key window; best-effort, as in the rail
// resize steps, so a window that cannot take focus does not fail on its own.
async function frontChromeWindow(world) {
  await waitForValue(() => world.call('focusWindow'), Boolean,
    'chrome window to front and take focus', 1500).catch(() => {});
}

/** The page and list element for a surface: 'rail' or 'island'. */
async function surfaceFor(world, surface) {
  if (surface === 'rail') {
    await world.call('setTabLayout', 'vertical');
    const page = await chromePage();
    await page.waitForFunction(() => document.documentElement.dataset.tabLayout === 'vertical');
    await page.locator('#verticalTabsRail:not([hidden])').waitFor();
    return { page, list: page.locator('#verticalTabsList') };
  }
  assert.equal(surface, 'island', `unknown surface ${surface}`);
  await world.call('setTabLayout', 'island');
  await openOverlaySurface(world, 'openPanel', 'panel');
  const page = await overlayPage();
  await page.locator('#islandList [data-drag-tab]').first().waitFor();
  return { page, list: page.locator('#islandList') };
}

const rowFor = (list, id) => list.locator(`[data-drag-tab][data-tab-id="${id}"]`);
const headerFor = (list, groupId) => list.locator(`[data-drag-header][data-group-id="${groupId}"]`);

async function boxOf(locator, label) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  assert.ok(box, `${label} has a rendered box`);
  return box;
}

/**
 * Press on `source`, cross the drag threshold, move to `target` ({x?, y}) and
 * release, unless `hold` is set (the caller then releases).
 */
async function pointerDrag(world, page, source, target, { hold = false } = {}) {
  await frontChromeWindow(world);
  const from = await boxOf(source, 'drag source');
  const x = from.x + Math.min(40, from.width / 2);
  const y = from.y + from.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 6);
  await page.mouse.move(target.x ?? x, target.y, { steps: 8 });
  if (hold) return;
  await page.mouse.up();
}

/** y just inside the top edge of a row or header: the gap before it. */
async function gapBefore(locator, label) {
  const box = await boxOf(locator, label);
  return box.y + 2;
}

async function middleOf(locator, label) {
  const box = await boxOf(locator, label);
  return box.y + box.height / 2;
}

/** Open a loaded fixture tab with a stable title, ungrouped. */
async function openNamedTab(world, name, query = '') {
  const url = `${world.fixtureUrl(name)}${query}`;
  const id = await world.call('openTab', url, {});
  await world.waitForState((state) => {
    const tab = state.tabs.find((candidate) => candidate.id === id);
    return tab && !tab.loading && tab.loadedUrl === url;
  });
  await world.call('setTabPresentation', id, { title: name });
  return id;
}

module.exports = {
  chromePage, frontChromeWindow, surfaceFor, rowFor, headerFor,
  pointerDrag, gapBefore, middleOf, openNamedTab,
};
