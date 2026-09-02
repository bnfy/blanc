'use strict';

const assert = require('node:assert/strict');
const { Given, When, Then } = require('@cucumber/cucumber');
const { waitForValue } = require('../support/poll');

const MAHJONG_TILE_COUNTS = Object.freeze({
  turtle: 144, arch: 96, peaks: 72, pyramid: 108, fortress: 96, butterfly: 94, bridge: 100, cross: 86,
});

async function openNewTab(world) {
  await world.call('newTab');
  await world.waitForState((state) => {
    const active = state.tabs.find((tab) => tab.id === state.activeTabId);
    return active?.loadedUrl?.startsWith('blanc://newtab');
  });
}

Given('a profile whose start page layout is {string}', async function (layout) {
  assert.equal(await this.call('setNewtabLayout', layout), layout);
});

Given('local history contains repeated visits for the Billboard', async function () {
  const sites = await this.call('seedBillboardHistory');
  assert.deepEqual(sites.slice(0, 2).map((site) => site.key), [
    'youtube.com',
    'cnet.com',
  ]);
  assert.equal(sites.length, 6);
  this.billboardHistoryCount = await this.call('historyCount');
});

Given('local history contains sixty ranked sites for the Billboard', async function () {
  this.billboardInitiallyHidden = await this.call('seedBillboardOverflowHistory');
  assert.equal(this.billboardInitiallyHidden.length, 48);
});

Given('the first forty-eight Billboard sites are hidden locally', async function () {
  assert.equal(await this.call('setBillboardHidden', this.billboardInitiallyHidden), true);
});

// "I open a new tab" itself is defined in runnable.steps.js; this Given
// additionally waits for the page to finish loading.
Given('a new tab is open', async function () {
  await openNewTab(this);
});

When('I choose the {string} start page layout from its footer', async function (layout) {
  assert.equal(await this.call('clickNewtabLayoutSwitcher', layout), true);
});

Then('the start page renders the {string} layout', async function (layout) {
  const expectedRoot = layout.charAt(0).toUpperCase() + layout.slice(1);
  await waitForValue(
    () => this.call('readNewtabLayoutDom'),
    (dom) =>
      dom?.layout === layout &&
      dom.active === layout &&
      dom.visible.length === 1 &&
      dom.visible[0] === expectedRoot,
    `start page to render the ${layout} layout exclusively`
  );
});

Then('the saved start page layout is {string}', async function (layout) {
  await waitForValue(
    () => this.call('newtabLayout'),
    (value) => value === layout,
    `newtabLayout setting to persist as ${layout}`
  );
});

Then('the Billboard lists {string} before {string}', async function (first, second) {
  const dom = await waitForValue(
    () => this.call('readBillboardSites'),
    (value) => value?.sites?.length >= 2,
    'Billboard frequent sites to render',
  );
  assert.ok(dom.sites.findIndex((site) => site.key === first) >= 0);
  assert.ok(dom.sites.findIndex((site) => site.key === second) >= 0);
  assert.ok(
    dom.sites.findIndex((site) => site.key === first) <
      dom.sites.findIndex((site) => site.key === second),
  );
  assert.equal(dom.sites[0].dismissLabel, `Hide ${dom.sites[0].label} from Billboard`);
});

Then('the Billboard uses full local titles and cached site icons', async function () {
  const dom = await waitForValue(
    () => this.call('readBillboardSites'),
    (value) => value?.sites?.length === 6 && value.sites.every((site) => site.hasIcon),
    'Billboard cached site icons to render',
  );
  assert.equal(dom.sites[0].label, 'YouTube – videos worth watching');
  assert.equal(dom.sites[1].label, 'CNET – technology news and reviews');
});

When('I hide {string} from the Billboard', async function (key) {
  assert.equal(await this.call('hideBillboardSite', key), true);
});

Then('{string} is absent from the Billboard', async function (key) {
  await waitForValue(
    () => this.call('readBillboardSites'),
    (value) => value?.sites?.every((site) => site.key !== key),
    `${key} to disappear from Billboard`,
  );
});

Then('the Billboard dismissal stays in local page storage without deleting history', async function () {
  const dom = await this.call('readBillboardSites');
  assert.deepEqual(dom.hidden, ['youtube.com']);
  assert.equal(await this.call('historyCount'), this.billboardHistoryCount);
});

