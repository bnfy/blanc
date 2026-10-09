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

Given('eight favorites fill the Start Page', async function () {
  for (let index = 0; index < 8; index += 1) {
    await this.call(
      'seedFavorite',
      `https://favorite-${index}.example/`,
      `Favorite ${index + 1}`,
    );
  }
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
  assert.equal(dom.sites[0].dismissLabel, `Hide ${dom.sites[0].title} from Billboard`);
});

Then('the Billboard uses short site names, full-title tooltips and cached site icons', async function () {
  const dom = await waitForValue(
    () => this.call('readBillboardSites'),
    (value) => value?.sites?.length === 6 && value.sites.every((site) => site.hasIcon),
    'Billboard cached site icons to render',
  );
  assert.equal(dom.sites[0].label, 'YouTube');
  assert.equal(dom.sites[0].title, 'YouTube – videos worth watching');
  assert.equal(dom.sites[0].ariaLabel, 'Open YouTube – videos worth watching');
  assert.equal(dom.sites[1].label, 'CNET');
  assert.equal(dom.sites[1].title, 'CNET – technology news and reviews');
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

Then('the start page uses Newsreader for the Billboard clock and invitation headings', async function () {
  const usage = await waitForValue(
    () => this.call('readStartPageFontUsage'),
    (value) => value?.page?.samples?.length === 12,
    'the new-tab document to expose its computed fonts',
  );
  assert.deepEqual(usage.page.jetbrains, []);
  assert.equal(usage.page.newsreaderLoaded, true);
  assert.equal(usage.page.newsreader.length, 9);
  assert.deepEqual(usage.page.newsreaderOutsideApproved, []);
  for (const sample of usage.page.newsreader) {
    assert.match(sample.family, /Newsreader Condensed/, `${sample.selector} resolved to ${sample.family}`);
  }
  for (const sample of usage.page.samples) {
    const expected = sample.selector === '.bb-clock' ? /Newsreader Condensed/ : /Inter/;
    assert.match(sample.family, expected, `${sample.selector} resolved to ${sample.family}`);
  }
});

Then('the start-page typography fits at desktop size boundaries', async function () {
  const originalBounds = await this.call('windowContentBounds');
  const originalLayout = await this.call('newtabLayout');
  const layouts = ['ledger', 'billboard', 'shelf', 'tally'];
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
            value.page.viewportWidth === size.width,
          `${layout} layout at the ${size.label} desktop size`,
        );
        for (const [surface, audit] of [['new-tab', fit.page]]) {
          const context = `${surface} ${layout} at ${size.width}x${size.height}`;
          assert.ok(
            audit.scrollWidth <= audit.clientWidth + 1,
            `${context} scrolls horizontally: ${JSON.stringify(audit)}`,
          );
          assert.deepEqual(audit.horizontalText, [], `${context} has off-screen text`);
          assert.deepEqual(audit.unreachableText, [], `${context} has unreachable text`);
          assert.deepEqual(audit.clippedText, [], `${context} clips text unexpectedly`);
          assert.deepEqual(audit.surfaces, [], `${context} has an off-screen surface`);
          assert.deepEqual(audit.footerOverlaps, [], `${context} is obscured by the footer`);
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

Then('the standalone mahjong game is ready', async function () {
  await waitForValue(
    () => this.call('readMahjongDom'),
    (dom) =>
      dom?.url?.startsWith('blanc://mahjong/') &&
      dom.tileCount === MAHJONG_TILE_COUNTS[dom.layout] &&
      dom.freeTileCount >= 2 &&
      dom.tileHeight >= 46 &&
      dom.boardFrameHeight >= 400,
    'the standalone Mahjong tab to render its active Daily layout at playable size'
  );
  const game = await this.call('readMahjongDom');
  assert.deepEqual(game.newsreader, [], 'Mahjong must not inherit the invitation voice');
  for (const sample of game.fontSamples) {
    assert.match(sample.family, /Inter/, `${sample.selector} resolved to ${sample.family}`);
  }
  assert.match(game.tileFaceFamily, /JetBrains Mono/, 'Mahjong tile faces keep JetBrains Mono');
  assert.ok(game.boardCenterDeltaX <= 1, `board x center drifted ${game.boardCenterDeltaX}px`);
  assert.ok(game.dockLeft >= game.boardFrameLeft - 1, 'control rail should begin inside the board frame');
  assert.ok(game.dockRight <= game.boardFrameRight + 1, 'control rail should end inside the board frame');
  assert.ok(game.dockTop >= game.boardFrameTop - 1, 'control rail should begin inside the board frame');
  assert.ok(game.dockBottom <= game.boardFrameBottom + 1, 'control rail should end inside the board frame');
  assert.ok(
    Math.abs(game.dockButtonWidth - game.dockButtonHeight) <= 0.5,
    `dock control must be circular (${game.dockButtonWidth}px × ${game.dockButtonHeight}px)`
  );
  assert.ok(game.dockButtonWidth >= 55.5, `dock control is too small (${game.dockButtonWidth}px)`);
  assert.equal(game.dockButtonCount, 6, 'the dock exposes boards, records, undo, hint, shuffle, and sound');
  assert.ok(game.dockButtonGap >= 13.5, `dock controls are too close (${game.dockButtonGap}px)`);
  const completion = await this.call('readMahjongCompletionGeometry');
  assert.ok(completion, 'completion geometry should be measurable');
  assert.ok(
    completion.centerDeltaX <= 1,
    `completion x center drifted ${completion.centerDeltaX}px: ${JSON.stringify(completion)}`
  );
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

// The rail's media queries measure the standalone game's viewport.
function expectedRailTier(frameHeight) {
  if (frameHeight >= 721) return { button: 64, gap: 16, label: 'full 64/16' };
  if (frameHeight >= 660) return { button: 56, gap: 14, label: '56/14' };
  if (frameHeight >= 611) return { button: 52, gap: 10, label: '52/10' };
  return null; // below the rail: the dock is the horizontal bar
}

Then('the six-control Mahjong rail fits its table at every desktop breakpoint', async function () {
  const original = await this.call('windowContentBounds');
  assert.ok(original, 'window content bounds should be available');
  // Blanc's 68px Island strip leaves the game viewport at window height - 68.
  const sizes = [678, 679, 727, 728, 788, 789, 800].map((height) => ({ width: 1280, height }));
  const seenTiers = new Set();
  try {
    for (const size of sizes) {
      await this.call('setWindowContentSize', size.width, size.height);
      await waitForValue(
        () => this.call('windowContentBounds'),
        (bounds) => bounds?.width === size.width && bounds?.height === size.height,
        `${size.width}x${size.height} desktop content bounds`
      );
      const game = await waitForValue(
        () => this.call('readMahjongDom'),
        (value) => value?.viewportWidth === size.width && value.dockButtonCount === 6,
        `six-control Mahjong dock at ${size.width}x${size.height}`
      );
      const tier = expectedRailTier(game.viewportHeight);
      const context = `dock at ${size.width}x${size.height} (viewport ${game.viewportHeight}px, ${tier ? tier.label : 'bar'})`;
      assert.equal(game.dockButtonCount, 6, `${context} must expose six controls`);
      if (!tier) {
        assert.ok(game.dockTop >= game.boardFrameBottom - 1, `${context} should sit below the table as a bar`);
        continue;
      }
      seenTiers.add(tier.label);
      assert.ok(game.dockTop >= game.boardFrameTop - 1, `${context} starts above the table (dockTop ${game.dockTop}, frameTop ${game.boardFrameTop})`);
      assert.ok(game.dockBottom <= game.boardFrameBottom + 1, `${context} ends below the table (dockBottom ${game.dockBottom}, frameBottom ${game.boardFrameBottom})`);
      assert.ok(game.dockLeft >= game.boardFrameLeft - 1, `${context} starts left of the table`);
      assert.ok(Math.abs(game.dockButtonWidth - game.dockButtonHeight) <= 0.5, `${context} controls must stay circular`);
      assert.ok(game.dockButtonWidth >= tier.button - 0.5, `${context} control is too small (${game.dockButtonWidth}px)`);
      assert.ok(game.dockButtonGap >= tier.gap - 0.5, `${context} controls are too close (${game.dockButtonGap}px)`);
    }
    assert.deepEqual([...seenTiers].sort(), ['52/10', '56/14', 'full 64/16'], 'every rail tier must be exercised');
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
  const originalZoom = await this.call('activeTabZoomFactor');
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
      assert.equal(await this.call('setActiveTabZoomFactor', size.zoom), size.zoom);
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
    await this.call('setActiveTabZoomFactor', originalZoom);
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

Then('Mahjong correctness flows pass in the renderer', async function () {
  const result = await this.call('auditMahjongCorrectness');
  assert.ok(result && !result.error, result?.error || 'Mahjong correctness audit should run');
  assert.ok(result.classicHintCount > 1, 'Classic should expose multiple hint pairs');
  assert.equal(result.firstHint.length, 2);
  assert.equal(result.secondHint.length, 2);
  assert.notDeepEqual(result.secondHint, result.firstHint, 'repeated Classic hints should cycle');
  assert.deepEqual(result.matchUndo.tray, [result.matchUndo.parked]);
  assert.equal(result.matchUndo.parkedRemoved, true, 'the original tile should remain parked');
  assert.equal(result.matchUndo.mateRemoved, false, 'the matching pick should return to the board');
  assert.deepEqual(result.safeHint.highlighted, [], 'a fourth unmatched pick must not be hinted');
  assert.match(result.safeHint.live, /rack needs a match.*Undo or Shuffle/i);
  assert.deepEqual(result.rescueEscape, { hidden: true, status: 'rescue', focus: 'mjUndo' });
  assert.deepEqual(result.rescueUndo, { shuffled: true, visible: true, status: 'rescue', traySize: 4 });
  assert.deepEqual(result.burstControls, { autoVisible: true, zenVisible: false });
  assert.deepEqual(result.classicControls, { autoVisible: false, zenVisible: true });
  assert.deepEqual(result.zenTiming, {
    elapsedMs: 0,
    timerDisplay: 'none',
    scoreDisplay: 'none',
    badge: 'zen',
  });
  assert.deepEqual(result.zenCompletion, {
    title: 'A quiet finish.',
    rules: 'Classic · Zen',
    notice: 'This Zen game was not added to Records.',
    resultHidden: true,
    eventDelta: 0,
  });
  assert.equal(result.zenReset, false, 'Zen must reset off every time Boards opens');
  assert.deepEqual(result.manualGame, {
    burstRules: 'manual',
    scoringRevision: 3,
    badge: 'manual',
  });
  assert.equal(result.manualRemembered, true, 'the device should remember Manual Burst');
  assert.deepEqual(
    [...new Set(result.burstLabels)],
    ['Auto', 'Manual'],
    'each Burst record cell should label both rulesets'
  );
});

Then('a copied Mahjong deal opens identically in another managed tab', async function () {
  const source = await this.call('readMahjongDealState');
  assert.ok(source, 'the source Mahjong deal should be readable');
  const copied = await this.call('copyMahjongDealFromBoards');
  assert.deepEqual(copied, { live: 'Deal link copied.', boardsOpen: true });
  const link = await this.call('readClipboardText');
  assert.match(link, /^blanc:\/\/mahjong\/\?deal=[a-z]+-\d+&mode=(?:classic|burst)&(?:zen|auto)=(?:on|off)$/);
  assert.equal(link.includes('game='), false);
  assert.equal(link.includes('private='), false);

  await this.call('openTab', link);
  const shared = await waitForValue(
    () => this.call('readMahjongDealState'),
    (value) => value?.kinds?.length === source.kinds.length,
    'shared Mahjong deal in a second managed tab'
  );
  assert.deepEqual(shared, source);
  const { tabs } = await this.call('state');
  assert.equal(
    tabs.filter((tab) => tab.url.startsWith('blanc://mahjong/')).length >= 2,
    true,
    'both managed Mahjong tabs should remain open'
  );
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
    if (completion.scrollHeight > completion.clientHeight) {
      assert.ok(completion.scrollTop > 0, 'the final action should be reachable by scrolling');
    } else {
      assert.equal(completion.actionInitiallyVisible, true, 'the final action should fit without scrolling');
    }
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

When('I launch Mahjong from the start-page footer', async function () {
  const before = await waitForValue(
    () => this.state(),
    (state) => state.tabs.find((tab) => tab.id === state.activeTabId)?.loadedUrl?.startsWith('blanc://newtab/'),
    'loaded start page before launching Mahjong',
  );
  const source = before.tabs.find((tab) => tab.id === before.activeTabId);
  assert.ok(source?.loadedUrl?.startsWith('blanc://newtab/'));
  const footer = await waitForValue(
    () => this.call('readMahjongFooterLink'),
    (value) => value?.switcherCount === 4 && value.frameCount === 0,
    'four layout choices and a separate Mahjong footer link',
  );
  assert.equal(footer.href, source.private ? 'blanc://mahjong/?private=1' : 'blanc://mahjong/');
  assert.equal(footer.target, '_blank');
  this.mahjongSource = { id: source.id, layout: footer.layout, private: source.private, count: before.tabs.length };
  assert.equal(await this.call('clickMahjongFooterLink'), true);
  await this.waitForState((state) => {
    const active = state.tabs.find((tab) => tab.id === state.activeTabId);
    return state.tabs.length === before.tabs.length + 1 && active?.loadedUrl?.startsWith('blanc://mahjong/');
  });
});

Then('the original start page remains on {string} in a separate tab', async function (layout) {
  const state = await this.state();
  const source = state.tabs.find((tab) => tab.id === this.mahjongSource.id);
  assert.ok(source?.loadedUrl?.startsWith('blanc://newtab/'));
  assert.equal(this.mahjongSource.layout, layout);
  assert.equal(await this.call('newtabLayout'), layout);
  const gameId = state.activeTabId;
  await this.call('activateTab', source.id);
  const dom = await waitForValue(() => this.call('readNewtabLayoutDom'), (value) => value?.layout === layout, 'preserved start-page layout');
  assert.equal(dom.active, layout);
  await this.call('activateTab', gameId);
});

Then('each of the four layout footers launches Mahjong in a new tab', async function () {
  for (const layout of ['ledger', 'billboard', 'shelf', 'tally']) {
    assert.equal(await this.call('setNewtabLayout', layout), layout);
    await openNewTab(this);
    const before = await this.state();
    const sourceId = before.activeTabId;
    const footer = await waitForValue(() => this.call('readMahjongFooterLink'), (value) => value?.layout === layout, `${layout} footer`);
    assert.equal(footer.switcherCount, 4);
    assert.equal(footer.frameCount, 0);
    assert.equal(await this.call('clickMahjongFooterLink'), true);
    const after = await this.waitForState((state) => state.tabs.length === before.tabs.length + 1 &&
      state.tabs.find((tab) => tab.id === state.activeTabId)?.loadedUrl?.startsWith('blanc://mahjong/'));
    assert.ok(after.tabs.find((tab) => tab.id === sourceId)?.loadedUrl?.startsWith('blanc://newtab/'));
    assert.equal(await this.call('newtabLayout'), layout);
  }
});

Given('a private start page is open', async function () {
  const id = await this.call('openTab', 'blanc://newtab/?private=1', { private: true });
  await this.waitForState((state) => state.activeTabId === id &&
    state.tabs.find((tab) => tab.id === id)?.loadedUrl?.startsWith('blanc://newtab/'));
});

Then('Mahjong is a private managed tab', async function () {
  const state = await this.state();
  const game = state.tabs.find((tab) => tab.id === state.activeTabId);
  assert.equal(game?.private, true);
  assert.equal(game?.sessionKind, 'private');
  assert.ok(game?.loadedUrl?.startsWith('blanc://mahjong/?private=1'));
  assert.equal(state.tabs.find((tab) => tab.id === this.mahjongSource.id)?.private, true);
});

const intersects = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;

Then('no start-page layout is covered by its checklist or footer at 1440x840 or 820x840', async function () {
  const original = await this.call('windowContentBounds');
  const originalLayout = await this.call('newtabLayout');
  try {
    for (const size of [{ width: 1440, height: 840 }, { width: 820, height: 840 }]) {
      await this.call('setWindowContentSize', size.width, size.height);
      await waitForValue(
        () => this.call('windowContentBounds'),
        (bounds) => bounds?.width === size.width && bounds?.height === size.height,
        `${size.width}x${size.height} content bounds`,
      );
      for (const layout of ['ledger', 'billboard', 'shelf', 'tally']) {
        assert.equal(await this.call('setNewtabLayout', layout), layout);
        const frame = await waitForValue(
          () => this.call('readStartFrameGeometry'),
          (value) => value?.layout === layout && value.viewportWidth === size.width && value.shell && value.content.length > 0,
          `${layout} frame at ${size.width}x${size.height}`,
        );
        const context = `${layout} at ${size.width}x${size.height}`;
        // The checklist is a pill inside the fixed footer, so the footer check
        // below covers it; it must never spill outside that band.
        assert.ok(frame.shell.top >= frame.footer.top - 1 && frame.shell.bottom <= frame.footer.bottom + 1,
          `${context}: checklist ${JSON.stringify(frame.shell)} leaves the footer ${JSON.stringify(frame.footer)}`);
        for (const entry of frame.content) {
          const atBottom = { ...entry.rect, top: entry.rect.top - frame.maxScrollY, bottom: entry.rect.bottom - frame.maxScrollY };
          assert.ok(!intersects(frame.footer, atBottom),
            `${context}: footer covers ${entry.selector} when scrolled to the end`);
        }
      }
    }
  } finally {
    await this.call('setNewtabLayout', originalLayout);
    await this.call('setWindowContentSize', original.width, original.height);
  }
});

const PATRON_SNOOZE_MS = 90 * 24 * 60 * 60 * 1000;

Given('the Patron upgrade has never been closed', async function () {
  assert.equal(await this.call('setPatronCalloutDismissedAt', 0), 0);
});

Then('every start-page layout shows the Patron upgrade on the footer\'s left', async function () {
  for (const layout of ['ledger', 'billboard', 'shelf', 'tally']) {
    assert.equal(await this.call('setNewtabLayout', layout), layout);
    const frame = await waitForValue(
      () => this.call('readStartFrameGeometry'),
      (value) => value?.layout === layout && value.patronVisible === true,
      `${layout} frame with the Patron upgrade`,
    );
    assert.equal(frame.patronInLayout, false, `${layout} carries no Patron chip of its own`);
    assert.equal(frame.patronInFooterLeft, true, `${layout} shows the Patron upgrade on the footer's left`);
    assert.ok(frame.patron.top >= frame.footer.top - 1 && frame.patron.bottom <= frame.footer.bottom + 1,
      `${layout}: Patron pill ${JSON.stringify(frame.patron)} leaves the footer ${JSON.stringify(frame.footer)}`);
  }
});

When('I close the Patron upgrade', async function () {
  const before = Date.now();
  assert.equal(await this.call('clickPatronCalloutClose'), true, 'the pill hides as soon as it is closed');
  const closedAt = await waitForValue(
    () => this.call('patronCalloutDismissedAt'),
    (value) => value >= before,
    'the close time to be saved',
  );
  assert.ok(closedAt <= Date.now());
});

Then('the Patron upgrade stays hidden on a new tab', async function () {
  await this.call('newTab');
  const frame = await waitForValue(
    () => this.call('readStartFrameGeometry'),
    (value) => value?.layout && value.content.length > 0,
    'a new start page',
  );
  assert.equal(frame.patronVisible, false);
});

When('{int} days pass since the Patron upgrade was closed', async function (days) {
  assert.equal(days * 24 * 60 * 60 * 1000, PATRON_SNOOZE_MS, 'the scenario names the shipped snooze');
  const longAgo = Date.now() - PATRON_SNOOZE_MS - 60_000;
  assert.equal(await this.call('setPatronCalloutDismissedAt', longAgo), longAgo);
});

Then('no start-page layout shows the Patron upgrade or a blocked count', async function () {
  for (const layout of ['ledger', 'billboard', 'shelf', 'tally']) {
    assert.equal(await this.call('setNewtabLayout', layout), layout);
    const frame = await waitForValue(
      () => this.call('readStartFrameGeometry'),
      (value) => value?.layout === layout && value.private === true,
      `private ${layout} frame`,
    );
    assert.equal(frame.patronVisible, false, `private ${layout} hides Patron`);
    const selectors = frame.content.map((entry) => String(entry.selector));
    assert.ok(!selectors.some((s) => /tally-chart|tally-caption/.test(s)), `private ${layout} hides the Tally data column`);
    if (layout === 'shelf') {
      assert.equal(await this.call('readStartBlockedCard'), false, 'private Shelf hides its blocked card');
    }
  }
});

Given('a profile with no favorites', async function () {
  assert.deepEqual(await this.call('bookmarkUrls'), []);
});

Then('Ledger, Shelf and Tally each show one empty Favorites hint and Billboard shows none', async function () {
  for (const [layout, expected] of [['ledger', 1], ['shelf', 1], ['tally', 1], ['billboard', 0]]) {
    assert.equal(await this.call('setNewtabLayout', layout), layout);
    const frame = await waitForValue(
      () => this.call('readStartFrameGeometry'),
      (value) => value?.layout === layout,
      `${layout} frame`,
    );
    assert.equal(frame.emptyHints, expected, `${layout} empty hints`);
  }
});

When('I open Customize on the start page', async function () {
  assert.equal(await this.call('openStartCustomize'), true);
});

Then('Customize stays open with {string} pressed', async function (layout) {
  const state = await waitForValue(
    () => this.call('readStartCustomize'),
    (value) => value?.open === true && value.pressed.length === 1,
    'Customize open with one pressed layout',
  );
  assert.deepEqual(state.pressed, [layout]);
  assert.equal(state.expanded, 'true');
});

When('I press Escape on the start page', async function () {
  assert.equal(await this.call('pressStartPageKey', 'Escape'), true);
});

Then('Customize is closed and its button has focus', async function () {
  const state = await waitForValue(
    () => this.call('readStartCustomize'),
    // The toggle event that mirrors aria-expanded is queued after the close.
    (value) => value?.open === false && value.expanded === 'false',
    'Customize to close and its button to report collapsed',
  );
  assert.equal(state.focusedId, 'customizeButton');
});

Then('the Billboard shows one row of single-line site names at 1440x840 and 820x840', async function () {
  const original = await this.call('windowContentBounds');
  try {
    for (const size of [{ width: 1440, height: 840 }, { width: 820, height: 840 }]) {
      await this.call('setWindowContentSize', size.width, size.height);
      await waitForValue(
        () => this.call('windowContentBounds'),
        (bounds) => bounds?.width === size.width && bounds?.height === size.height,
        `${size.width}x${size.height} content bounds`,
      );
      const dom = await waitForValue(
        () => this.call('readBillboardSites'),
        (value) => value?.sites?.length === 6,
        `Billboard sites at ${size.width}x${size.height}`,
      );
      const shown = dom.sites.filter((site) => site.visible);
      assert.equal(shown.length, 6, `${size.width}: six sites show`);
      assert.equal(new Set(shown.map((site) => site.top)).size, 1, `${size.width}: one row ${JSON.stringify(shown.map((s) => s.top))}`);
      assert.ok(shown.every((site) => site.lines === 1), `${size.width}: single-line labels ${JSON.stringify(shown.map((s) => s.lines))}`);
    }
  } finally {
    await this.call('setWindowContentSize', original.width, original.height);
  }
});

When(/^I seed (\d+) (?:more )?favorites and open a new tab$/, async function (count) {
  const existing = (await this.call('bookmarkUrls')).length;
  for (let index = existing; index < existing + Number(count); index += 1) {
    await this.call('seedFavorite', `https://shelf-${index}.example/`, `Shelf ${index + 1}`);
  }
  await this.call('newTab');
  await this.waitForState((state) => state.tabs.find((tab) => tab.id === state.activeTabId)?.loadedUrl?.startsWith('blanc://newtab'));
});

Then('Shelf shows {int} columns with full rows of tiles and cards', async function (columns) {
  const shelf = await waitForValue(
    () => this.call('readShelfGeometry'),
    (value) => value?.columns === String(columns) && value.tiles.length > 0 && value.groups && value.blocked,
    `Shelf with ${columns} columns`,
  );
  const lefts = [...new Set(shelf.tiles.map((tile) => tile.left))].sort((a, b) => a - b);
  const rights = [...new Set(shelf.tiles.map((tile) => tile.right))].sort((a, b) => a - b);
  assert.equal(lefts.length, columns, `tiles use ${columns} columns: ${JSON.stringify(lefts)}`);
  const rows = new Map();
  for (const tile of shelf.tiles) rows.set(tile.top, (rows.get(tile.top) ?? 0) + 1);
  assert.ok([...rows.values()].every((n) => n === columns), `every tile row is full: ${JSON.stringify([...rows])}`);
  assert.equal(shelf.groups.left, lefts[0], 'the groups card starts at the first column');
  assert.equal(shelf.blocked.right, rights[rights.length - 1], 'the blocked card ends at the last column');
  assert.equal(shelf.groups.top, shelf.blocked.top, 'both cards share one row');
});

async function tallyAt(world, width, height) {
  await world.call('setWindowContentSize', width, height);
  await waitForValue(
    () => world.call('windowContentBounds'),
    (bounds) => bounds?.width === width && bounds?.height === height,
    `${width}x${height} content bounds`,
  );
  return waitForValue(
    () => world.call('readTallyGeometry'),
    (value) => value?.viewportWidth === width && value.left && value.right,
    `Tally at ${width}x${height}`,
  );
}

Then('Tally shows two equal, top-aligned columns centered at 1440x840', async function () {
  this.tallyOriginalBounds = await this.call('windowContentBounds');
  const tally = await tallyAt(this, 1440, 840);
  assert.ok(Math.abs(tally.left.width - tally.right.width) <= 1, `equal columns: ${tally.left.width} vs ${tally.right.width}`);
  assert.equal(tally.left.top, tally.right.top, 'tops aligned');
  const leftGap = tally.left.left - tally.content.left;
  const rightGap = tally.content.right - tally.right.right;
  assert.ok(Math.abs(leftGap - rightGap) <= 2, `centered: ${leftGap} vs ${rightGap}`);
});

Then('Tally stacks the data above the list at 820x840', async function () {
  try {
    const tally = await tallyAt(this, 820, 840);
    assert.ok(tally.right.bottom <= tally.left.top, `data first: right ${JSON.stringify(tally.right)} left ${JSON.stringify(tally.left)}`);
  } finally {
    const original = this.tallyOriginalBounds;
    if (original) await this.call('setWindowContentSize', original.width, original.height);
  }
});

Then('the Billboard content is centered between the window top and the footer at 1280x800, 900x900, 700x1000 and 1440x600', async function () {
  const original = await this.call('windowContentBounds');
  try {
    for (const [width, height] of [[1280, 800], [900, 900], [700, 1000], [1440, 600]]) {
      await this.call('setWindowContentSize', width, height);
      // Settle on the renderer's own viewport and on two equal reads, so a
      // resize or font swap still in flight cannot pass or fail the check.
      let previous = null;
      const box = await waitForValue(
        async () => {
          const next = await this.call('readBillboardVerticalBox');
          const stable = previous && JSON.stringify(previous) === JSON.stringify(next);
          previous = next;
          return stable ? next : null;
        },
        (value) => value?.layout === 'billboard' && value.viewportWidth === width,
        `Billboard at ${width}x${height}`,
      );
      const context = `${width}x${height}: ${JSON.stringify(box)}`;
      assert.ok(box.contentTop >= box.headerBottom, `content slid under the brand row at ${context}`);
      if (box.contentTop > box.headerBottom + 1) {
        assert.ok(Math.abs(box.above - box.below) <= 1,
          `above ${box.above}px vs below ${box.below}px at ${context}`);
      }
    }
  } finally {
    await this.call('setWindowContentSize', original.width, original.height);
  }
});
