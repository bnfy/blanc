// Shipping steps the fork replaces under an owner-approved divergence (spec
// §9), keyed by shipping's exact step text. Each keeps what the divergence
// leaves true and names what it changes; every other step stays shipping's.
import assert from 'node:assert/strict';
import {LAYOUT_WIDGETS, FAVORITES_WIDGET_LIMIT} from '../lib/start-widgets.mjs';

const tabDom = (world, id, expression) => world.call('executeTab', id, expression);
// The active tab's shipping address (V30).
const activeUrl = (state) => state.tabs.find((tab) => tab.id === state.activeTabId)?.url ?? '';
// History in the utility sheet, as #1614's sheet scenarios open it (V30).
async function historySheetShown(world) {
  const surface = await world.call('utilitySurface');
  if (surface?.kind === 'sheet' && surface.visible) return;
  await world.call('openHistorySheet');
  await world.waitFor(() => world.call('utilitySurface'), (s) => s?.kind === 'sheet' && s.visible && s.ready, 'history sheet to open', 5000);
}

export const DIVERGENCES = new Map([
  // V29 (owner, 2026-11-05 S2.5; 2026-11-17): the fork has no Patron
  // activation yet, so an active supporter unlock can't be made. F17-2's point,
  // that a retired icon is never applied, is tested without it: the next steps
  // write the retired id and read back what the browser applied.
  ['an active supporter unlock', {divergence: 'V29', async run() {
    const settings = await this.snapshot();
    assert.notEqual(settings.patronActive, true, 'the fork has no Patron activation (V29)');
  }}],
  // V21 (owner, 2026-11-05; confirmed 2026-11-16): Mute Site is Chromium's own
  // sound setting, so the site is still muted after the relaunch, where
  // shipping's mute ends when Blanc quits. The step is used only after the
  // relaunch (tabs-and-groups.feature "Mute Site lasts until Blanc quits").
  ['the tab on {string} is not muted', {divergence: 'V21', async run(name) {
    const url = this.fixtureUrl(name);
    await this.waitForState((s) => s.tabs.find((t) => t.url === url)?.muted === true);
  }}],
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
  // V27 (owner, 2026-11-14, the rail hover previews design): with previews
  // on, a rail row carries no native title tooltip, so it and the hover card
  // never show together; the card names the tab instead. Same promise as
  // shipping's F28-17 step: under reduced motion the title stays still, the
  // row's accessible name is the whole title, and hovering shows the whole
  // title (in the card, not a tooltip).
  ['the truncated title remains still with its full accessible name', {divergence: 'V27', async run() {
    const strip = this.frame('strip');
    try {
      const row = await strip.locator(`.vertical-tab-row[data-tab-id="${this.verticalTitleIds.longId}"]`).evaluate((row) => {
        const viewport = row.querySelector('.vertical-tab-title');
        const text = viewport?.querySelector('.vertical-tab-title-text');
        const primary = row.querySelector('.vertical-tab-primary');
        const transform = text ? getComputedStyle(text).transform : 'none';
        return {
          reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
          scrolling: viewport?.classList.contains('scrolling') ?? false,
          x: transform === 'none' ? 0 : new DOMMatrixReadOnly(transform).m41,
          title: primary?.getAttribute('title'),
          ariaLabel: primary?.getAttribute('aria-label') ?? '',
          visibleText: text?.textContent ?? '',
        };
      });
      assert.equal(row.reducedMotion, true);
      assert.equal(row.scrolling, false);
      assert.equal(row.x, 0);
      assert.ok(row.visibleText.length > 0);
      assert.ok(row.ariaLabel.includes(row.visibleText), 'the row is named by its whole title');
      assert.equal(row.title, null, 'no native tooltip while hover previews are on');
      const shown = await this.waitFor(() => this.hostEval(
        `[...document.querySelectorAll('.rail-card-title')].filter(n => n.offsetParent).map(n => n.textContent)`),
      (titles) => titles?.includes(row.visibleText), 'the hover card to show the whole title', 3000);
      assert.ok(shown.includes(row.visibleText));
    } finally {
      await strip.emulateMedia({ reducedMotion: 'no-preference' });
    }
  }}],
  ['I close the Patron upgrade', {divergence: 'V25', async run() {
    const frame = await this.call('readStartFrameGeometry');
    assert.equal(frame.patronVisible, false, 'there is no Patron pill to close on the Start Page');
  }}],
  // V30 (owner, 2026-11-18): Favorites is #1614's page in a tab of its own,
  // with the F63 manager, ahead of the fork's v1.49.1 scenario pin. These
  // steps say what #1614's rewrite of the same scenarios says (the Favorites
  // page opens in a tab, a favorite opens in that tab, the sheet scenarios
  // use History); every other step stays shipping's v1.49.1.
  ['the favorites page is open in the utility sheet', {divergence: 'V30', async run() {
    await this.call('openFavoritesSheet');
    await this.waitFor(() => this.call('favoritesPageReady'), Boolean, 'the Favorites tab to load', 10000);
    this.tabStateBefore = await this.call('state');
  }}],
  ['I follow its {string} navigation link', {divergence: 'V30', async run(label) {
    assert.strictEqual(label, 'Favorites', 'the ledger has exactly one nav link');
    this.tabStateBefore = await this.call('state');
    await this.call('followNewtabFavoritesLink');
    await this.waitForState((s) => activeUrl(s).startsWith('blanc://bookmarks/'), {timeout: 10000});
  }}],
  ['the {word} page opens in the utility sheet under the blanc scheme', {divergence: 'V30', async run(name) {
    if (name === 'favorites') {
      const now = await this.call('state');
      assert.ok(activeUrl(now).startsWith('blanc://bookmarks/'), `active tab is on ${activeUrl(now)}`);
      const surface = await this.call('utilitySurface');
      assert.strictEqual(surface?.kind === 'sheet' && surface.visible, false, 'Favorites never opens the utility sheet');
      return;
    }
    const surface = await this.waitFor(() => this.call('utilitySurface'), (s) => s?.visible && s.ready, `${name} sheet`, 5000);
    assert.ok(surface.url.startsWith(`blanc://${name}/`), `the sheet should show blanc://${name}/: ${surface.url}`);
  }}],
  ['I activate that favorite', {divergence: 'V30', async run() {
    await this.call('clickFirstSheetLink');
    await this.waitForState((s) => !activeUrl(s).startsWith('blanc://bookmarks/'), {timeout: 10000});
    this.favoriteOpenedInPlace = true;
  }}],
  ['exactly one new tab opens on {string}', {divergence: 'V30', async run(host) {
    // Every other use (Become a Patron) keeps shipping's v1.49.1 step.
    if (!this.favoriteOpenedInPlace) {
      const now = await this.call('state');
      assert.strictEqual(now.tabs.length, this.tabStateBefore.tabs.length + 1);
      assert.ok(now.tabs.some((t) => t.url.includes(host)),
        `a tab should be on ${host}: ${JSON.stringify(now.tabs.map((t) => t.url))}`);
      return;
    }
    // #1614: "the Favorites tab now shows" the favorite; no new tab.
    const now = await this.waitForState((s) => activeUrl(s).includes(host), {timeout: 10000});
    assert.strictEqual(now.tabs.length, this.tabStateBefore.tabs.length, 'no new tab');
    assert.strictEqual(now.activeTabId, this.tabStateBefore.activeTabId, 'the same tab');
  }}],
  ['the utility sheet contents are destroyed', {divergence: 'V30', async run() {
    // #1614 runs this scenario over History, the sheet Favorites left.
    await historySheetShown(this);
    this.destroyedUtilitySheetContentsId = await this.call('utilitySheetContentsId');
    assert.ok(this.destroyedUtilitySheetContentsId, 'the open utility sheet should have webContents');
    assert.strictEqual(await this.call('destroyUtilitySheetContents'), true);
    // The Favorites tab stays under it; only the sheet goes.
    await this.waitFor(() => this.call('utilitySurface'), (s) => !(s?.kind === 'sheet' && s.visible), 'destroyed sheet to be dismissed', 5000);
  }}],
  ['the utility sheet uses the Sunrise palette', {divergence: 'V30', async run() {
    await historySheetShown(this);
    const palette = await this.waitFor(() => this.call('utilitySheetPalette'), Boolean, 'sheet palette', 5000);
    assert.deepStrictEqual(palette, {text: 'rgb(18, 16, 11)', card: 'rgb(248, 242, 232)', currentNav: 'rgb(18, 16, 11)'});
  }}],
  ['I pin {string} from the Favorites page', {divergence: 'V30', async run(title) {
    await this.waitFor(() => this.call('readFavoritesSheetPins'),
      (rows) => rows?.some((row) => row.title === title && !row.pinned), `${title} to show unpinned on the Favorites page`, 5000);
    assert.equal(await this.call('toggleFavoritesSheetPin', title), true);
  }}],
  ['the Favorites page marks {string} as pinned to the Start Page', {divergence: 'V30', async run(title) {
    const rows = await this.waitFor(() => this.call('readFavoritesSheetPins'),
      (value) => value?.some((row) => row.title === title && row.pinned), `the Favorites page to mark ${title} as pinned`, 5000);
    const row = rows.find((candidate) => candidate.title === title);
    assert.equal(row.mark, 'Pinned to the Start Page');
    assert.equal(row.focused, true, 'the keyboard stays on the row whose pin changed');
    assert.ok(rows.filter((candidate) => candidate.title !== title).every((candidate) => !candidate.pinned && candidate.mark === null));
  }}],
  ['/^I import Favorites from that browser profile(?: again)?$/', {divergence: 'V30', async run() {
    // #1614's one import dialog closes after each import; importing again
    // opens it again, as shipping's step does since #1590.
    const before = (await this.call('bookmarkRecords')).length;
    if (!(await this.call('readBrowserImportDom'))?.dialogOpen) {
      assert.equal(await this.call('clickBrowserFind'), true);
      await this.waitFor(() => this.call('readBrowserImportDom'), (dom) => dom?.buttonHidden === false, 'the import dialog to offer the profile', 10000);
    }
    assert.equal(await this.call('clickBrowserImport'), true);
    const pattern = before ? /already saved/ : /Imported 3 favorites/;
    await this.waitFor(async () => ({dom: await this.call('readBrowserImportDom'), records: await this.call('bookmarkRecords')}),
      (value) => value.records.length === (before || 3) && pattern.test(value.dom?.status ?? ''), 'browser Favorites import to settle', 15000);
  }}],
  ['browser chrome remains on its trusted local document', {divergence: 'V32', async run() {
    // Chromium refuses a chrome frame's website load itself and leaves its
    // blank refusal page; shipping keeps the document. Either way no web
    // content loads, which is F16-3's point.
    const frame = await this.call('chromeFrameContent');
    assert.ok(frame.kind === 'own' || frame.kind === 'refused', `the strip holds neither Blanc's page nor Chromium's refusal page: ${JSON.stringify(frame)}`);
    if (frame.kind === 'refused') assert.equal(frame.text, '', 'the refusal page shows no content');
  }}],
]);