Then('the Billboard backfills with {string}', async function (key) {
  const dom = await waitForValue(
    () => this.call('readBillboardSites'),
    (value) => value?.sites?.length === 6 && value.sites[0]?.key === key,
    `Billboard to backfill past the initial candidate page with ${key}`,
  );
  assert.ok(dom.sites.every((site) => !dom.hidden.includes(site.key)));
});

Then('all start-page templates use Inter instead of JetBrains Mono', async function () {
  const usage = await waitForValue(
    () => this.call('readStartPageFontUsage'),
    (value) => value?.page?.samples?.length === 13 && value?.mahjong?.samples?.length === 4,
    'the new-tab and embedded Mahjong documents to expose their computed fonts',
  );
  assert.deepEqual(usage.page.jetbrains, []);
  assert.deepEqual(usage.mahjong.jetbrains, []);
  for (const sample of [...usage.page.samples, ...usage.mahjong.samples]) {
    assert.match(sample.family, /Inter/, `${sample.selector} resolved to ${sample.family}`);
  }
});

Then('Inter start-page typography fits at desktop size boundaries', async function () {
  const originalBounds = await this.call('windowContentBounds');
  const originalLayout = await this.call('newtabLayout');
  const layouts = ['ledger', 'billboard', 'shelf', 'tally', 'mahjong'];
  const sizes = [
    { width: 1280, height: 800, label: 'default' },
    { width: 961, height: 700, label: 'above the stacked-layout breakpoint' },
    { width: 960, height: 700, label: 'at the stacked-layout breakpoint' },
    { width: 761, height: 600, label: 'above the footer-wrap breakpoint' },
    { width: 760, height: 600, label: 'at the footer-wrap breakpoint' },
    { width: 900, height: 585, label: 'above the short-window breakpoint' },
    { width: 900, height: 584, label: 'at the short-window breakpoint' },
    { width: 640, height: 480, label: 'minimum' },
  ];
  assert.ok(originalBounds, 'window content bounds should be available');

  try {
    for (const size of sizes) {
      await this.call('setWindowContentSize', size.width, size.height);
      await waitForValue(
        () => this.call('windowContentBounds'),
        (bounds) => bounds?.width === size.width && bounds?.height === size.height,
        `${size.label} desktop content bounds`,
      );
      for (const layout of layouts) {
        assert.equal(await this.call('setNewtabLayout', layout), layout);
        const fit = await waitForValue(
          () => this.call('readStartPageLayoutFit'),
          (value) => value?.page?.layout === layout &&
            value.page.viewportWidth === size.width &&
            (layout !== 'mahjong' || value.mahjong?.viewportWidth === size.width),
          `${layout} layout at the ${size.label} desktop size`,
        );
        for (const [surface, audit] of [
          ['new-tab', fit.page],
          ...(layout === 'mahjong' ? [['Mahjong', fit.mahjong]] : []),
        ]) {
          const context = `${surface} ${layout} at ${size.width}x${size.height}`;
          assert.ok(
            audit.scrollWidth <= audit.clientWidth + 1,
            `${context} scrolls horizontally: ${JSON.stringify(audit)}`,
          );
          assert.deepEqual(audit.horizontalText, [], `${context} has off-screen text`);
          assert.deepEqual(audit.unreachableText, [], `${context} has unreachable text`);
          assert.deepEqual(audit.clippedText, [], `${context} clips text unexpectedly`);
          assert.deepEqual(audit.surfaces, [], `${context} has an off-screen surface`);
        }
      }
    }
  } finally {
    await this.call('setNewtabLayout', originalLayout);
    await this.call('setWindowContentSize', originalBounds.width, originalBounds.height);
    await waitForValue(
      () => this.call('windowContentBounds'),
      (bounds) => bounds?.width === originalBounds.width && bounds?.height === originalBounds.height,
      'restored desktop content bounds',
    );
  }
});

