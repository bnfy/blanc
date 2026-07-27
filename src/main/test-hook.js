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
const { Menu, clipboard } = require('electron');
const { buildAddressMenu } = require('./address-menu-model');
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
    tabs,
    getTabOrder,
    getGroups,
    getActiveTabId,
    clusterSlots,
    createTab,
    setActiveTab,
    closeTab,
    duplicateTab,
    toggleTabPinned,
    toggleTabMuted,
    groupTabByName,
    toggleGroupCollapsed,
    reorderTabWithinBucket,
    reopenClosedTab,
    newTabUrl,
    setTabLayout,
    setVerticalTabsWidth,
    getVerticalTabsMetrics,
    broadcastTabs,
    getRailActivationSerial,
    normalizeAddressInput,
    pasteAndGo,
    handoffProtocols,
    openInternalPage,
    openFindBar,
    getOverlayMode,
    showOverlay,
    hideOverlay,
    pickerController,
    showUtilityPage,
    hideUtilitySheet,
    getUtilitySheetState,
    getUtilitySheetWebContents,
    getOverlayWebContents,
    getChromeWebContents,
    setWindowContentSize,
    getWindowContentBounds,
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
  const lc = (s) => String(s).trim().toLowerCase();
  let focusObservation = null;
  let pendingPick = null; // SPIKE (1Password fill) — the requestPick promise in flight
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
        tab.view.webContents.send('pages:start:remote-tabs', devices);
      }
    }
  }

  globalThis.__blanc = {
    // ---- state ----
    state() {
      const list = [];
      for (const [id, t] of tabs) {
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
          private: !!t.private,
          webContentsId: t.view.webContents.id,
          bounds: t.view.getBounds(),
          sessionKind: t.view.webContents.session === getPrivateBrowsingSession() ? 'private' : 'default',
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
    groupActiveByName(name) { groupTabByName(getActiveTabId(), name); },
    groupTabByName(id, name) { groupTabByName(id, name); },
    activateTab(id, focusContent = false) { setActiveTab(id, { focusContent: !!focusContent }); },
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
        tab.view.webContents.setAudioMuted(patch.muted);
      }
      broadcastTabs();
      return true;
    },
    closeTabsInGroupName(name) {
      const g = getGroups().find((x) => x.name === lc(name));
      if (!g) return;
      for (const [id, t] of tabs) if (t.groupId === g.id) closeTab(id);
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
          bookmarks.toggleBookmark(url, t.view.webContents.getTitle() || url);
        }
      }
    },
    activeFavorited() { const t = tabs.get(getActiveTabId()); return !!t && bookmarks.isBookmarked(urlOf(t)); },
    bookmarkUrls() { return bookmarks.listBookmarks().map((b) => b.url); },

    // ---- history store ----
    seedHistory() { history.addVisit('http://seed.local/', 'Seed'); },
    clearHistory() { history.clearHistory(); },
    historyCount() { return history.listHistory({ limit: 5000 }).length; },

    // ---- settings ----
    setAdblock(on) { settings.setSettings({ adblockEnabled: !!on }); },
    toggleAdblock() { settings.setSettings({ adblockEnabled: !settings.getSettings().adblockEnabled }); },
    adblockEnabled() { return settings.getSettings().adblockEnabled; },
    setSearchEngine(x) { settings.setSettings({ searchEngine: x }); },
    searchEngine() { return settings.getSettings().searchEngine; },
    setSearchSuggestions(on) { settings.setSettings({ searchSuggestions: !!on }); },
    searchSuggestions() { return settings.getSettings().searchSuggestions; },
    settingsSyncValues() { return settings.exportForSync().values; },
    tabLayout() { return settings.getSettings().tabLayout; },
    setTabLayout(layout) { return setTabLayout(layout); },
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
    openFind() { openFindBar(); },
    openPanel() { showOverlay('panel'); },
    openPalette() { showOverlay('palette'); },

    // --- credential picker (1Password fill SPIKE) ---
    // Route through the REAL controller, so a row click exercises the real
    // handleReply -> isOverlaySender -> settle path. A side-channel IPC listener
    // would pass even if handleReply rejected the sender.
    startCredentialPick(rows, truncated = 0) {
      pendingPick = pickerController.requestPick(rows, truncated, 'example.test');
      return true;
    },
    awaitCredentialPick() {
      return pendingPick; // resolves { index, reason } once a reply/settle lands
    },
    clickPickerRow(index) {
      const wc = getOverlayWebContents();
      if (!wc) return null;
      return wc.executeJavaScript(`(() => {
        const rows = document.querySelectorAll('.cred-row');
        if (!rows[${JSON.stringify(index)}]) throw new Error('no picker row at index ' + ${JSON.stringify(index)});
        rows[${JSON.stringify(index)}].click(); // real click -> choosePicker -> real IPC
        return true;
      })()`);
    },
    pressEnterOnPickerCancel() {
      const wc = getOverlayWebContents();
      if (!wc) return null;
      // Just press Enter on the focused Cancel — the reply is observed via
      // awaitCredentialPick (the real promise), not a side channel.
      return wc.executeJavaScript(`(() => {
        const cancel = document.querySelector('.cred-cancel');
        if (!cancel) throw new Error('picker Cancel button is not rendered');
        cancel.focus();
        cancel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        return true;
      })()`);
    },
    readPickerDom() {
      const wc = getOverlayWebContents();
      if (!wc) return null;
      return wc.executeJavaScript(`(() => {
        const list = document.querySelector('.cred-list');
        if (!list) return null;
        return {
          text: list.textContent,
          vaults: [...list.querySelectorAll('.cred-vault')].length,
          injected: list.querySelectorAll('img, script, b, iframe').length,
          pwned: typeof window.__pwned,
          pwnedVault: typeof window.__pwnedVault,
        };
      })()`);
    },
    readPickerIsolation() {
      const wc = getOverlayWebContents();
      if (!wc) return null;
      return wc.executeJavaScript(`(() => {
        const probe = (sel) => {
          const el = document.querySelector(sel);
          if (!el) return { present: false };
          const shown = el.getClientRects().length > 0;
          try { el.focus(); } catch (_) {}
          return { present: true, shown, focusable: document.activeElement === el };
        };
        return {
          address: probe('#addressInput'),
          footer: probe('#islandFooter'),
          settings: probe('#footerSettings'),
          cancel: probe('.cred-cancel'),
        };
      })()`);
    },
    clickHiddenControlInPicker(selector) {
      const wc = getOverlayWebContents();
      if (!wc) return null;
      // Fully synchronous: a temporary observer records whether the click
      // reached the control. The capture-phase guard calls stopPropagation, so
      // with the guard the target is never reached; without it, it fires.
      return wc.executeJavaScript(`(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) throw new Error('control not found: ' + ${JSON.stringify(selector)});
        let reached = false;
        const obs = () => { reached = true; };
        el.addEventListener('click', obs);
        try { el.click(); } finally { el.removeEventListener('click', obs); }
        return { reached };
      })()`);
    },
    readPickerReachability() {
      const wc = getOverlayWebContents();
      if (!wc) return null;
      // Scroll the list to the bottom, then report whether the card fits the
      // viewport and the last row + Cancel are within the scrolled list box.
      return wc.executeJavaScript(`(() => {
        const list = document.querySelector('.cred-list');
        const rows = document.querySelectorAll('.cred-row');
        const cancel = document.querySelector('.cred-cancel');
        const panel = document.getElementById('islandPanel');
        if (!list || !rows.length || !cancel || !panel) return null;
        list.scrollTop = list.scrollHeight;
        const lr = list.getBoundingClientRect();
        const within = (el) => { const r = el.getBoundingClientRect(); return r.top >= lr.top - 0.5 && r.bottom <= lr.bottom + 0.5; };
        return {
          rows: rows.length,
          truncationShown: !!document.querySelector('.cred-more'),
          cardFitsViewport: panel.getBoundingClientRect().bottom <= window.innerHeight + 0.5,
          listScrolls: list.scrollHeight > list.clientHeight + 1,
          lastRowReachable: within(rows[rows.length - 1]),
          cancelReachable: within(cancel),
        };
      })()`);
    },
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
        active: row.classList.contains('active'),
        enter: !!row.querySelector('.row-enter')
      }))`);
    },
    async overlayRendererMode() {
      const wc = getOverlayWebContents();
      if (!wc) return null;
      return wc.executeJavaScript('document.body.dataset.mode || null');
    },
    utilitySurface() { return getUtilitySheetState(); },
    windowContentBounds() { return getWindowContentBounds(); },
    setWindowContentSize(width, height) { setWindowContentSize(width, height); },
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
      // Let the Playwright main-process evaluate handoff settle, then establish
      // page focus immediately before the product broadcast under test.
      await new Promise((resolve) => setTimeout(resolve, 450));
      tab.view.webContents.focus();
      await new Promise((resolve) => setTimeout(resolve, 25));
      const chrome = getChromeWebContents();
      let tabBlurCount = 0;
      let chromeFocusCount = 0;
      const onTabBlur = () => { tabBlurCount += 1; };
      const onChromeFocus = () => { chromeFocusCount += 1; };
      tab.view.webContents.on('blur', onTabBlur);
      chrome?.on('focus', onChromeFocus);
      tab.title = `${tab.title || 'Tab'} · focus probe`;
      broadcastTabs();
      await new Promise((resolve) => setTimeout(resolve, 100));
      tab.view.webContents.removeListener('blur', onTabBlur);
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
      const observation = { wc: tab.view.webContents, count: 0, listener: null };
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

    // ---- isolation between scenarios ----
    reset() {
      clearFocusObservation();
      // No scenario inherits another's open surface. hideOverlay settles any
      // pending picker ('hidden'); drop our handle to its resolved promise too.
      pendingPick = null;
      hideOverlay({ refocusContent: false });
      hideUtilitySheet();
      pushRemoteDevices([]);
      setWindowContentSize(1280, 800);
      // A fresh tab first so closing the rest never empties the window.
      const keep = createTab(newTabUrl());
      setActiveTab(keep, { focusContent: false });
      for (const id of [...tabs.keys()]) if (id !== keep) closeTab(id);
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
        verticalTabsWidth: 248,
        appIcon: 'paper',
        adblockExceptions: [],
      });
      settings.setSupporter(null);
      clearTestSearchSuggestionFixture();
      setTestSearchNavigationCapture(false);
      broadcastTabs();
    },
  };
}

module.exports = { install };
