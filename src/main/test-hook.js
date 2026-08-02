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
const {
  runAddressMenuItem,
  readAddressFieldText,
  isAddressMenuAttached,
  ADDRESS_INPUT_ID,
} = require('./address-menu');
const { sanitizeCertificate, certificateErrorQuery } = require('./site-security');
const diagnostics = require('./diagnostics');

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
    openGlance,
    closeGlance,
    getGlanceTabId,
    setTabLayout,
    setVerticalTabsWidth,
    getVerticalTabsMetrics,
    broadcastTabs,
    openNewWindow,
    openNewProfileWindow,
    openExistingProfileWindow,
    renameNamedLocalProfile,
    deleteNamedLocalProfile,
    listLocalProfiles,
    windowRuntimeSnapshots: getWindowRuntimeSnapshots,
    tabSessionInfo,
    closeWindowRuntime: closeWindowRuntimeById,
    focusWindowRuntime,
    persistedWorkspaceIds: getPersistedWorkspaceIds,
    persistedWorkspaceSnapshot: getPersistedWorkspaceSnapshot,
    flushPersistedSession,
    getRailActivationSerial,
    normalizeAddressInput,
    pasteAndGo,
    handoffProtocols,
    openInternalPage,
    openFindBar,
    getOverlayMode,
    showOverlay,
    hideOverlay,
    displaySharePickerController,
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
    listDownloads,
    openDownload,
    clearFinishedDownloads,
    setTestOpenDownloadHandler,
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
  let pendingDisplaySharePick = null;
  let openedDownloadPath = null;
  setTestOpenDownloadHandler((filePath) => {
    openedDownloadPath = filePath;
    return Promise.resolve('');
  });
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
          sessionKind: tabSessionInfo(t).kind,
          sessionProfileId: tabSessionInfo(t).profileId,
          matchesProfileSession: tabSessionInfo(t).matchesProfileSession,
          sessionIsolatedFromDefault: tabSessionInfo(t).isolatedFromDefault,
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
    openGlance() { return openGlance(); },
    closeGlance() { return closeGlance(); },
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
      if (Number.isInteger(patch.blockedCount) && patch.blockedCount >= 0) {
        tab.blockedCount = patch.blockedCount;
      }
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

    // ---- browser windows ----
    // These are intentionally limited to the test-only hook: production
    // window ownership is driven by the native File menu/accelerator, while
    // acceptance needs a deterministic way to assert the runtime boundary.
    openWindow() { return openNewWindow(); },
    openProfileWindow(name) { return openNewProfileWindow(name).id; },
    openExistingProfileWindow(id) { return openExistingProfileWindow(id); },
    localProfiles() { return listLocalProfiles(); },
    renameProfile(id, name) { return renameNamedLocalProfile(id, name); },
    deleteProfile(id, confirmation) { return deleteNamedLocalProfile(id, confirmation); },
    windowRuntimes() { return getWindowRuntimeSnapshots(); },
    closeWindow(id) { return closeWindowRuntimeById(id); },
    focusWindow(id) { return focusWindowRuntime(id); },
    persistedWorkspaceIds() { return getPersistedWorkspaceIds(); },
    persistedWorkspace() { return getPersistedWorkspaceSnapshot(); },
    flushSession() { return flushPersistedSession(); },
    quitApplication() {
      // Defer until the Electron evaluate response has crossed the process
      // boundary. app.quit() fires before-quit, which preserves every window
      // workspace; closing BrowserWindows individually is deliberately a
      // different action for secondary windows.
      setImmediate(() => app.quit());
      return true;
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
    bookmarkRecords() {
      return bookmarks.listBookmarks().map(({ url, title, folder }) => ({ url, title, folder }));
    },

    // ---- history store ----
    seedHistory() { history.addVisit('http://seed.local/', 'Seed'); },
    clearHistory() { history.clearHistory(); },
    historyCount() { return history.listHistory({ limit: 5000 }).length; },
    historyEntries() { return history.listHistory({ limit: 5000 }); },

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
    setTheme(theme) { settings.setSettings({ theme }); },
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
    openHistory() { openInternalPage('blanc://history/'); },
    openShortcuts() { openInternalPage('blanc://shortcuts/'); },
    startDownload(url) {
      const tab = tabs.get(getActiveTabId());
      if (!tab || typeof url !== 'string') return false;
      tab.view.webContents.downloadURL(url);
      openInternalPage('blanc://downloads/');
      return true;
    },
    downloads() { return listDownloads(); },
    async openCompletedDownload() {
      const record = listDownloads().find((item) => item.state === 'completed' && item.savePath);
      if (!record) return null;
      await openDownload(record.id);
      return record.savePath;
    },
    openedDownloadPath() { return openedDownloadPath; },
    readDownloadsSheetDom() {
      const wc = getUtilitySheetWebContents();
      if (!wc) return null;
      return wc.executeJavaScript(`(() => ({
        rows: document.querySelectorAll('#list .row').length,
        progressing: document.querySelectorAll('#list .progress').length,
        completed: [...document.querySelectorAll('#list .meta')]
          .filter((node) => node.textContent.startsWith('Completed')).length,
      }))()`);
    },
    openSettings() { openInternalPage('blanc://settings/'); },
    readSettingsProfilesDom() {
      const wc = getUtilitySheetWebContents();
      if (!wc) return null;
      return wc.executeJavaScript(`(() => ({
        nav: document.querySelector('[data-group="profiles"]')?.textContent ?? '',
        createLabel: document.getElementById('newProfileCreate')?.textContent ?? '',
        names: [...document.querySelectorAll('#profilesList .title')].map((node) => node.textContent),
        actions: [...document.querySelectorAll('#profilesList button')].map((node) => node.textContent),
      }))()`);
    },
    readSettingsIconDom() {
      const wc = getUtilitySheetWebContents();
      if (!wc) return null;
      return wc.executeJavaScript(`(() => [...document.querySelectorAll('#appIconGrid .icon-swatch')]
        .map((node) => ({
          id: node.dataset.icon,
          locked: node.classList.contains('locked'),
          selected: node.classList.contains('active'),
        })))()`);
    },
    clickSettingsIcon(id) {
      const wc = getUtilitySheetWebContents();
      if (!wc) return false;
      return wc.executeJavaScript(`(() => {
        const icon = document.querySelector(${JSON.stringify(`#appIconGrid .icon-swatch[data-icon="${String(id)}"]`)});
        if (!icon) return false;
        icon.click();
        return true;
      })()`);
    },
    seedDiagnosticCrash() {
      diagnostics.recordRendererCrash('tab', { reason: 'crashed', exitCode: 9 });
      return diagnostics.status();
    },
    readSettingsDiagnosticsDom() {
      const wc = getUtilitySheetWebContents();
      if (!wc) return null;
      return wc.executeJavaScript(`(() => ({
        nav: document.querySelector('[data-group="diagnostics"]')?.textContent ?? '',
        copy: document.querySelector('#group-diagnostics .section-hint')?.textContent ?? '',
        summary: document.getElementById('diagnosticsSummary')?.textContent ?? '',
        exportLabel: document.getElementById('diagnosticsExport')?.textContent ?? '',
        clearLabel: document.getElementById('diagnosticsClear')?.textContent ?? '',
        clearDisabled: document.getElementById('diagnosticsClear')?.disabled ?? null,
        status: document.getElementById('diagnosticsStatus')?.textContent ?? '',
      }))()`);
    },
    clickClearDiagnostics() {
      const wc = getUtilitySheetWebContents();
      if (!wc) return false;
      return wc.executeJavaScript(`(() => {
        const button = document.getElementById('diagnosticsClear');
        if (!button) return false;
        window.confirm = () => true;
        button.click();
        return true;
      })()`);
    },
    readStartRecoveryDom() {
      const tab = [...tabs.values()].find((candidate) =>
        candidate.url?.startsWith('blanc://newtab'));
      if (!tab) return null;
      return tab.view.webContents.executeJavaScript(`(() => ({
        hidden: document.getElementById('recoveryCard')?.hidden ?? true,
        title: document.getElementById('recoveryTitle')?.textContent ?? '',
        message: document.getElementById('recoveryMessage')?.textContent ?? '',
        restoreLabel: document.getElementById('recoveryRestore')?.textContent ?? '',
        freshLabel: document.getElementById('recoveryFresh')?.textContent ?? '',
        error: document.getElementById('recoveryError')?.textContent ?? '',
      }))()`);
    },
    clickSessionRecovery(choice) {
      if (choice !== 'restore' && choice !== 'fresh') return false;
      const tab = [...tabs.values()].find((candidate) =>
        candidate.url?.startsWith('blanc://newtab'));
      if (!tab) return false;
      const selector = choice === 'restore' ? '#recoveryRestore' : '#recoveryFresh';
      return tab.view.webContents.executeJavaScript(`(() => {
        const button = document.querySelector(${JSON.stringify(selector)});
        if (!button || button.hidden || button.disabled) return false;
        button.click();
        return true;
      })()`);
    },
    chromePalette() {
      const wc = getChromeWebContents();
      if (!wc) return null;
      return wc.executeJavaScript(`(() => ({
        id: ${wc.id},
        theme: document.documentElement.dataset.theme ?? null,
        background: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),
      }))()`);
    },
    islandChrome() {
      const wc = getChromeWebContents();
      if (!wc) return null;
      return wc.executeJavaScript(`(() => {
        const group = document.getElementById('pillGroupName');
        const shield = document.getElementById('pillShield');
        return {
          navTitles: [...document.querySelectorAll('#pillNav button')].map((button) => button.title),
          dotCount: document.querySelectorAll('#pillDots .island-dot').length,
          groupName: group?.hidden ? '' : (group?.textContent ?? '').trim(),
          domain: document.getElementById('pillDomain')?.textContent ?? '',
          shieldCount: shield?.hidden ? null : shield?.textContent ?? null,
          actionTitles: [...document.querySelectorAll('#pillActions button')]
            .filter((button) => !button.hidden)
            .map((button) => button.title),
        };
      })()`);
    },
    privateChrome() {
      const wc = getChromeWebContents();
      if (!wc) return null;
      return wc.executeJavaScript(`(() => {
        const chip = document.getElementById('pillPrivateChip');
        return {
          theme: document.documentElement.dataset.theme ?? null,
          privateChipVisible: !!chip && !chip.hidden,
        };
      })()`);
    },
    showPermissionPromptFixture() {
      const wc = getChromeWebContents();
      if (!wc) return false;
      wc.send('permissions:prompt', {
        id: -1,
        origin: 'https://camera.example',
        permission: 'media',
        mediaTypes: ['video'],
      });
      return true;
    },
    readPermissionPromptDom() {
      const wc = getChromeWebContents();
      if (!wc) return null;
      return wc.executeJavaScript(`(() => ({
        hidden: document.getElementById('permissionBar')?.hidden ?? true,
        text: document.getElementById('permissionText')?.textContent ?? '',
        focus: document.activeElement?.id ?? '',
      }))()`);
    },
    dismissPermissionPromptFixture() {
      const wc = getChromeWebContents();
      if (!wc) return false;
      return wc.executeJavaScript(`(() => {
        const button = document.getElementById('permBlockBtn');
        if (!button || document.getElementById('permissionBar')?.hidden) return false;
        button.click();
        return true;
      })()`);
    },
    clickPrivateChip() {
      const wc = getChromeWebContents();
      if (!wc) return false;
      return wc.executeJavaScript(`(() => {
        const chip = document.getElementById('pillPrivateChip');
        if (!chip || chip.hidden) return false;
        chip.click();
        return true;
      })()`);
    },
    utilityPalette() {
      const wc = getUtilitySheetWebContents();
      if (!wc) return null;
      return wc.executeJavaScript(`(() => ({
        id: ${wc.id},
        theme: document.documentElement.dataset.theme ?? null,
        background: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),
      }))()`);
    },
    openFind() { openFindBar(); },
    async setFindQuery(query) {
      const wc = getOverlayWebContents();
      if (!wc) return false;
      return wc.executeJavaScript(`(() => {
        const input = document.getElementById('findInput');
        if (!input) return false;
        input.value = ${JSON.stringify(String(query))};
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      })()`);
    },
    async findUi() {
      const wc = getOverlayWebContents();
      if (!wc) return null;
      return wc.executeJavaScript(`(() => ({
        query: document.getElementById('findInput')?.value ?? '',
        count: document.getElementById('findCount')?.textContent ?? '',
      }))()`);
    },
    async stepFind(direction) {
      const wc = getOverlayWebContents();
      if (!wc) return false;
      const id = direction === 'previous' ? 'findPrevBtn' : 'findNextBtn';
      return wc.executeJavaScript(`(() => {
        const button = document.getElementById(${JSON.stringify(id)});
        if (!button) return false;
        button.click();
        return true;
      })()`);
    },
    async clickActivePageProbe() {
      const tab = tabs.get(getActiveTabId());
      if (!tab) return null;
      return tab.view.webContents.executeJavaScript(`(() => {
        const button = document.getElementById('acceptance-page-action');
        if (!button) return null;
        button.click();
        const rect = button.getBoundingClientRect();
        return {
          clicks: Number(button.dataset.clicks || 0),
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        };
      })()`);
    },
    openPanel() { showOverlay('panel'); },
    openPalette() { showOverlay('palette'); },
    setActiveSiteSecurityFixture(kind) {
      const tab = tabs.get(getActiveTabId());
      if (!tab) return false;
      tab.isLoading = false;
      tab.certificateError = null;
      tab.blockedCount = 3;
      if (kind === 'secure') {
        tab.siteSecurityFixture = { url: 'https://secure.example/path', blockedCount: 3 };
      } else if (kind === 'insecure') {
        tab.siteSecurityFixture = { url: 'http://plain.example/path', blockedCount: 3 };
      } else if (kind === 'local') {
        tab.siteSecurityFixture = { url: 'http://localhost:3000/path', blockedCount: 3 };
      } else {
        return false;
      }
      broadcastTabs();
      return true;
    },
    readPillSecurityDom() {
      const wc = getChromeWebContents();
      if (!wc) return null;
      return wc.executeJavaScript(`(() => {
        const warning = document.getElementById('pillInsecure');
        return {
          hidden: warning?.hidden ?? true,
          title: warning?.title ?? '',
        };
      })()`);
    },
    clickSiteInfoButton() {
      const wc = getOverlayWebContents();
      if (!wc) return false;
      return wc.executeJavaScript(`(() => {
        const button = document.getElementById('panelSiteInfo');
        if (!button || button.hidden) return false;
        button.click();
        return true;
      })()`);
    },
    readSiteInfoDom() {
      const wc = getOverlayWebContents();
      if (!wc) return null;
      return wc.executeJavaScript(`(() => {
        const button = document.getElementById('panelSiteInfo');
        const card = document.querySelector('.site-info-card');
        return {
          buttonHidden: button?.hidden ?? true,
          buttonState: [...(button?.classList ?? [])].find((name) =>
            ['secure', 'insecure', 'local', 'certificate-error'].includes(name)) ?? null,
          expanded: button?.getAttribute('aria-expanded') === 'true',
          title: card?.querySelector('.site-info-title')?.textContent ?? '',
          origin: card?.querySelector('.site-info-origin')?.textContent ?? '',
          summary: card?.querySelector('.site-info-summary')?.textContent ?? '',
          details: card?.querySelector('.site-info-details')?.textContent ?? '',
          protection: card?.querySelector('.site-info-protection')?.textContent ?? '',
          hint: document.getElementById('islandHint')?.textContent ?? '',
        };
      })()`);
    },
    async showCertificateErrorFixture() {
      const tab = tabs.get(getActiveTabId());
      if (!tab) return false;
      delete tab.siteSecurityFixture;
      const record = {
        url: 'https://expired.example/',
        error: 'net::ERR_CERT_DATE_INVALID',
        certificate: sanitizeCertificate({
          subjectName: 'expired.example',
          issuerName: 'Acceptance Test Root',
          validStart: 1_600_000_000,
          validExpiry: 1_700_000_000,
          fingerprint: 'AA:BB:CC:DD',
        }),
      };
      tab.certificateError = record;
      const query = certificateErrorQuery(record, {
        code: -201,
        desc: 'Certificate date invalid',
      });
      await tab.view.webContents.loadURL(`blanc://error/?${query}`);
      return true;
    },
    readActiveErrorDom() {
      const tab = tabs.get(getActiveTabId());
      if (!tab) return null;
      return tab.view.webContents.executeJavaScript(`(() => ({
        title: document.getElementById('errorTitle')?.textContent ?? '',
        url: document.getElementById('errorUrl')?.textContent ?? '',
        detail: document.getElementById('errorDetail')?.textContent ?? '',
        certificate: document.getElementById('certificateDetails')?.textContent ?? '',
        links: [...document.querySelectorAll('a')].map((a) => ({
          text: a.textContent,
          href: a.getAttribute('href'),
        })),
        proceedControls: [...document.querySelectorAll('button, a')].filter((el) =>
          /proceed|continue|accept|visit anyway/i.test(el.textContent)
        ).length,
      }))()`);
    },
    // --- display sharing (F29) ---
    // Deterministic fake source objects run through the production controller.
    // CI must not depend on the host's current windows or Screen Recording
    // authorization; main.js's Electron enumeration boundary is kept thin and
    // the request/renderer/settlement lifecycle is exercised here.
    startDisplaySharePick(origin = 'https://meet.example') {
      const tab = tabs.get(getActiveTabId());
      if (!tab) throw new Error('display sharing needs an active tab');
      const sources = [
        { id: 'screen:acceptance-1', name: 'Acceptance Screen' },
        { id: 'window:acceptance-2', name: 'Acceptance Window' },
      ];
      const rows = sources.map((source) => ({
        name: source.name,
        type: source.id.startsWith('screen:') ? 'screen' : 'window',
        thumbnail: null,
        appIcon: null,
      }));
      pendingDisplaySharePick = displaySharePickerController.requestPick({
        sources,
        rows,
        origin,
        webContentsId: tab.view.webContents.id,
        canShareAudio: false,
      });
      return true;
    },
    awaitDisplaySharePick() {
      return pendingDisplaySharePick;
    },
    async readDisplayShareDom() {
      const wc = getOverlayWebContents();
      if (!wc) return null;
      return wc.executeJavaScript(`(() => {
        const root = document.querySelector('.display-share');
        if (!root) return null;
        return {
          heading: root.querySelector('.display-share-heading')?.textContent ?? '',
          names: [...root.querySelectorAll('.display-source-label')].map((el) => el.textContent),
          selected: [...root.querySelectorAll('.display-source')].findIndex(
            (el) => el.getAttribute('aria-checked') === 'true'
          ),
          audioOffered: !!root.querySelector('#displayShareAudio'),
          confirmVisible: document.querySelector('.display-share-confirm')
            ?.getClientRects().length > 0,
          panelFitsViewport: document.getElementById('islandPanel')
            ?.getBoundingClientRect().bottom <= window.innerHeight + 0.5,
        };
      })()`);
    },
    async chooseDisplayShareSource(index) {
      const wc = getOverlayWebContents();
      if (!wc) return false;
      return wc.executeJavaScript(`(() => {
        const rows = document.querySelectorAll('.display-source');
        const row = rows[${JSON.stringify(index)}];
        const confirm = document.querySelector('.display-share-confirm');
        if (!row || !confirm) throw new Error('display source chooser is incomplete');
        row.click();
        confirm.click();
        return true;
      })()`);
    },
    navigateActiveTab(url) {
      const tab = tabs.get(getActiveTabId());
      if (!tab) return false;
      tab.view.webContents.loadURL(String(url)).catch(() => {});
      return true;
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
        command: row.querySelector('.row-cmd')?.textContent ?? '',
        tag: row.querySelector('.row-tag')?.textContent ?? '',
        active: row.classList.contains('active'),
        enter: !!row.querySelector('.row-enter')
      }))`);
    },
    async chooseAddressResult({ title, tag }) {
      const wc = getOverlayWebContents();
      if (!wc) return false;
      return wc.executeJavaScript(`(() => {
        const rows = [...document.querySelectorAll('#islandList .island-row')];
        const row = rows.find((candidate) =>
          (candidate.querySelector('.row-title')?.textContent ?? '') === ${JSON.stringify(String(title))} &&
          (candidate.querySelector('.row-tag')?.textContent ?? '') === ${JSON.stringify(String(tag))});
        if (!row) return false;
        row.click();
        return true;
      })()`);
    },
    async overlayGroups() {
      const wc = getOverlayWebContents();
      if (!wc) return null;
      return wc.executeJavaScript(`(() => ({
        headers: [...document.querySelectorAll('#islandList .island-ghead:not(.static)')]
          .map((row) => ({
            name: row.querySelector('.ghead-name')?.textContent ?? '',
            collapsed: !row.querySelector('.caret')?.classList.contains('open'),
          })),
        foldedLabels: [...document.querySelectorAll('#islandList .folded-row .row-folded-label')]
          .map((node) => node.textContent ?? ''),
      }))()`);
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
    readBrowserImportDom() {
      const wc = getUtilitySheetWebContents();
      if (!wc) return null;
      return wc.executeJavaScript(`(() => ({
        options: [...document.querySelectorAll('#browserSource option')].map((o) => ({
          value: o.value,
          label: o.textContent,
        })),
        buttonHidden: document.getElementById('browserImportBtn')?.hidden ?? true,
        status: document.getElementById('importStatus')?.textContent ?? '',
      }))()`);
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
          tabLayout: 'island',
        },
      });
      return true;
    },
    readFirstRunMigrationDom() {
      const tab = tabs.get(getActiveTabId());
      if (!tab || !urlOf(tab).startsWith('blanc://newtab')) return null;
      return tab.view.webContents.executeJavaScript(`(() => ({
        initialReady: (document.getElementById('footerLeft')?.textContent ?? '').length > 0,
        privacyHidden: document.getElementById('privacyCard')?.hidden ?? true,
        privacyStepHidden: document.getElementById('privacyStep')?.hidden ?? true,
        migrationStepHidden: document.getElementById('migrationStep')?.hidden ?? true,
        setupStepHidden: document.getElementById('setupStep')?.hidden ?? true,
        progress: document.getElementById('onboardingProgress')?.textContent ?? '',
        migrationHidden: document.getElementById('migrationChoice')?.hidden ?? true,
        options: [...document.querySelectorAll('#migrationSource option')].map((o) => o.textContent),
        status: document.getElementById('migrationStatus')?.textContent ?? '',
        layouts: [...document.querySelectorAll('input[name="onboardingLayout"]')].map((input) => input.value),
        selectedLayout: document.querySelector('input[name="onboardingLayout"]:checked')?.value ?? null,
        defaultBrowserHidden: document.getElementById('onboardingDefaultBrowser')?.hidden ?? true,
        defaultBrowserDisabled: document.getElementById('onboardingDefaultButton')?.disabled ?? true,
      }))()`);
    },
    clickFirstRunPrivacyContinue() {
      const tab = tabs.get(getActiveTabId());
      if (!tab || !urlOf(tab).startsWith('blanc://newtab')) return false;
      return tab.view.webContents.executeJavaScript(`(() => {
        const button = document.getElementById('privacyContinue');
        if (!button || document.getElementById('privacyStep')?.hidden) return false;
        button.click();
        return true;
      })()`);
    },
    clickFirstRunMigration() {
      const tab = tabs.get(getActiveTabId());
      if (!tab || !urlOf(tab).startsWith('blanc://newtab')) return false;
      return tab.view.webContents.executeJavaScript(`(() => {
        const button = document.getElementById('migrationImport');
        if (!button || document.getElementById('migrationChoice')?.hidden) return false;
        button.click();
        return true;
      })()`);
    },
    clickFirstRunMigrationContinue() {
      const tab = tabs.get(getActiveTabId());
      if (!tab || !urlOf(tab).startsWith('blanc://newtab')) return false;
      return tab.view.webContents.executeJavaScript(`(() => {
        const button = document.getElementById('migrationContinue');
        if (!button || document.getElementById('migrationStep')?.hidden) return false;
        button.click();
        return true;
      })()`);
    },
    selectFirstRunLayout(layout) {
      const tab = tabs.get(getActiveTabId());
      if (!tab || !urlOf(tab).startsWith('blanc://newtab')) return false;
      return tab.view.webContents.executeJavaScript(`(() => {
        const value = ${JSON.stringify(String(layout))};
        const input = [...document.querySelectorAll('input[name="onboardingLayout"]')]
          .find((candidate) => candidate.value === value);
        if (!input || document.getElementById('setupStep')?.hidden) return false;
        input.click();
        return true;
      })()`);
    },
    clickFirstRunFinish() {
      const tab = tabs.get(getActiveTabId());
      if (!tab || !urlOf(tab).startsWith('blanc://newtab')) return false;
      return tab.view.webContents.executeJavaScript(`(() => {
        const button = document.getElementById('setupFinish');
        if (!button || document.getElementById('setupStep')?.hidden) return false;
        button.click();
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
    islandProfileLabel() {
      const wc = getChromeWebContents();
      if (!wc) return null;
      return wc.executeJavaScript(
        `document.getElementById('pillProfileName')?.textContent ?? ''`
      );
    },

    // ---- isolation between scenarios ----
    reset() {
      clearFocusObservation();
      // No scenario inherits another's open surface. hideOverlay settles any
      // pending display picker; drop our handle to its resolved promise too.
      pendingDisplaySharePick = null;
      hideOverlay({ refocusContent: false });
      hideUtilitySheet();
      pushRemoteDevices([]);
      openedDownloadPath = null;
      setWindowContentSize(1280, 800);
      // Multi-window scenarios must not leak a focused secondary runtime into
      // the next scenario. Close every secondary first, then bind the rest of
      // reset to Personal's primary workspace.
      for (const runtime of getWindowRuntimeSnapshots()) {
        if (runtime.id !== 'primary') closeWindowRuntimeById(runtime.id);
      }
      focusWindowRuntime('primary');
      // A fresh tab first so closing the rest never empties the window.
      const keep = createTab(newTabUrl());
      setActiveTab(keep, { focusContent: false });
      for (const id of [...tabs.keys()]) if (id !== keep) closeTab(id);
      getGroups().length = 0;
      history.clearHistory();
      clearFinishedDownloads();
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
      diagnostics.clear();
      broadcastTabs();
    },
  };
}

module.exports = { install };