Then('the embedded mahjong game is ready', async function () {
  await waitForValue(
    () => this.call('readMahjongEmbedDom'),
    (dom) =>
      dom?.url?.startsWith('blanc://mahjong/') &&
      dom.tileCount === MAHJONG_TILE_COUNTS[dom.layout] &&
      dom.freeTileCount >= 2 &&
      dom.tileHeight >= 46 &&
      dom.boardFrameHeight >= 400,
    'the embedded mahjong frame to render its active Daily layout at playable size'
  );
  const game = await this.call('readMahjongEmbedDom');
  assert.ok(game.boardCenterDeltaX <= 1, `board x center drifted ${game.boardCenterDeltaX}px`);
  assert.ok(game.dockLeft >= game.boardFrameLeft - 1, 'control rail should begin inside the board frame');
  assert.ok(game.dockRight <= game.boardFrameRight + 1, 'control rail should end inside the board frame');
  assert.ok(game.dockTop >= game.boardFrameTop - 1, 'control rail should begin inside the board frame');
  assert.ok(game.dockBottom <= game.boardFrameBottom + 1, 'control rail should end inside the board frame');
  assert.ok(
    Math.abs(game.dockButtonWidth - game.dockButtonHeight) <= 0.5,
    `dock control must be circular (${game.dockButtonWidth}px × ${game.dockButtonHeight}px)`
  );
  assert.ok(game.dockButtonWidth >= 63.5, `dock control is too small (${game.dockButtonWidth}px)`);
  assert.equal(game.dockButtonCount, 6, 'the dock exposes boards, records, undo, hint, shuffle, and sound');
  assert.ok(game.dockButtonGap >= 15.5, `dock controls are too close (${game.dockButtonGap}px)`);
  const completion = await this.call('readMahjongCompletionGeometry');
  assert.ok(completion, 'completion geometry should be measurable');
  assert.ok(completion.centerDeltaX <= 1, `completion x center drifted ${completion.centerDeltaX}px`);
  assert.ok(
    completion.centerDeltaY <= 1,
    `completion y center drifted ${completion.centerDeltaY}px: ${JSON.stringify(completion)}`
  );
  assert.ok(completion.card.left >= completion.viewport.left - 1);
  assert.ok(completion.card.top >= completion.viewport.top - 1);
  assert.ok(completion.card.right <= completion.viewport.right + 1);
  assert.ok(completion.card.bottom <= completion.viewport.bottom + 1);
  assert.ok(
    completion.scrollHeight <= completion.clientHeight + 1,
    `completion card unexpectedly scrolls (${completion.scrollHeight}px > ${completion.clientHeight}px)`
  );
});

Then('the six-control Mahjong rail fits its table at every desktop breakpoint', async function () {
  const original = await this.call('windowContentBounds');
  assert.ok(original, 'window content bounds should be available');
  const sizes = [
    { width: 1000, height: 611, minButton: 53.5, label: 'rail breakpoint (compact fallback)' },
    { width: 1000, height: 720, minButton: 53.5, label: 'top of the compact fallback' },
    { width: 1000, height: 721, minButton: 63.5, label: 'full-size rail resumes' },
    { width: 1280, height: 800, minButton: 63.5, label: 'default' },
  ];
  try {
    for (const size of sizes) {
      await this.call('setWindowContentSize', size.width, size.height);
      await waitForValue(
        () => this.call('windowContentBounds'),
        (bounds) => bounds?.width === size.width && bounds?.height === size.height,
        `${size.label} desktop content bounds`
      );
      const game = await waitForValue(
        () => this.call('readMahjongEmbedDom'),
        (value) => value?.viewportWidth === size.width && value.dockButtonCount === 6,
        `six-control Mahjong rail at the ${size.label} size`
      );
      const context = `rail at ${size.width}x${size.height}`;
      assert.ok(game.dockTop >= game.boardFrameTop - 1, `${context} starts above the table`);
      assert.ok(game.dockBottom <= game.boardFrameBottom + 1, `${context} ends below the table`);
      assert.ok(game.dockLeft >= game.boardFrameLeft - 1, `${context} starts left of the table`);
      assert.ok(Math.abs(game.dockButtonWidth - game.dockButtonHeight) <= 0.5, `${context} controls must stay circular`);
      assert.ok(game.dockButtonWidth >= size.minButton, `${context} control is too small (${game.dockButtonWidth}px)`);
    }
  } finally {
    await this.call('setWindowContentSize', original.width, original.height);
    await waitForValue(
      () => this.call('windowContentBounds'),
      (bounds) => bounds?.width === original.width && bounds?.height === original.height,
      'restored desktop content bounds'
    );
  }
});

