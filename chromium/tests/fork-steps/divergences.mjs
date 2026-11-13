// Shipping steps the fork replaces under an owner-approved divergence (spec
// §9), keyed by shipping's exact step text. Each keeps what the divergence
// leaves true and names what it changes; every other step stays shipping's.
import assert from 'node:assert/strict';
import {LAYOUT_WIDGETS, FAVORITES_WIDGET_LIMIT} from '../lib/start-widgets.mjs';

const tabDom = (world, id, expression) => world.call('executeTab', id, expression);

export const DIVERGENCES = new Map([
  // V22 (owner, 2026-11-05), over a split too (F53-29, 2026-11-12): the card's
  // frame and the split's corner tabs are the Island's, above the pages, and
  // the Glance page is a view between the split's pages and the Island, so
  // shipping's view stacking has nothing to read. Same picture: the split is
  // unchanged and laid out, the Glance page shows inside the card above both
  // panes, and the Island cuts its split drawing away under the card.
  ['the ordinary tab floats in Glance over both split panes', {divergence: 'V22', async run() {
    const state = await this.state();
    assert.equal(state.activeTabId, this.splitA);
    assert.deepEqual(state.splits.map((s) => s.tabIds), [[this.splitA, this.splitB]], 'the split is unchanged');
    const layout = await this.waitFor(() => this.call('splitLayout'), (l) => l?.panes?.length === 2, 'the split to stay laid out', 5000);
    assert.deepEqual(layout.panes.map((p) => p.tabId), [this.splitA, this.splitB]);
    await this.waitFor(() => this.call('glancePageViewVisible'), Boolean, 'the Glance page to be visible', 5000);
    const card = await this.waitFor(() => this.call('getGlanceCard'), (c) => c?.cardViewVisible === true, 'the Glance card to show', 5000);
    const attached = await this.call('attachedTabViewIds');
    for (const id of [this.splitA, this.splitB, this.ordinaryId]) assert.ok(attached.includes(id), `${id} attached: ${attached}`);
    const stack = (await this.snapshot()).glanceStack;
    assert.ok(stack && stack.panes >= 0 && stack.panes < stack.glance && stack.glance < stack.island,
      `split pages < Glance page < Island: ${JSON.stringify(stack)}`);
    const cut = await this.hostEval(`(() => { const c = window.BlancPrototypeHost.glanceState().layout?.card.chrome;
      const clip = document.getElementById('splitHeaders').style.clipPath;
      // The browser writes the path back in its own form; compare its numbers.
      const n = (clip.match(/-?\\d+(\\.\\d+)?/g) ?? []).map(Number);
      return !!c && /path\\(/.test(clip) && [c.x, c.y, c.width, c.height].every((v) => n.includes(v)); })()`);
    assert.equal(cut, true, 'the split drawing is cut away under the card');
    assert.deepEqual(card.viewBounds, card.page, 'the Glance page fills the card');
  }}],
  // V22 (owner, 2026-11-05): the Island is above the page views here, so the card's
  // chrome sits above the Glance page with a hole for it, not below it. Same
  // picture; shipping's view stacking has nothing to read.
  ['the Glance is a large centered card over the whole main page', {divergence: 'V22', async run() {
    const card = await this.waitFor(() => this.call('getGlanceCard'), value => value?.cardViewVisible === true, 'the Glance card to show', 5000);
    const {pageArea} = card;
    const width = Math.min(1100, Math.round(pageArea.width * 0.8));
    assert.deepEqual(card.frame, {x: pageArea.x + Math.round((pageArea.width - width) / 2), y: pageArea.y + 16, width, height: pageArea.height - 48});
    assert.deepEqual(card.mainViewBounds, card.pageBounds, 'the main page keeps the whole page area');
    assert.deepEqual(card.viewBounds, card.page, 'the Glance page sits inside the card, below its header');
    assert.deepEqual(card.cardViewBounds, card.chrome);
  }}],
  // V8 (owner, 2026-10-31): certificate errors show Chromium's warning page
  // and use its proceed decisions instead of blanc://error and shipping's
  // session-only continue. Same warning, in Chromium's words.
  ['Blanc shows a certificate safety interstitial', {divergence: 'V8', async run() {
    const dom = await tabDom(this, this.untrustedCertificateTabId, `(() => ({
      heading: document.querySelector('#main-message h1')?.textContent.trim() ?? '',
      code: document.getElementById('error-code')?.textContent ?? '',
      safety: document.getElementById('primary-button')?.textContent.trim() ?? '',
    }))()`);
    assert.equal(dom.heading, 'Your connection is not private');
    assert.match(dom.code, /CERT/);
    assert.equal(dom.safety, 'Back to safety');
  }}],
  // Chromium's decisions let any site be continued past, so shipping's "no
  // way through" for a public site becomes: nothing past the warning shows
  // until Advanced, which offers Chromium's own Proceed.
  ['no certificate bypass is offered', {divergence: 'V8', async run() {
    const dom = await tabDom(this, this.untrustedCertificateTabId, `(() => ({
      hidden: document.getElementById('details')?.classList.contains('hidden') ?? null,
      proceed: document.getElementById('proceed-link')?.textContent.trim() ?? null,
    }))()`);
    assert.equal(dom.hidden, true, 'nothing past the warning shows before Advanced');
    assert.match(dom.proceed ?? '', /^Proceed to .+ \(unsafe\)$/);
  }}],
  ['I open Advanced and continue to the local address', {divergence: 'V8', async run() {
    const clicked = await tabDom(this, this.localTabId, `(() => {
      const advanced = document.getElementById('details-button');
      if (!advanced) return 'no-advanced';
      advanced.click();
      const proceed = document.getElementById('proceed-link');
      if (!proceed || document.getElementById('details').classList.contains('hidden')) return 'no-panel';
      if (!/^Proceed to nas\\.home\\.arpa(:\\d+)? \\(unsafe\\)$/.test(proceed.textContent.trim())) return proceed.textContent;
      proceed.click();
      return 'clicked';
    })()`);
    assert.equal(clicked, 'clicked');
  }}],
  // V13 (owner, 2026-11-04): Settings is chrome://settings, which shows every
  // explanation in full rather than folding long ones behind More. What
  // shipping's scenario protects stays true: the text is whole and unchanged.
  ['long setting explanations are folded to two lines with a More control', {divergence: 'V13', async run() {
    const explanations = await this.call('settingsExplanations');
    const long = explanations.find(e => e.text.length > 80);
    assert.ok(long, 'a long setting explanation');
    assert.ok(explanations.every(e => e.whole), 'every explanation shows in full');
    this.foldedHint = long;
  }}],
  ['I open the first folded explanation', {divergence: 'V13', async run() {
    // Nothing is folded, so there is nothing to open.
    assert.ok(this.foldedHint, 'the long explanation was found');
  }}],
  ['it shows its full text, unchanged', {divergence: 'V13', async run() {
    const same = (await this.call('settingsExplanations')).find(e => e.text === this.foldedHint.text);
    assert.ok(same?.whole, 'the explanation shows its full text, unchanged');
  }}],
  // V14 (owner, 2026-11-04): chrome://settings's menu marks the page you are
  // on, not the section scrolled to. Scrolling to the end still works, and
  // choosing Help in the menu marks Help and shows it.
  ['I scroll the settings sheet to its end', {divergence: 'V14', async run() {
    assert.equal(await this.call('settingsScrollToEnd'), true);
  }}],
  ['the settings section marker is on Help', {divergence: 'V14', async run() {
    assert.equal(await this.call('settingsChooseMenuItem', 'about-menu'), true, 'Settings has a Help item');
    const marked = await this.call('settingsMenuMarked');
    assert.equal(marked?.item, 'about-menu', 'the menu marks Help');
    assert.equal(marked?.path, '/help', 'Settings shows Help');
  }}],
  // Queue 3 restores shipping v1.46.0 grouped pins. The former V16
  // replacements are retired; both original shipping steps execute unchanged.
  // V17 (owner, 2026-11-04): Close Tabs Below records each closed tab, as
  // Chromium does, so undo brings them back one at a time. One reopen brings
  // one of them back; a second brings back the other.
  ['the tabs on {string} and {string} are open again', {divergence: 'V17', async run(a, b) {
    const open = state => [a, b].filter(name => state.tabs.some(t => new RegExp(`/${name}\\b`).test(t.url ?? '')));
    const first = await this.waitForState(state => open(state).length === 1);
    assert.equal(open(first).length, 1, 'one reopen brings back one closed tab');
    await this.call('reopenClosed');
    await this.waitForState(state => open(state).length === 2);
  }}],
  // V24 (owner, 2026-11-13): Billboard is the one Start Page layout and the
  // others' content comes back as optional widgets. A layout a scenario names
  // is its widget set (lib/start-widgets.mjs). Same promise: the page shows
  // what that layout showed, one root, the choice saved and its switches set.
  ['the start page renders the {string} layout', {divergence: 'V24', async run(layout) {
    const want = LAYOUT_WIDGETS[layout];
    assert.ok(want, `known layout ${layout}`);
    const dom = await this.waitFor(() => this.call('readStartWidgets'),
      d => d?.root === 'billboard' && Object.entries(want).every(([k, v]) => d.widgets?.[k] === v && d.switches?.[k] === v),
      `Billboard with the ${layout} widgets`, 8000);
    assert.deepEqual(dom.visibleRoots, ['Billboard'], 'Billboard is the one layout drawn');
    assert.equal(dom.shown.favorites, want.favorites, 'the Favorites widget shows exactly when it is on');
    assert.equal(dom.tileLimit, want.shortcuts ? 12 : 6, 'More shortcuts gives Billboard twelve tiles');
  }}],
  // V24: Shelf's grid of favorites is the Favorites widget, which lists every
  // seeded favorite (two rows of Shelf's columns) inside its card.
  ['Shelf shows {int} columns with full rows of tiles and cards', {divergence: 'V24', async run(columns) {
    const count = Math.min(columns * 2, FAVORITES_WIDGET_LIMIT);
    const dom = await this.waitFor(() => this.call('readStartWidgets'),
      d => d?.shown.favorites && d.favoriteRows.length === count, `the Favorites widget with ${count} favorites`, 8000);
    const card = dom.cards.favorites;
    for (const row of dom.favoriteRows)
      assert.ok(row.left >= card.left && row.right <= card.right && row.top >= card.top && row.bottom <= card.bottom,
        `favorite ${JSON.stringify(row)} inside its card ${JSON.stringify(card)}`);
    assert.equal(dom.tileLimit, 12, 'Shelf\'s larger grid is More shortcuts');
  }}],
  // V26 (owner, 2026-11-13): no Blocked this week widget. Tally's two
  // columns were Favorites and the week's chart; the week's count is now
  // Billboard's line under the clock. At 1440x840 the Favorites card shows
  // whole in its column beside the clock and the line shows, apart. (Tally's
  // narrow "data above the list" runs as shipping wrote it, the line being
  // the data: adapters/pages.mjs readTallyGeometry.)
  ['Tally shows two equal, top-aligned columns centered at 1440x840', {divergence: 'V26', async run() {
    this.tallyOriginalBounds = await this.call('windowContentBounds');
    await this.call('setWindowContentSize', 1440, 840);
    const tally = await this.waitFor(() => this.call('readTallyGeometry'),
      v => v?.viewportWidth === 1440 && v.left && v.right, 'Favorites and the week\'s line at 1440x840', 8000);
    const {left: favorites, right: line} = tally;
    assert.ok(favorites.left >= 0 && favorites.right <= 1440, `the Favorites card inside the window: ${JSON.stringify(favorites)}`);
    const apart = favorites.right <= line.left || line.right <= favorites.left || favorites.bottom <= line.top || line.bottom <= favorites.top;
    assert.ok(apart, `the card and the line do not overlap: ${JSON.stringify(tally)}`);
  }}],
  // V26 (owner, 2026-11-13): Customize's choices that stand for shipping's
  // four layouts are three: the Favorites and other-devices tiles and the
  // Shortcuts choice (V24 made the layouts widgets; V26 took Blocked this
  // week away). Everything else these two steps check is
  // shipping's, unchanged: the Mahjong link is the footer's own (no frame),
  // opens Mahjong in a new managed tab, private from a private page, and the
  // Start Page keeps its layout.
  ['I launch Mahjong from the start-page footer', {divergence: 'V26', async run() {
    const before = await this.waitFor(() => this.state(),
      state => state.tabs.find(tab => tab.id === state.activeTabId)?.loadedUrl?.startsWith('blanc://newtab/'),
      'loaded start page before launching Mahjong', 8000);
    const source = before.tabs.find(tab => tab.id === before.activeTabId);
    const footer = await this.waitFor(() => this.call('readMahjongFooterLink'),
      value => value?.switcherCount === 3 && value.frameCount === 0, 'three Customize choices and a separate Mahjong footer link', 8000);
    assert.equal(footer.href, source.private ? 'blanc://mahjong/?private=1' : 'blanc://mahjong/');
    assert.equal(footer.target, '_blank');
    this.mahjongSource = {id: source.id, layout: footer.layout, private: source.private, count: before.tabs.length};
    assert.equal(await this.call('clickMahjongFooterLink'), true);
    await this.waitForState(state => {
      const active = state.tabs.find(tab => tab.id === state.activeTabId);
      return state.tabs.length === before.tabs.length + 1 && active?.loadedUrl?.startsWith('blanc://mahjong/');
    });
  }}],
  ['each of the four layout footers launches Mahjong in a new tab', {divergence: 'V26', async run() {
    for (const layout of ['ledger', 'billboard', 'shelf', 'tally']) {
      assert.equal(await this.call('setNewtabLayout', layout), layout);
      await this.call('newTab');
      await this.waitForState(state => state.tabs.find(tab => tab.id === state.activeTabId)?.loadedUrl?.startsWith('blanc://newtab'));
      const before = await this.state();
      const sourceId = before.activeTabId;
      const footer = await this.waitFor(() => this.call('readMahjongFooterLink'), value => value?.layout === layout, `${layout} footer`, 8000);
      assert.equal(footer.switcherCount, 3);
      assert.equal(footer.frameCount, 0);
      assert.equal(await this.call('clickMahjongFooterLink'), true);
      const after = await this.waitForState(state => state.tabs.length === before.tabs.length + 1 &&
        state.tabs.find(tab => tab.id === state.activeTabId)?.loadedUrl?.startsWith('blanc://mahjong/'));
      assert.ok(after.tabs.find(tab => tab.id === sourceId)?.loadedUrl?.startsWith('blanc://newtab/'));
      assert.equal(await this.call('newtabLayout'), layout);
    }
  }}],
  // V26: the Start Page has no Blocked this week card, so the typography
  // audit has ten samples, not shipping's twelve (no .tally-count or
  // .tally-caption, the chart's count and caption). Every rule is shipping's:
  // Instrument Sans loads, no JetBrains Mono or Newsreader, nine headings
  // and every sample in Instrument Sans but the Inter counts.
  ['the start page uses Instrument Sans for the Billboard clock and invitation headings', {divergence: 'V26', async run() {
    const usage = await this.waitFor(() => this.call('readStartPageFontUsage'),
      value => value?.page?.samples?.length === 10, 'the new-tab document to expose its computed fonts', 10000);
    assert.equal(usage.page.textFaceLoaded, true);
    assert.deepEqual(usage.page.jetbrains, []);
    assert.deepEqual(usage.page.newsreader, []);
    assert.equal(usage.page.headings.length, 9);
    for (const heading of usage.page.headings) assert.match(heading.family, /^"?Instrument Sans"?,/, `${heading.selector} resolved to ${heading.family}`);
    const keepInter = new Set(['.shelf-count']);
    for (const sample of usage.page.samples) {
      const expected = keepInter.has(sample.selector) ? /^"?Inter"?,/ : /^"?Instrument Sans"?,/;
      assert.match(sample.family, expected, `${sample.selector} resolved to ${sample.family}`);
    }
  }}],
  // V24: the Favorites widget lists up to eight favorites (Shelf's eight, the
  // most any layout showed), the pinned one first. Pinning on the page itself
  // announces it and keeps focus on the pin, as Shelf did.
  ["{string} leads the Start Page's favorites, pinned", {divergence: 'V24', async run(title) {
    const dom = await this.waitFor(() => this.call('readStartFavorites'),
      v => v?.favorites?.[0]?.title === title && v.favorites[0].pinned, `${title} to lead the Start Page's favorites, pinned`, 8000);
    assert.equal(dom.favorites.length, FAVORITES_WIDGET_LIMIT);
    assert.equal(dom.favorites.filter(f => f.pinned).length, 1);
    assert.equal(dom.favorites[0].pinLabel, `Unpin ${title} from the Start Page`);
    assert.equal(dom.favorites[0].pinShown, true, 'a pinned favorite keeps its pin on show');
    assert.ok(dom.favorites.slice(1).every(f => f.pinLabel === `Pin ${f.title} to the Start Page`));
    const saved = ['Favorite 1', 'Favorite 2', 'Favorite 3', 'Favorite 4', 'Favorite 5', 'Favorite 6', 'Favorite 7', 'Favorite 8'];
    assert.deepEqual(dom.favorites.slice(1).map(f => f.title), saved.filter(t => t !== title).slice(0, FAVORITES_WIDGET_LIMIT - 1));
    this.pinnedFavoriteUrl = dom.favorites[0].url;
    // Right after a pin on the page itself (as Shelf checked): announced, and
    // focus stays on the pin. Later checks (after Customize) keep the words.
    if (dom.status && this.v24PinAnnounced !== title) {
      assert.equal(dom.status, `${title} pinned to the Start Page.`);
      assert.equal(dom.focusedPinOf, dom.favorites[0].url);
      this.v24PinAnnounced = title;
    }
  }}],
  // V24: after the unpin, the Favorites widget's eight are in saved order
  // (Tally, where the scenario ends in shipping, showed five).
  ["the Start Page's favorites are back in their saved order", {divergence: 'V24', async run() {
    const dom = await this.waitFor(() => this.call('readStartFavorites'),
      v => v?.favorites?.length && v.favorites.every(f => !f.pinned), 'the Start Page favorites to unpin', 8000);
    assert.deepEqual(await this.call('startPagePins'), []);
    assert.deepEqual(dom.favorites.map(f => f.title),
      ['Favorite 1', 'Favorite 2', 'Favorite 3', 'Favorite 4', 'Favorite 5', 'Favorite 6', 'Favorite 7', 'Favorite 8'].slice(0, FAVORITES_WIDGET_LIMIT));
    assert.equal(dom.status, 'Favorite 8 unpinned from the Start Page.');
  }}],
  // V25 (owner, 2026-11-13): Patron leaves the Start Page for now (Settings
  // offers it) and Play Blanc Mahjong takes its pill on the footer's left.
  ["every start-page layout shows the Patron upgrade on the footer's left", {divergence: 'V25', async run() {
    for (const layout of ['ledger', 'billboard', 'shelf', 'tally']) {
      assert.equal(await this.call('setNewtabLayout', layout), layout);
      const frame = await this.waitFor(() => this.call('readStartFrameGeometry'), v => v?.layout === layout, `${layout} frame`, 8000);
      assert.equal(frame.patronVisible, false, `${layout}: no Patron on the Start Page`);
      const dom = await this.call('readStartWidgets');
      assert.ok(dom.mahjongPill, `${layout}: the Mahjong pill shows`);
      assert.equal(dom.mahjongInFooterLeft, true, `${layout}: on the footer's left, where Patron was`);
      assert.equal(dom.mahjongText, 'Play Blanc Mahjong');
      assert.ok(dom.mahjongPill.top >= dom.footer.top - 1 && dom.mahjongPill.bottom <= dom.footer.bottom + 1, `${layout}: inside the footer`);
    }
  }}],
  ['I close the Patron upgrade', {divergence: 'V25', async run() {
    const frame = await this.call('readStartFrameGeometry');
    assert.equal(frame.patronVisible, false, 'there is no Patron pill to close on the Start Page');
  }}],
]);
