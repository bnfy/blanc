// Test-only main-process surface, installed ONLY when process.env.BLANC_TEST
// is set (see main.js). It exposes a small, explicit set of state readers and
// actions on globalThis.__blanc so the desktop acceptance harness can drive the
// real tab/group/store logic via Playwright's electronApp.evaluate() — no
// production code path depends on this, and it is never wired in a normal run.
//
// It deliberately reaches into the same functions the app itself uses
// (createTab, groupTabByName, the settings/history/bookmarks stores), so the
// scenarios exercise real behaviour rather than a reimplementation.

const settings = require('./settings');
const history = require('./history');
const bookmarks = require('./bookmarks');
const { app, Menu, clipboard } = require('electron');
const { buildAddressMenu } = require('./address-menu-model');
const { blockableHostname } = require('./adblock-exceptions');
const { syncSnapshot } = require('./session-snapshot');
const { installTestCallBridge } = require('./test-call-bridge');
const {
  runAddressMenuItem,
  readAddressFieldText,
  isAddressMenuAttached,
  ADDRESS_INPUT_ID,
} = require('./address-menu');

/**
 * @param {object} refs - live references from main.js's module scope.
 */
function install(refs) {
  const {
    // Playwright's electronApp.evaluate() calls globalThis.__blanc.* straight
    // into the main process, from OUTSIDE any bindWindowRuntime scope — this
    // is the single most important root to bind. bindRoot is main.js's
    // `(fn) => bindWindowRuntime(primaryRuntime, fn)`; every method below is
    // wrapped with it, once, mechanically, at the end of this function.
    bindRoot,
    tabs,
    getTabOrder,
    getGroups,
    getActiveTabId,
    getIslandRect,
    runBlockAdsCommand,
    runAllowAdsCommand,
    clusterSlots,
    createTab,
    setActiveTab,
    closeTab,
    duplicateTab,
    toggleTabPinned,
    toggleTabMuted,
    setGlanceTab,
    closeGlance: closeGlanceAction,
    promoteGlance: promoteGlanceAction,
    resizeGlanceAt,
    resetGlanceRatio: resetGlanceRatioAction,
    getGlanceTabId,
    getGlanceGeometry,
    groupTabByName,
    closeGroup,
    toggleGroupCollapsed,
    reorderTabWithinBucket,
    reopenClosedTab,
    newTabUrl,
    setTabLayout,
    setVerticalTabsWidth,
    getVerticalTabsMetrics,
    broadcastTabs,
    openNewWindow: openNewWindowAction,
    windowRuntimeSnapshots,
    closeWindowRuntime: closeWindowRuntimeAction,
    openTabInWindow: openTabInWindowAction,
    setGlanceTabInWindow,
    closeGlanceInWindow,
    closeTabInWindow: closeTabInWindowAction,
    reopenClosedTabInWindow,
    createNamedLocalProfileWindow,
    renameNamedLocalProfile,
    deleteNamedLocalProfile,
    localProfileSnapshots,
    profileBookmarkUrls,
    saveProfileFavorite,
    profileTabSessionSnapshot,
    isSessionPersistenceReady,
    getRailActivationSerial,
    normalizeAddressInput,
    pasteAndGo,
    handoffProtocols,
    openInternalPage,
    openFindBar,
    getOverlayMode,
    showOverlay,
    hideOverlay,
    showUtilityPage,
    hideUtilitySheet,
    getUtilitySheetState,
    getUtilitySheetWebContents,
    getOverlayWebContents,
    getChromeWebContents,
    setWindowContentSize,
    getWindowContentBounds,
    focusMainWindow,
    getUtilitySheetBounds,
    getOverlayBounds,
    setTestSearchSuggestionFixture,
    clearTestSearchSuggestionFixture,
    getTestSearchSuggestionRequests,
    setTestSearchNavigationCapture,
    getTestSearchSubmission,
    getPrivateBrowsingSession,
    attemptChromeNavigation,
    getChromeUrl,
    persistedSessionData,
    serializedTabsPayload,
    sleepTab,
    wakeTab,
    runSleepSweep,
    sleepBackgroundTabsNow,
    getPermissionPrompts,
    setSleepThresholdOverride,
    getSleepSnapshots,
    getClosedEntries,
    clearClosedEntries,
  } = refs;

  // The tab model's committed .url is the app's own source of truth (see
  // openInternalPage) and is set synchronously, so it is more reliable in
  // tests than webContents.getURL(), which lags until a navigation commits.
  const urlOf = (t) => {
    if (typeof t.url === 'string' && t.url) return t.url;
    try { return t.view.webContents.getURL(); } catch { return ''; }
  };
  // The ACTUAL committed WebContents URL — not the model's stored .url, which
  // can still read blanc://newtab after a load fails and the page is blank.
  // Regression checks for "did this page really load" must use this.
  const committedUrlOf = (t) => { try { return t.view.webContents.getURL(); } catch { return ''; } };
  const isLoadingOf = (t) => { try { return t.view.webContents.isLoadingMainFrame(); } catch { return false; } };
  const sessionPersistentOf = (t) => { try { return t.view.webContents.session.isPersistent(); } catch { return null; } };
  const titleOf = (t) => { try { return t.view.webContents.getTitle(); } catch { return ''; } };
  const lc = (s) => String(s).trim().toLowerCase();
  let focusObservation = null;
  const beforeUnloadProbes = new Map();
  const remoteFixture = [{
    deviceId: 'acceptance-remote-device',
    name: 'Press Mac',
    platform: 'darwin',
    updatedAt: Date.now(),
    groups: [],
    tabs: [{
      url: 'https://remote.example/press-needle',
      title: 'Remote press needle',
      groupId: null,
      pinned: false,
    }],
  }];

  function clearFocusObservation() {
    if (!focusObservation) return;
    focusObservation.wc.removeListener('focus', focusObservation.listener);
    focusObservation = null;
  }

  function pushRemoteDevices(devices) {
    getOverlayWebContents()?.send('chrome:remote-tabs-updated', devices);
    for (const tab of tabs.values()) {
      if (urlOf(tab).startsWith('blanc://newtab')) {
        tab.view?.webContents?.send('pages:start:remote-tabs', devices);
      }
    }
  }

  globalThis.__blanc = {
    // ---- state ----
    windowRuntimes() { return windowRuntimeSnapshots(); },
    openNewWindow() { return openNewWindowAction(); },
    closeWindowRuntime(id) { return closeWindowRuntimeAction(String(id)); },
    openTabInWindow(id, url, options) {
      return openTabInWindowAction(String(id), String(url), options ?? {});
    },
    createProfileWindow(name) { return createNamedLocalProfileWindow(String(name ?? '')); },
    profiles() { return localProfileSnapshots(); },
    renameProfile(id, name) {
      return renameNamedLocalProfile(String(id), String(name ?? ''));
    },
    deleteProfile(id, confirmation) {
      return deleteNamedLocalProfile(String(id), String(confirmation ?? ''));
    },
    profileBookmarkUrls(id) { return profileBookmarkUrls(String(id)); },
    saveProfileFavorite(id, url, title) {
      return saveProfileFavorite(String(id), String(url), String(title ?? url));
    },
    profileTabSession(id) { return profileTabSessionSnapshot(String(id)); },
    startupReady() { return isSessionPersistenceReady(); },
    /** The strip-reported island rect (window coords) — geometry only. Lets
     * tests assert the morph/proximity anchor tracks the real pill (it went
     * stale across window resizes when only a pill ResizeObserver fed it). */
    islandRect() { const r = getIslandRect(); return r ? { ...r } : null; },
    state() {
      const list = [];
      for (const [id, t] of tabs) {
        const wc = t.view?.webContents;
        list.push({
          id,
          url: urlOf(t),
          loadedUrl: committedUrlOf(t),
          loading: isLoadingOf(t),
          isLoading: !!t.isLoading,
          title: t.title || '',
          favicon: t.favicon || null,
          groupId: t.groupId ?? null,
          pinned: !!t.pinned,
          muted: !!t.muted,
          audible: !!t.audible,
          canGoBack: !!t.canGoBack,
          canGoForward: !!t.canGoForward,
          private: !!t.private,
          // This object is produced inside electronApp.evaluate(); a viewless
          // tab must be observable rather than making every scenario throw.
          asleep: !!t.asleep,
          // Projection only — the capture record (anchors, counts) stays
          // main-process-internal even here.
          capture: t.capture ?? { audio: false, video: false },
          webContentsId: wc?.id ?? null,
          bounds: t.view ? t.view.getBounds() : null,
          sessionKind: wc
            ? (wc.session === getPrivateBrowsingSession() ? 'private' : 'default')
            : null,
          sessionPersistent: sessionPersistentOf(t),
        });
      }
      return {
        tabs: list,
        tabOrder: [...getTabOrder()],
        clusters: clusterSlots().map((slot) => ({
          key: slot.key,
          groupId: slot.group?.id ?? null,
          tabIds: [...slot.tabIds],
        })),
        groups: getGroups().map((g) => ({ id: g.id, name: g.name, collapsed: !!g.collapsed })),
        activeTabId: getActiveTabId(),
        glanceTabId: getGlanceTabId(),
        glanceGeometry: getGlanceGeometry(),
      };
    },

    // ---- tab / group actions ----
    openTab(url, opts) {
      const id = createTab(url, opts || {});
      setActiveTab(id, { focusContent: false });
      return id;
    },
    newTab() {
      const id = createTab(newTabUrl());
      setActiveTab(id, { focusContent: false });
      return id;
    },
    duplicateActive() { duplicateTab(getActiveTabId()); },
    pinTab(id) { toggleTabPinned(id); },
    muteTab(id) { toggleTabMuted(id); },
    closeTab(id) { closeTab(id); },
    reopenClosed() { reopenClosedTab(); },
    setGlance(id) { return setGlanceTab(id); },
    closeGlance() { return closeGlanceAction({ focusContent: false }); },
    promoteGlance() { return promoteGlanceAction(); },
    resizeGlance(point) { return resizeGlanceAt(point); },
    resetGlanceRatio() { return resetGlanceRatioAction(); },
    setWindowGlance(runtimeId, tabId) {
      return setGlanceTabInWindow(String(runtimeId), String(tabId));
    },
    closeWindowGlance(runtimeId) { return closeGlanceInWindow(String(runtimeId)); },
    closeTabInWindow(runtimeId, tabId) {
      return closeTabInWindowAction(String(runtimeId), String(tabId));
    },
    reopenClosedInWindow(runtimeId) { return reopenClosedTabInWindow(String(runtimeId)); },
    groupActiveByName(name) { groupTabByName(getActiveTabId(), name); },
    groupTabByName(id, name) { groupTabByName(id, name); },
    activateTab(id, focusContent = false) { setActiveTab(id, { focusContent: !!focusContent }); },
    focusTabContents(id) {
      const tab = tabs.get(id);
      const wc = tab?.view?.webContents;
      if (!wc || wc.isDestroyed()) return false;
      wc.focus();
      return true;
    },
    railActivationSerial() { return getRailActivationSerial(); },
    toggleGroup(id) { toggleGroupCollapsed(id); },
    reorderWithinBucket(id, beforeId) { return reorderTabWithinBucket(id, beforeId); },
    setTabPresentation(id, patch = {}) {
      const tab = tabs.get(id);
      if (!tab) return false;
      if (typeof patch.title === 'string') tab.title = patch.title;
      if (typeof patch.favicon === 'string' || patch.favicon === null) tab.favicon = patch.favicon;
      if (typeof patch.isLoading === 'boolean') tab.isLoading = patch.isLoading;
      if (typeof patch.audible === 'boolean') tab.audible = patch.audible;
      if (typeof patch.muted === 'boolean') {
        tab.muted = patch.muted;
        tab.view?.webContents?.setAudioMuted(patch.muted);
      }
      broadcastTabs();
      return true;
    },
    async navigateTab(id, url) {
      const tab = tabs.get(id);
      if (!tab?.view?.webContents) return false;
      await tab.view.webContents.loadURL(String(url));
      return true;
    },
    executeTab(id, source) {
      const tab = tabs.get(id);
      if (!tab?.view?.webContents) return null;
      return tab.view.webContents.executeJavaScript(String(source));
    },
    tabNavigation(id) {
      const tab = tabs.get(id);
      const history = tab?.view?.webContents?.navigationHistory;
      if (!history) return null;
      return {
        entries: history.getAllEntries().map((entry) => ({ url: entry.url, title: entry.title })),
        activeIndex: history.getActiveIndex(),
      };
    },
    tabListenerState(id) {
      const wc = tabs.get(id)?.view?.webContents;
      if (!wc || wc.isDestroyed()) return null;
      return {
        didNavigate: wc.listenerCount('did-navigate'),
        title: wc.listenerCount('page-title-updated'),
        input: wc.listenerCount('before-input-event'),
      };
    },
    armBeforeUnloadObjection(id) {
      const wc = tabs.get(id)?.view?.webContents;
      if (!wc || wc.isDestroyed()) return false;
      const originalClose = wc.close;
      const probe = { prevented: false, fired: false };
      beforeUnloadProbes.set(id, probe);
      wc.close = function acceptanceBeforeUnloadClose() {
        wc.close = originalClose;
        queueMicrotask(() => {
          probe.fired = true;
          wc.emit('will-prevent-unload', {
            preventDefault() { probe.prevented = true; },
          });
        });
      };
      return true;
    },
    beforeUnloadProbe(id) { return beforeUnloadProbes.get(id) ?? null; },
    closeTabsInGroupName(name) {
      const g = getGroups().find((x) => x.name === lc(name));
      if (!g) return;
      for (const [id, t] of tabs) if (t.groupId === g.id) closeTab(id);
    },
    // The atomic single-entry group close (F2-6) — distinct from
    // closeTabsInGroupName above, which models per-tab user closes.
    closeGroupByName(name) {
      const g = getGroups().find((x) => x.name === lc(name));
      if (g) closeGroup(g.id);
    },
    // Redacted closed-entry projection for the harness: tier facts only,
    // never snapshots, seeds, or view references (spec §4.1 discipline).
    closedEntriesSummary() {
      return getClosedEntries().map((entry) => ({
        id: entry.id,
        kind: entry.kind,
        url: entry.kind === 'group' ? null : entry.url,
        held: !!entry.view,
        tabCount: entry.kind === 'group' ? entry.tabs.length : 1,
      }));
    },

    // ---- favorites (bookmarks store) ----
    favoriteActive() {
      const t = tabs.get(getActiveTabId());
      if (!t) return;
      // Favorite the tab MODEL's url — what the real app's favorite action uses
      // and what state()/the F9 wait observe — so the wait and the action agree
      // (getURL() lags until navigation commits, which made this race/flake).
      const url = urlOf(t);
      if (!bookmarks.isBookmarked(url)) bookmarks.toggleBookmark(url, t.title || url);
    },
    favoriteAllTabs() {
      for (const t of tabs.values()) {
        const url = urlOf(t);
        if (/^https?:/.test(url) && !bookmarks.isBookmarked(url)) {
          bookmarks.toggleBookmark(url, titleOf(t) || url);
        }
      }
    },
    activeFavorited() { const t = tabs.get(getActiveTabId()); return !!t && bookmarks.isBookmarked(urlOf(t)); },
    bookmarkUrls() { return bookmarks.listBookmarks().map((b) => b.url); },
    bookmarkRecords() {
      return bookmarks.listBookmarks().map(({ url, title, folder }) => ({ url, title, folder }));
    },

    // ---- history store ----
    seedHistory() { history.addVisit('http://seed.local/', 'Seed'); },
    clearHistory() { history.clearHistory(); },
    historyCount() { return history.listHistory({ limit: 5000 }).length; },

    // ---- settings ----
    setAdblock(on) { settings.setSettings({ adblockEnabled: !!on }); },
    // The REAL handler body from main.js, not a copy of it — a mirror here
    // would keep the suite green even with the shipping handler reverted to
    // the bare global toggle this whole change exists to fix.
    toggleAdblock() { return runBlockAdsCommand(); },
    adblockEnabled() { return settings.getSettings().adblockEnabled; },
    setSearchEngine(x) { settings.setSettings({ searchEngine: x }); },
    searchEngine() { return settings.getSettings().searchEngine; },
    setSearchSuggestions(on) { settings.setSettings({ searchSuggestions: !!on }); },
    setUsagePing(on) { settings.setSettings({ usagePing: !!on }); },
    searchSuggestions() { return settings.getSettings().searchSuggestions; },
    settingsSyncValues() { return settings.exportForSync().values; },
    tabSleep() { return settings.getSettings().tabSleep; },
    setTabSleep(value) { return settings.setSettings({ tabSleep: value }).tabSleep; },
    tabLayout() { return settings.getSettings().tabLayout; },
    setTabLayout(layout) { return setTabLayout(layout); },
    newtabLayout() { return settings.getSettings().newtabLayout; },
    setNewtabLayout(layout) { return settings.setSettings({ newtabLayout: layout }).newtabLayout; },
    readNewtabLayoutDom() {
      const tab = tabs.get(getActiveTabId());
      if (!tab || !urlOf(tab).startsWith('blanc://newtab')) return null;
      return tab.view.webContents.executeJavaScript(`(() => ({
        layout: document.body.dataset.layout ?? null,
        active: document.querySelector('[data-layout-pick].active')?.dataset.layoutPick ?? null,
        // The active layout root is the one whose computed display isn't none.
        visible: ['Ledger', 'Billboard', 'Shelf', 'Tally']
          .filter((name) => getComputedStyle(document.getElementById('layout' + name)).display !== 'none'),
      }))()`);
    },
    clickNewtabLayoutSwitcher(name) {
      const tab = tabs.get(getActiveTabId());
      if (!tab || !urlOf(tab).startsWith('blanc://newtab')) return false;
      return tab.view.webContents.executeJavaScript(`(() => {
        const button = document.querySelector('[data-layout-pick="${String(name).replace(/[^a-z]/g, '')}"]');
        if (!button) return false;
        button.click();
        return true;
      })()`);
    },
    readOnboardingDom() {
      const tab = tabs.get(getActiveTabId());
      if (!tab || !urlOf(tab).startsWith('blanc://newtab')) return null;
      return tab.view.webContents.executeJavaScript(`(() => ({
        shown: !(document.getElementById('onboardDialog')?.hidden ?? true),
        step: document.getElementById('onboardDialog')?.dataset.step ?? null,
      }))()`);
    },
    skipOnboarding() {
      const tab = tabs.get(getActiveTabId());
      if (!tab || !urlOf(tab).startsWith('blanc://newtab')) return false;
      return tab.view.webContents.executeJavaScript(`(() => {
        const skip = document.getElementById('obSkip');
        if (!skip || document.getElementById('onboardDialog').hidden) return false;
        skip.click();
        return true;
      })()`);
    },
    firstRunState() {
      const current = settings.getSettings();
      return {
        complete: settings.isFirstRunComplete(),
        searchSuggestions: current.searchSuggestions,
        usagePing: current.usagePing,
      };
    },
    glanceShortcutEnabled() {
      return Menu.getApplicationMenu()
        ?.getMenuItemById('toggle-glance')
        ?.enabled === true;
    },
    pressGlanceShortcut() {
      const accelerator = Menu.getApplicationMenu()
        ?.getMenuItemById('toggle-glance')
        ?.accelerator;
      if (!['CmdOrCtrl+Shift+G', 'CommandOrControl+Shift+G'].includes(accelerator)) {
        throw new Error(`unexpected Glance accelerator: ${accelerator}`);
      }
      const wc = getChromeWebContents();
      if (!wc) throw new Error('chrome webContents unavailable');
      const modifiers = process.platform === 'darwin'
        ? ['meta', 'shift']
        : ['control', 'shift'];
      wc.focus();
      wc.sendInputEvent({ type: 'keyDown', keyCode: 'G', modifiers });
      wc.sendInputEvent({ type: 'keyUp', keyCode: 'G', modifiers });
      return true;
    },
    pressVerticalTabsShortcut() {
      const accelerator = Menu.getApplicationMenu()
        ?.getMenuItemById('toggle-vertical-tabs')
        ?.accelerator;
      if (!['CmdOrCtrl+Alt+V', 'CommandOrControl+Alt+V'].includes(accelerator)) {
        throw new Error(`unexpected vertical-tabs accelerator: ${accelerator}`);
      }
      const wc = getChromeWebContents();
      if (!wc) throw new Error('chrome webContents unavailable');
      const modifiers = process.platform === 'darwin'
        ? ['meta', 'alt']
        : ['control', 'alt'];
      wc.focus();
      wc.sendInputEvent({ type: 'keyDown', keyCode: 'V', modifiers });
      wc.sendInputEvent({ type: 'keyUp', keyCode: 'V', modifiers });
      return true;
    },
    verticalTabsWidth() { return settings.getSettings().verticalTabsWidth; },
    setVerticalTabsWidth(width) { return setVerticalTabsWidth(width); },
    verticalTabsMetrics() { return getVerticalTabsMetrics(); },
    mergeRemoteTabLayout(layout) {
      settings.mergeFromSync({
        values: { tabLayout: layout },
        meta: { tabLayout: Date.now() + 60_000 },
      });
      return settings.getSettings().tabLayout;
    },
    setAppIcon(x) { settings.setSettings({ appIcon: x }); },
    appIcon() { return settings.getSettings().appIcon; },
    secureDns() { return settings.getSettings().secureDns; },
    secureDnsTemplate() { return settings.getSettings().secureDnsTemplate; },
    webrtcPolicy() { return settings.getSettings().webrtcPolicy; },
    setSecureDns(dns, template = '') { settings.setSettings({ secureDns: dns, secureDnsTemplate: template }); },
    clearSupporter() { settings.setSupporter(null); },
    addException(h) {
      const cur = settings.getSettings().adblockExceptions;
      settings.setSettings({ adblockExceptions: [...cur, h] });
    },
    exceptions() { return settings.getSettings().adblockExceptions; },
    // The exception-list hostname of the active tab — lets a scenario talk
    // about "the active site" instead of hardcoding the fixture server's host.
    activeHostname() {
      const tab = tabs.get(getActiveTabId());
      return tab ? blockableHostname(urlOf(tab)) : null;
    },
    allowAdsOnActive() { return runAllowAdsCommand(); },
    // The REAL pill element, so the allow-listed indicator is covered end to
    // end (serializeTabs -> tabs:updated -> renderer) rather than at the model
    // — the state being invisible in the chrome is the whole point of it.
    pillShieldState() {
      const wc = getChromeWebContents();
      if (!wc) return null;
      return wc.executeJavaScript(`(() => {
        const el = document.getElementById('pillShield');
        if (!el) return null;
        return {
          hidden: !!el.hidden,
          off: el.classList.contains('shield-off'),
          title: el.title,
        };
      })()`);
    },
    // ---- blank-tab affordance (F37) ----
    // Read through the real chrome DOM rather than the tab model: the point
    // of F37 is what the pill SHOWS, and a model-level proxy would pass even
    // if the placeholder never rendered.
    pillPlaceholderState() {
      const wc = getChromeWebContents();
      if (!wc) return null;
      return wc.executeJavaScript(`(() => {
        const label = document.getElementById('pillDomain');
        const chip = document.getElementById('pillSlash');
        if (!label) return null;
        // The caret is gone (fbc8270): the prompt now carries its own motion,
        // a bright band washing through the glyphs. Report the mechanism that
        // actually ships in each branch — the animation plus whether the
        // gradient is painting the text — so the guard can't be satisfied by
        // deleting the affordance.
        const cs = getComputedStyle(label);
        const fill = cs.webkitTextFillColor || cs.color;
        return {
          text: label.textContent,
          placeholder: label.classList.contains('placeholder'),
          animation: cs.animationName,
          gradientPainted: /rgba\\(0, 0, 0, 0\\)|transparent/.test(fill),
          reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
          chipHidden: chip ? !!chip.hidden : null,
          chipLabel: chip ? chip.textContent : null,
        };
      })()`);
    },
    clickPillSlash() {
      const wc = getChromeWebContents();
      if (!wc) throw new Error('chrome webContents unavailable');
      return wc.executeJavaScript(`document.getElementById('pillSlash').click()`);
    },
    /** What the island's address input currently holds, per the renderer. */
    overlayAddressValue() {
      const wc = getOverlayWebContents();
      if (!wc) return null;
      return wc.executeJavaScript(
        `document.getElementById('addressInput')?.value ?? null`,
      );
    },
    /**
     * Dispatch a real keydown on the active tab's page, as a person typing
     * with the page focused would. Goes through the page's own listener and
     * the pages:start:open-island channel — not a shortcut into main.
     */
    typeIntoActivePage(key) {
      const tab = tabs.get(getActiveTabId());
      const wc = tab?.view?.webContents;
      if (!wc || wc.isDestroyed()) throw new Error('no live active tab');
      wc.focus();
      wc.sendInputEvent({ type: 'keyDown', keyCode: key });
      wc.sendInputEvent({ type: 'char', keyCode: key });
      wc.sendInputEvent({ type: 'keyUp', keyCode: key });
      return true;
    },

    // ---- shield popover (F12-6) ----
    // Real DOM clicks through the real chrome:open-shield / adblock IPC —
    // same end-to-end rationale as pillShieldState above.
    clickPillShield() {
      const wc = getChromeWebContents();
      if (!wc) throw new Error('chrome webContents unavailable');
      return wc.executeJavaScript(`document.getElementById('pillShield').click()`);
    },
    shieldPopoverState() {
      const wc = getOverlayWebContents();
      if (!wc) return null;
      return wc.executeJavaScript(`(() => {
        const pop = document.getElementById('shieldPop');
        if (!pop) return null;
        const row = document.getElementById('shieldPopConnection');
        return {
          visible: !pop.hidden,
          host: document.getElementById('shieldPopHost').textContent,
          on: document.getElementById('shieldPopToggle').classList.contains('on'),
          toggleShown: !document.getElementById('shieldPopToggle').hidden,
          connection: row && !row.hidden ? row.textContent : null,
          header: document.querySelector('.shield-pop-state')?.textContent.trim() ?? '',
        };
      })()`);
    },
    clickShieldPopoverToggle() {
      const wc = getOverlayWebContents();
      if (!wc) throw new Error('overlay webContents unavailable');
      return wc.executeJavaScript(`document.getElementById('shieldPopToggle').click()`);
    },
    // ---- site-info fold (F12-7/8/9): the badge door, trigger truth, focus ----
    clickInsecureBadge() {
      const wc = getChromeWebContents();
      if (!wc) return false;
      return wc.executeJavaScript(`(() => {
        const b = document.getElementById('pillInsecure');
        if (!b || b.hidden) return false;
        b.click();
        return true;
      })()`);
    },
    pillInsecureHidden() {
      const wc = getChromeWebContents();
      if (!wc) return null;
      return wc.executeJavaScript(`document.getElementById('pillInsecure')?.hidden ?? null`);
    },
    shieldAriaExpanded() {
      const wc = getChromeWebContents();
      if (!wc) return null;
      return wc.executeJavaScript(`({
        shield: document.getElementById('pillShield')?.getAttribute('aria-expanded') ?? null,
        insecure: document.getElementById('pillInsecure')?.getAttribute('aria-expanded') ?? null,
      })`);
    },
    chromeFocusedId() {
      const wc = getChromeWebContents();
      if (!wc) return null;
      return wc.executeJavaScript(`document.activeElement?.id ?? null`);
    },
    pressOverlayEscape() {
      const wc = getOverlayWebContents();
      if (!wc) throw new Error('overlay is not open');
      wc.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
      wc.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
      return true;
    },

    setSupporterActive() { settings.setSupporter({ key: 'test', activationId: 'test', activatedAt: 0 }); },

    // ---- address-bar context menu (F19-2/F19-3) ----
    // A native Menu.popup() can't be driven by Playwright, so these bind the
    // same pure/action layers the popup runs: buildAddressMenu for contents,
    // runAddressMenuItem for the click paths (incl. the pasteAndGo wrapper).
    setClipboardText(text) { clipboard.writeText(text); },
    readClipboardText() { return clipboard.readText(); },
    addressMenuWired() { return isAddressMenuAttached(); },
    async addressFieldText() {
      const wc = getOverlayWebContents();
      if (!wc) throw new Error('overlay is not open');
      // The PRODUCTION read (shared id constant + executeJavaScript), so the
      // acceptance binding exercises the real field-read path, not a copy.
      return readAddressFieldText(wc);
    },
    addressMenu({ fieldText }) {
      return buildAddressMenu({
        // In the real event Blink reports all-true flags for a focused,
        // populated input; the flag→enabled mapping is unit-tested.
        editFlags: {
          canUndo: true, canRedo: true, canCut: true, canCopy: true,
          canPaste: true, canDelete: true, canSelectAll: true,
        },
        clipboardText: clipboard.readText(),
        fieldText,
      });
    },
    runAddressMenuItem(id, fieldText) {
      return runAddressMenuItem(id, {
        wc: getOverlayWebContents(),
        fieldText,
        actions: {
          // Mirror the production closure (main.js) exactly, guard included —
          // the hook must not exercise a path a real click can't take.
          pasteAndGo: (text) => {
            const id = getActiveTabId();
            if (id) pasteAndGo(id, text);
          },
        },
      });
    },

    // ---- address routing / overlay ----
    resolveAddress(input) { return normalizeAddressInput(input); },
    wouldHandOff(url) {
      try { return handoffProtocols.has(new URL(url).protocol); } catch { return false; }
    },
    openDownloads() { openInternalPage('blanc://downloads/'); },
    openSettings() { openInternalPage('blanc://settings/'); },
    async settingsProfileRows() {
      const wc = getUtilitySheetWebContents();
      if (!wc) return [];
      return wc.executeJavaScript(`[...document.querySelectorAll('.profile-row')].map((row) => ({
        id: row.dataset.profileId,
        title: row.querySelector('.title')?.textContent ?? '',
        meta: row.querySelector('.meta')?.textContent ?? '',
        actions: [...row.querySelectorAll('.actions button')].map((button) => button.textContent)
      }))`);
    },
    async settingsCreateProfile(name) {
      const wc = getUtilitySheetWebContents();
      if (!wc) return false;
      return wc.executeJavaScript(`(() => {
        const input = document.getElementById('newProfileName');
        const create = document.getElementById('newProfileCreate');
        if (!input || !create) return false;
        input.value = ${JSON.stringify(String(name ?? ''))};
        create.click();
        return true;
      })()`);
    },
    async settingsRenameProfile(profileId, name) {
      const wc = getUtilitySheetWebContents();
      if (!wc) return false;
      return wc.executeJavaScript(`(() => {
        const row = document.querySelector('.profile-row[data-profile-id=' + JSON.stringify(${JSON.stringify(String(profileId))}) + ']');
        const rename = [...(row?.querySelectorAll('.actions button') ?? [])].find((button) => button.textContent === 'Rename');
        if (!rename) return false;
        rename.click();
        const input = row.querySelector('.main input');
        const save = [...row.querySelectorAll('.actions button')].find((button) => button.textContent === 'Save');
        if (!input || !save) return false;
        input.value = ${JSON.stringify(String(name ?? ''))};
        save.click();
        return true;
      })()`);
    },
    async settingsDeleteProfile(profileId, confirmation) {
      const wc = getUtilitySheetWebContents();
      if (!wc) return false;
      return wc.executeJavaScript(`(() => {
        const row = document.querySelector('.profile-row[data-profile-id=' + JSON.stringify(${JSON.stringify(String(profileId))}) + ']');
        let confirm = [...(row?.querySelectorAll('.actions button') ?? [])].find((button) => button.textContent === 'Delete permanently');
        if (!confirm) {
          const remove = [...(row?.querySelectorAll('.actions button') ?? [])].find((button) => button.textContent === 'Delete');
          if (!remove) return false;
          remove.click();
          confirm = [...row.querySelectorAll('.actions button')].find((button) => button.textContent === 'Delete permanently');
        }
        const input = row.querySelector('.main input');
        if (!input || !confirm) return false;
        input.value = ${JSON.stringify(String(confirmation ?? ''))};
        confirm.click();
        return true;
      })()`);
    },
    openFind() { openFindBar(); },
    openPanel() { showOverlay('panel'); },
    openPalette() { showOverlay('palette'); },
    closeOverlay() { hideOverlay({ refocusContent: false }); },
    overlayMode() { return getOverlayMode(); },
    setSearchSuggestionFixture(suggestions) {
      setTestSearchSuggestionFixture(suggestions);
    },
    searchSuggestionRequests() {
      return getTestSearchSuggestionRequests();
    },
    captureSearchNavigation(enabled) {
      setTestSearchNavigationCapture(enabled);
    },
    capturedSearchSubmission() {
      return getTestSearchSubmission();
    },
    async editAddressInput(value, inputType = 'insertText') {
      const wc = getOverlayWebContents();
      if (!wc) throw new Error('overlay is not open');
      return wc.executeJavaScript(`(() => {
        const input = document.getElementById(${JSON.stringify(ADDRESS_INPUT_ID)});
        if (!input) return false;
        input.value = ${JSON.stringify(String(value))};
        input.dispatchEvent(new InputEvent('input', {
          bubbles: true,
          inputType: ${JSON.stringify(String(inputType))},
          data: null
        }));
        return true;
      })()`);
    },
    async pressAddressKey(key, modifiers = {}) {
      const wc = getOverlayWebContents();
      if (!wc) throw new Error('overlay is not open');
      const init = {
        key: String(key),
        bubbles: true,
        altKey: !!modifiers.altKey,
        ctrlKey: !!modifiers.ctrlKey,
        metaKey: !!modifiers.metaKey,
        shiftKey: !!modifiers.shiftKey,
      };
      return wc.executeJavaScript(`(() => {
        const input = document.getElementById(${JSON.stringify(ADDRESS_INPUT_ID)});
        if (!input) return false;
        input.dispatchEvent(new KeyboardEvent('keydown', ${JSON.stringify(init)}));
        return true;
      })()`);
    },
    async addressResultRows() {
      const wc = getOverlayWebContents();
      if (!wc) return [];
      return wc.executeJavaScript(`[...document.querySelectorAll('#islandList .island-row')].map((row) => ({
        title: row.querySelector('.row-title')?.textContent ?? '',
        tag: row.querySelector('.row-tag')?.textContent ?? '',
        label: row.querySelector('.row-primary')?.getAttribute('aria-label') ?? '',
        quiet: row.classList.contains('quiet'),
        active: row.classList.contains('active'),
        enter: !!row.querySelector('.row-enter')
      }))`);
    },
    async addressCommandNotice() {
      const wc = getOverlayWebContents();
      if (!wc) return null;
      return wc.executeJavaScript(`(() => {
        const row = document.querySelector('#islandList .command-notice');
        return row ? { text: row.textContent, role: row.getAttribute('role') } : null;
      })()`);
    },
    async overlayRendererMode() {
      const wc = getOverlayWebContents();
      if (!wc) return null;
      return wc.executeJavaScript('document.body.dataset.mode || null');
    },
    utilitySurface() { return getUtilitySheetState(); },
    windowContentBounds() { return getWindowContentBounds(); },
    setWindowContentSize(width, height) { setWindowContentSize(width, height); },
    // Fronts + focuses the window and reports whether it is now focused, so
    // pointer-driven steps can insist on an unoccluded, undeprioritized
    // chrome renderer before dispatching a captured pointer sequence.
    focusWindow() { return focusMainWindow(); },
    activeGuestBounds() { return tabs.get(getActiveTabId())?.view.getBounds() ?? null; },
    utilityBounds() { return getUtilitySheetBounds(); },
    overlayBounds() { return getOverlayBounds(); },
    async overlayElementRect(selector) {
      const wc = getOverlayWebContents();
      if (!wc) return null;
      return wc.executeJavaScript(`(() => {
        const element = document.querySelector(${JSON.stringify(String(selector))});
        if (!element || element.hidden) return null;
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          x: rect.x, y: rect.y, width: rect.width, height: rect.height,
          display: style.display, visibility: style.visibility
        };
      })()`);
    },
    async islandLayoutToggleState() {
      const wc = getOverlayWebContents();
      if (!wc) return null;
      return wc.executeJavaScript(`(() => {
        const button = document.getElementById('footerTabLayout');
        if (!button) return null;
        return {
          title: button.title,
          label: button.getAttribute('aria-label'),
          pressed: button.getAttribute('aria-pressed')
        };
      })()`);
    },
    async quietChromeState(title, id) {
      const chrome = getChromeWebContents();
      if (!chrome) return null;
      return chrome.executeJavaScript(`(() => {
        const dot = [...document.querySelectorAll('.island-dot')]
          .find((candidate) => candidate.title === ${JSON.stringify(String(title))});
        const row = document.querySelector(
          '.vertical-tab-row[data-tab-id="' + CSS.escape(${JSON.stringify(String(id))}) + '"]'
        );
        return {
          dotQuiet: !!dot?.classList.contains('asleep'),
          dotPrivate: !!dot?.classList.contains('private'),
          dotLabel: dot?.getAttribute('aria-label') ?? '',
          railQuiet: !!row?.classList.contains('quiet'),
          railPrivate: !!row?.classList.contains('private'),
          railLabel: row?.querySelector('.vertical-tab-primary')?.getAttribute('aria-label') ?? '',
        };
      })()`);
    },
    async quietRowDimStyles(id) {
      const overlay = getOverlayWebContents();
      const chrome = getChromeWebContents();
      if (!overlay || !chrome) {
        return { panel: { error: 'no web contents' }, rail: { error: 'no web contents' } };
      }
      const idJson = JSON.stringify(String(id));

      // One measurement, both surfaces. Contains no backticks and no ${...},
      // so it interpolates verbatim into each executeJavaScript template below.
      const MEASURE = `(row, interactive) => {
        const out = {};
        if (interactive) {
          out.hovered = row.matches(':hover');
          out.focused = row.matches(':focus-within');
        }
        // Rendered: display/visibility up the whole ancestor chain.
        for (let el = row; el && el !== document.documentElement; el = el.parentElement) {
          const s = getComputedStyle(el);
          if (s.display === 'none') return { error: 'display:none on ' + (el.className || el.tagName) };
          if (s.visibility === 'hidden') return { error: 'visibility:hidden on ' + (el.className || el.tagName) };
        }
        // The dim IS the state: the row's own computed opacity, plus the
        // cumulative product ABOVE it (a transparent ancestor would make the
        // dim unreadable while the row's own value still said 0.5).
        let cumulative = 1;
        for (let el = row.parentElement; el && el !== document.documentElement; el = el.parentElement) {
          cumulative *= parseFloat(getComputedStyle(el).opacity);
        }
        const rect = row.getBoundingClientRect();
        return Object.assign(out, {
          rowOpacity: getComputedStyle(row).opacity,
          ancestorOpacity: cumulative,
          rectWidth: rect.width, rectHeight: rect.height,
        });
      }`;

      const panel = await overlay.executeJavaScript(`(() => {
        const measure = ${MEASURE};
        const row = document.querySelector(
          '#islandList .island-row[data-tab-id="' + CSS.escape(${idJson}) + '"]'
        );
        if (!row) return { error: 'quiet panel row not found' };
        if (!row.classList.contains('quiet')) return { error: 'panel row is not .quiet' };
        return measure(row, true);
      })()`);

      const rail = await chrome.executeJavaScript(`(() => {
        const measure = ${MEASURE};
        const row = document.querySelector(
          '.vertical-tab-row[data-tab-id="' + CSS.escape(${idJson}) + '"]'
        );
        if (!row) return { error: 'quiet rail row not found' };
        if (!row.classList.contains('quiet')) return { error: 'rail row is not .quiet' };
        return measure(row, false);
      })()`);

      return { panel, rail };
    },
    async clickIslandLayoutToggle() {
      const wc = getOverlayWebContents();
      if (!wc) return false;
      return wc.executeJavaScript(`(() => {
        const button = document.getElementById('footerTabLayout');
        if (!button) return false;
        button.click();
        return true;
      })()`);
    },
    async activePageState() {
      const tab = tabs.get(getActiveTabId());
      if (!tab) return null;
      return tab.view.webContents.executeJavaScript(`(() => ({
        loadCounter: Number(sessionStorage.getItem('acceptance-load-count') || 0),
        draft: document.getElementById('acceptance-draft')?.value ?? null
      }))()`);
    },
    async setActivePageDraft(value) {
      const tab = tabs.get(getActiveTabId());
      if (!tab) return false;
      return tab.view.webContents.executeJavaScript(`(() => {
        const input = document.getElementById('acceptance-draft');
        if (!input) return false;
        input.value = ${JSON.stringify(String(value))};
        return true;
      })()`);
    },
    activeWebContentsId() {
      return tabs.get(getActiveTabId())?.view.webContents.id ?? null;
    },
    async probeFocusAfterTabBroadcast(id) {
      const tab = tabs.get(id);
      if (!tab) return { tabBlurCount: 0, chromeFocusCount: 0 };
      const wc = tab.view?.webContents;
      if (!wc) return { tabBlurCount: 0, chromeFocusCount: 0 };
      // Let the Playwright main-process evaluate handoff settle, then establish
      // page focus immediately before the product broadcast under test.
      await new Promise((resolve) => setTimeout(resolve, 450));
      wc.focus();
      await new Promise((resolve) => setTimeout(resolve, 25));
      const chrome = getChromeWebContents();
      let tabBlurCount = 0;
      let chromeFocusCount = 0;
      const onTabBlur = () => { tabBlurCount += 1; };
      const onChromeFocus = () => { chromeFocusCount += 1; };
      wc.on('blur', onTabBlur);
      chrome?.on('focus', onChromeFocus);
      tab.title = `${tab.title || 'Tab'} · focus probe`;
      broadcastTabs();
      await new Promise((resolve) => setTimeout(resolve, 100));
      wc.removeListener('blur', onTabBlur);
      chrome?.removeListener('focus', onChromeFocus);
      return {
        tabBlurCount,
        chromeFocusCount,
      };
    },
    beginTabFocusObservation(id) {
      clearFocusObservation();
      const tab = tabs.get(id);
      if (!tab) return false;
      const wc = tab.view?.webContents;
      if (!wc) return false;
      const observation = { wc, count: 0, listener: null };
      observation.listener = () => { observation.count += 1; };
      observation.wc.on('focus', observation.listener);
      focusObservation = observation;
      return true;
    },
    finishTabFocusObservation() {
      if (!focusObservation) return { count: 0 };
      const result = { count: focusObservation.count };
      clearFocusObservation();
      return result;
    },
    injectRemoteDevices() {
      pushRemoteDevices(remoteFixture);
      return structuredClone(remoteFixture);
    },
    clearRemoteDevices() { pushRemoteDevices([]); },
    async remoteStartPageRows() {
      const rows = [];
      for (const tab of tabs.values()) {
        if (!urlOf(tab).startsWith('blanc://newtab')) continue;
        try {
          const rendered = await tab.view.webContents.executeJavaScript(
            `[...document.querySelectorAll('#remoteList a')].map((row) => ({
              title: row.querySelector('.name')?.textContent ?? '',
              href: row.href
            }))`
          );
          rows.push(...rendered);
        } catch { /* page may still be committing; caller polls */ }
      }
      return rows;
    },
    nativeMenuLabels() {
      const labels = [];
      const visit = (menu) => {
        for (const item of menu?.items ?? []) {
          if (item.label) labels.push(item.label);
          if (item.submenu) visit(item.submenu);
        }
      };
      visit(Menu.getApplicationMenu());
      return labels;
    },
    openFavoritesSheet() { openInternalPage('blanc://bookmarks/'); },
    utilitySheetContentsId() { return getUtilitySheetWebContents()?.id ?? null; },
    destroyUtilitySheetContents() {
      const wc = getUtilitySheetWebContents();
      if (!wc || wc.isDestroyed()) return false;
      wc.close();
      return true;
    },
    readBrowserImportDom() {
      const wc = getUtilitySheetWebContents();
      if (!wc) return null;
      return wc.executeJavaScript(`(() => ({
        options: [...document.querySelectorAll('#browserSource option')].map((o) => ({
          value: o.value,
          label: o.textContent,
        })),
        buttonHidden: document.getElementById('browserImportBtn')?.hidden ?? true,
        findHidden: document.getElementById('browserFindBtn')?.hidden ?? true,
        status: document.getElementById('importStatus')?.textContent ?? '',
      }))()`);
    },
    clickBrowserFind() {
      const wc = getUtilitySheetWebContents();
      if (!wc) return false;
      return wc.executeJavaScript(`(() => {
        const button = document.getElementById('browserFindBtn');
        if (!button || button.hidden) return false;
        button.click();
        return true;
      })()`);
    },
    clickBrowserImport() {
      const wc = getUtilitySheetWebContents();
      if (!wc) return false;
      return wc.executeJavaScript(`(() => {
        const button = document.getElementById('browserImportBtn');
        if (!button || button.hidden) return false;
        button.click();
        return true;
      })()`);
    },
    showTestFirstRunMigration() {
      const tab = tabs.get(getActiveTabId());
      if (!tab || !urlOf(tab).startsWith('blanc://newtab')) return false;
      tab.view.webContents.send('pages:start:status', {
        startup: { phase: 'skipped', attempt: 0, error: null },
        privacy: {
          required: true,
          searchSuggestions: true,
          usagePing: false,
        },
      });
      return true;
    },
    // First-run onboarding dialog (replaced the privacy card, 2026-08-16).
    // The names keep their card-era spelling so F30-3's steps stay bound;
    // "migration" now means the dialog's import step.
    readFirstRunMigrationDom() {
      const tab = tabs.get(getActiveTabId());
      if (!tab || !urlOf(tab).startsWith('blanc://newtab')) return null;
      return tab.view.webContents.executeJavaScript(`(() => ({
        initialReady: (document.getElementById('footerLeft')?.textContent ?? '').length > 0,
        privacyHidden: document.getElementById('onboardDialog')?.hidden ?? true,
        migrationHidden: document.querySelector('#obContent [data-step="1"]')?.hidden ?? true,
        findHidden: document.getElementById('obLook')?.hidden ?? true,
        options: [...document.querySelectorAll('#obSources .ob-src-row')].map((row) => row.textContent),
        status: document.getElementById('obImportStatus')?.textContent ?? '',
        step: document.getElementById('onboardDialog')?.dataset.step ?? null,
      }))()`);
    },
    // Advances the dialog to its import step (step 1) so the migration
    // hooks below have their surface on screen.
    openFirstRunImportStep() {
      const tab = tabs.get(getActiveTabId());
      if (!tab || !urlOf(tab).startsWith('blanc://newtab')) return false;
      return tab.view.webContents.executeJavaScript(`(() => {
        const dialog = document.getElementById('onboardDialog');
        if (!dialog || dialog.hidden) return false;
        if (dialog.dataset.step === '0') document.getElementById('obNext').click();
        return dialog.dataset.step === '1';
      })()`);
    },
    clickFirstRunMigrationFind() {
      const tab = tabs.get(getActiveTabId());
      if (!tab || !urlOf(tab).startsWith('blanc://newtab')) return false;
      return tab.view.webContents.executeJavaScript(`(() => {
        const button = document.getElementById('obLook');
        if (!button || button.hidden) return false;
        button.click();
        return true;
      })()`);
    },
    clickFirstRunMigration() {
      const tab = tabs.get(getActiveTabId());
      if (!tab || !urlOf(tab).startsWith('blanc://newtab')) return false;
      return tab.view.webContents.executeJavaScript(`(() => {
        const dialog = document.getElementById('onboardDialog');
        if (!dialog || dialog.hidden || dialog.dataset.step !== '1') return false;
        const rows = [...document.querySelectorAll('#obSources .ob-src-row')]
          .filter((row) => !row.textContent.includes('bookmarks file'));
        if (!rows.length) return false;
        if (!rows[0].classList.contains('selected')) rows[0].click();
        document.getElementById('obNext').click();
        return true;
      })()`);
    },

    // ---- utility sheet drive helpers (acceptance) ----
    // Both click helpers ASSERT the anchor exists — an optional-chained
    // click would silently no-op and turn a rendering regression into a
    // downstream timeout instead of a pointed failure.
    async followNewtabFavoritesLink() {
      const t = tabs.get(getActiveTabId());
      const clicked = await t.view.webContents.executeJavaScript(
        `(() => { const a = document.querySelector('a[href="blanc://bookmarks/"]'); if (a) a.click(); return !!a; })()`);
      if (!clicked) throw new Error('newtab ledger has no favorites link');
    },
    seedFavorite(url, title) {
      if (!bookmarks.isBookmarked(url)) bookmarks.toggleBookmark(url, title || url);
    },
    // F16-6 attack drivers: run the hostile expression in the ACTIVE tab's
    // real page context and resolve only after it executed — a scenario
    // must never pass because an inline script silently failed to run.
    async attemptNavigateActiveTab(url) {
      const t = tabs.get(getActiveTabId());
      const ran = await t.view.webContents.executeJavaScript(
        `(() => { location.href = ${JSON.stringify(String(url))}; return true; })()`);
      if (ran !== true) throw new Error('navigation attempt did not execute');
    },
    async attemptWindowOpenActiveTab(url) {
      const t = tabs.get(getActiveTabId());
      const ran = await t.view.webContents.executeJavaScript(
        `(() => { window.open(${JSON.stringify(String(url))}); return true; })()`);
      if (ran !== true) throw new Error('window.open attempt did not execute');
    },
    async clickFirstSheetLink() {
      const wc = getUtilitySheetWebContents();
      if (!wc) throw new Error('sheet not open');
      const clicked = await wc.executeJavaScript(
        `(() => { const a = document.querySelector('a[href^="https"], a[href^="http"]'); if (a) a.click(); return !!a; })()`);
      if (!clicked) throw new Error('no outbound link rendered in sheet');
    },
    attemptChromeNavigation(url) { return attemptChromeNavigation(String(url)); },
    chromeUrl() { return getChromeUrl(); },
    persistedSessionData() { return persistedSessionData(); },
    serializedTabsPayload() { return serializedTabsPayload(); },
    sessionSyncSnapshot() {
      return syncSnapshot(getTabOrder().map((id) => tabs.get(id)), getGroups());
    },

    // ---- Quiet Tabs ----
    // Every method drives the real main-process implementation; a mirror here
    // would keep the acceptance suite green if the shipping code regressed.
    async sleepTab(id) { return sleepTab(id); },
    async wakeTab(id, navigateTo = null) { return wakeTab(id, { navigateTo }); },
    async wakeTabAtIndex(id, atIndex) { return wakeTab(id, { atIndex }); },
    async sleepBackgroundTabsNow() { return sleepBackgroundTabsNow(); },
    createQuietTab(url, title = 'Restored quiet tab', isPrivate = false) {
      return createTab(String(url), {
        private: !!isPrivate,
        asleep: true,
        title: String(title),
        favicon: null,
      });
    },
    setQuietProtection(id, reason) {
      const tab = tabs.get(id);
      if (!tab) return false;
      if (reason === 'pinned') tab.pinned = true;
      else if (reason === 'muted') tab.muted = true;
      else if (reason === 'audible') tab.audible = true;
      else if (reason === 'used media') tab.usedMedia = true;
      else if (reason === 'capturing') {
        tab.capturing = true;
        tab.capture = { audio: true, video: false };
      }
      else if (reason === 'adopted child') tab.adopted = true;
      else if (reason === 'non-refetchable POST') tab.restorableCommit = false;
      else if (reason === 'pending permission') {
        getPermissionPrompts().set(`quiet-${id}`, { tabId: id, resolve: () => {} });
      } else return false;
      broadcastTabs();
      return true;
    },
    /** With an id: that tab's redacted state. Without: every tab in tab order.
     * NEVER returns entries: snapshots can contain POST bodies and form data. */
    sleepState(id) {
      const snapshots = getSleepSnapshots();
      const one = (tabId, tab) => ({
        id: tabId,
        asleep: !!tab.asleep,
        hasSnapshot: snapshots.has(tabId),
        entryCount: snapshots.get(tabId)?.entries.length ?? 0,
        droppedPageState: !!snapshots.get(tabId)?.droppedPageState,
      });
      if (typeof id === 'string') {
        const tab = tabs.get(id);
        return tab ? one(id, tab) : null;
      }
      return getTabOrder()
        .map((tabId) => {
          const tab = tabs.get(tabId);
          return tab ? one(tabId, tab) : null;
        })
        .filter(Boolean);
    },
    /** Backdate a tab's idle clock so a sweep sees it as idle. */
    setTabIdleSince(id, msAgo) {
      const tab = tabs.get(id);
      if (!tab) return false;
      tab.lastActiveAt = Date.now() - Number(msAgo || 0);
      return true;
    },
    async runSleepSweep() { return runSleepSweep(); },
    setSleepThresholdOverride(ms) { return setSleepThresholdOverride(ms); },
    /** Falsifiability hook: only an OS process count proves a discarded view
     * released its renderer rather than merely disappearing from the tab map. */
    tabProcessCount() {
      return app.getAppMetrics().filter((process) => process.type === 'Tab').length;
    },

    // ---- isolation between scenarios ----
    async reset() {
      clearFocusObservation();
      for (const profile of localProfileSnapshots()) {
        if (profile.id === 'default') continue;
        await deleteNamedLocalProfile(profile.id, profile.name);
      }
      for (const runtime of windowRuntimeSnapshots()) {
        if (runtime.id !== 'primary') closeWindowRuntimeAction(runtime.id);
      }
      await new Promise((resolve) => setImmediate(resolve));
      // Do not let a scenario inherit quiet state or retained page state. A
      // quiet record is safe for closeTab, but waking first makes teardown and
      // the subsequent snapshot clear explicit.
      for (const [id, tab] of tabs) if (tab.asleep) await wakeTab(id);
      getSleepSnapshots().clear();
      getPermissionPrompts().clear();
      beforeUnloadProbes.clear();
      setSleepThresholdOverride(null);
      // No scenario inherits another's open surface.
      hideOverlay({ refocusContent: false });
      hideUtilitySheet();
      pushRemoteDevices([]);
      setWindowContentSize(1280, 800);
      // A fresh tab first so closing the rest never empties the window.
      const keep = createTab(newTabUrl());
      setActiveTab(keep, { focusContent: false });
      // A reset is not a user closing tabs: recording here would leak entries
      // into the next scenario, and the last eligible close would park a live
      // WebContentsView for the whole grace window — corrupting both the
      // reopen list and the quiet-tabs renderer-count baseline.
      for (const id of [...tabs.keys()]) if (id !== keep) closeTab(id, { record: false });
      // Entries a scenario recorded through its own closes are cleared here,
      // including parked renderers and their independent expiry timers.
      clearClosedEntries();
      getGroups().length = 0;
      history.clearHistory();
      for (const b of bookmarks.listBookmarks()) bookmarks.removeBookmark(b.id);
      settings.setSettings({
        searchEngine: 'duckduckgo',
        searchSuggestions: true,
        adblockEnabled: true,
        homePage: '',
        theme: 'system',
        tabLayout: 'island',
        newtabLayout: 'ledger',
        verticalTabsWidth: 248,
        appIcon: 'paper',
        adblockExceptions: [],
        tabSleep: '1h',
        // The launch-time auto-complete records false; F36-2 seeds true and
        // relies on Skip to overwrite it — a failure before Skip must not
        // leak that seed into later scenarios.
        usagePing: false,
      });
      settings.setSupporter(null);
      clearTestSearchSuggestionFixture();
      setTestSearchNavigationCapture(false);
      broadcastTabs();
    },
  };

  // Mechanical, generic wrap — every method installed above is rebound to
  // the owning runtime at call time, not just the ones a hand-picked list
  // would remember to cover. None of these methods use `this`, so replacing
  // each with an arrow-function wrapper is behavior-preserving.
  if (typeof bindRoot === 'function') {
    for (const key of Object.keys(globalThis.__blanc)) {
      const fn = globalThis.__blanc[key];
      if (typeof fn === 'function') globalThis.__blanc[key] = bindRoot(fn);
    }
  }
  installTestCallBridge(globalThis, globalThis.__blanc);
}

module.exports = { install };