Then('the Mahjong records sheet stays contained at the default, minimum, and zoomed desktop sizes', async function () {
  const original = await this.call('windowContentBounds');
  assert.ok(original, 'window content bounds should be available');
  const originalZoom = await this.call('newtabZoomFactor');
  assert.ok(originalZoom, 'zoom factor should be readable');
  const cases = [
    { width: 1280, height: 800, zoom: 1 },
    { width: 640, height: 480, zoom: 1 },
    { width: 1280, height: 800, zoom: 1.5 },
    { width: 640, height: 480, zoom: 1.25 },
  ];
  try {
    for (const size of cases) {
      await this.call('setWindowContentSize', size.width, size.height);
      await waitForValue(
        () => this.call('windowContentBounds'),
        (bounds) => bounds?.width === size.width && bounds?.height === size.height,
        `${size.width}x${size.height} desktop content bounds`
      );
      assert.equal(await this.call('setNewtabZoomFactor', size.zoom), size.zoom);
      const expectedViewport = Math.round(size.width / size.zoom);
      const records = await waitForValue(
        () => this.call('readMahjongRecordsGeometry'),
        (value) => value && Math.abs(value.viewportWidth - expectedViewport) <= 1,
        `Mahjong records sheet at ${size.width}x${size.height} zoom ${size.zoom}`
      );
      const context = `records sheet at ${size.width}x${size.height} zoom ${size.zoom}`;
      assert.equal(records.rowCount, 8, `${context} lists every layout`);
      assert.ok(records.scrollWidth <= records.clientWidth + 1, `${context} scrolls horizontally`);
      assert.equal(records.overflowY, 'auto', `${context} must scroll vertically when needed`);
      assert.ok(records.card.left >= records.viewport.left - 1, `${context} overflows left`);
      assert.ok(records.card.top >= records.viewport.top - 1, `${context} overflows top`);
      assert.ok(records.card.right <= records.viewport.right + 1, `${context} overflows right`);
      assert.ok(records.card.bottom <= records.viewport.bottom + 1, `${context} overflows bottom`);
      assert.equal(records.focusReturned, true, `${context} must return focus to the records control`);
    }
  } finally {
    await this.call('setNewtabZoomFactor', originalZoom);
    await this.call('setWindowContentSize', original.width, original.height);
    await waitForValue(
      () => this.call('windowContentBounds'),
      (bounds) => bounds?.width === original.width && bounds?.height === original.height,
      'restored desktop content bounds'
    );
  }
});

Then('rapid Undo cancels pending Mahjong feedback', async function () {
  const result = await this.call('rapidUndoMahjongMatch');
  assert.ok(result?.matched, 'a free matching pair should be available');
  assert.equal(result.score, '0');
  assert.equal(result.live, 'Last move undone.');
  assert.equal(result.transientCount, 0, 'stale motion elements should be removed');
  assert.equal(result.comboFxClass, 'mj-combo-fx');
});

Then('the Mahjong completion dialog remains usable at the minimum desktop size', async function () {
  const original = await this.call('windowContentBounds');
  assert.ok(original, 'window content bounds should be available');
  try {
    await this.call('setWindowContentSize', 640, 480);
    await waitForValue(
      () => this.call('windowContentBounds'),
      (bounds) => bounds?.width === 640 && bounds?.height === 480,
      'minimum desktop content bounds'
    );
    const completion = await waitForValue(
      () => this.call('readMahjongCompletionGeometry'),
      (value) => value?.viewportWidth === 640 && value.actionVisibleAfterScroll,
      'scrollable compact Mahjong completion dialog'
    );
    assert.equal(completion.overflowY, 'auto');
    assert.ok(
      completion.scrollHeight > completion.clientHeight,
      'the compact regression should exercise the card scroll path'
    );
    assert.ok(completion.scrollTop > 0, 'the final action should be reachable by scrolling');
    assert.equal(completion.actionVisibleAfterScroll, true);
    assert.ok(completion.card.left >= completion.viewport.left - 1);
    assert.ok(completion.card.top >= completion.viewport.top - 1);
    assert.ok(completion.card.right <= completion.viewport.right + 1);
    assert.ok(completion.card.bottom <= completion.viewport.bottom + 1);
  } finally {
    await this.call('setWindowContentSize', original.width, original.height);
    await waitForValue(
      () => this.call('windowContentBounds'),
      (bounds) => bounds?.width === original.width && bounds?.height === original.height,
      'restored desktop content bounds'
    );
  }
});

When('I make a move in embedded Mahjong', async function () {
  assert.equal(await this.call('clickMahjongFreeTile'), true);
  const dom = await waitForValue(
    () => this.call('readMahjongEmbedDom'),
    (value) => typeof value?.timer === 'string',
    'embedded Mahjong to start its timer'
  );
  assert.equal(typeof dom.timer, 'string');
});

Then('the hidden embedded Mahjong timer stays paused', async function () {
  const before = await this.call('readMahjongEmbedDom');
  await new Promise((resolve) => setTimeout(resolve, 1_250));
  const after = await this.call('readMahjongEmbedDom');
  assert.equal(after?.timer, before?.timer);
});
