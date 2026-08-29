'use strict';

// Everything createTab does to a tab's WebContentsView: constructing it here,
// and (see wireTabView, added alongside) registering its listeners and setup
// calls. It lives outside main.js so the exact same construction and wiring can
// be replayed later on a tab whose renderer was discarded — the private-session
// ternary in particular must exist in exactly one place, or a rebuilt private
// tab silently joins the default session while the chrome still paints the
// dashed private pill.
const path = require('path');
const { WebContentsView, session, dialog } = require('electron');
const settings = require('./settings');
const bookmarks = require('./bookmarks');
const history = require('./history');
const sync = require('./sync');
const { attachContextMenu } = require('./context-menu');
const { webrtcPolicyFor } = require('./network-privacy');
const { effectiveTabMuted, noteMediaStarted } = require('./tab-audio');
const {
  shouldClearFaviconOnNavigate,
  refineDeclaredStaticFavicon,
  updateFaviconAfterDomReady,
  updateFaviconFromPage,
} = require('./favicon-policy');
const { blockableHostname } = require('./adblock-exceptions');
const { isForbiddenTopLevelUrl } = require('./top-level-url-policy');

let deps = null;

const TAB_WEB_PREFERENCES = {
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  // Chromium's built-in PDF viewer is a plugin; without this flag
  // PDFs download instead of rendering inline.
  plugins: true,
  // Exposes a data API to our own blanc:// pages ONLY — see the guards in
  // tab-preload.js and pages.js. Ordinary web content gets only the
  // unprivileged, session-wide Chrome compatibility surface.
  preload: path.join(__dirname, 'tab-preload.js'),
};

/** Non-persistent session shared by all private tabs for this app run. */
let privateBrowsingSession = null;
let profileSessionRegistry = null;
const PRIVATE_PARTITION = 'private-browsing'; // no `persist:` prefix = memory only
const getNormalBrowsingSession = (profileId = 'default') =>
  profileSessionRegistry?.normal(profileId) ?? session.defaultSession;
const getPrivateBrowsingSession = (profileId = 'default') =>
  profileSessionRegistry?.private(profileId)
  ?? (privateBrowsingSession ??= session.fromPartition(PRIVATE_PARTITION));

function configureProfileSessions(registry) {
  profileSessionRegistry = registry;
}

/** After wc.close(), view.webContents reads back UNDEFINED, not destroyed —
 *  see main.js's reloadTabAfterSettingsFanout, where this exact dereference
 *  killed main once. Two steps, always: read, then test. */
const liveViewContents = (view) => {
  const wc = view?.webContents;
  return wc && !wc.isDestroyed() ? wc : null;
};
const liveContents = (tab) => liveViewContents(tab?.view);

/**
 * The ONLY place a tab's WebContentsView is constructed. Never returns null,
 * never navigates, never registers a listener.
 * @param {{private?: boolean}} tab a tab record, or any object with a boolean
 *   `private`. Safe to call before the record exists (createTab does).
 * @returns {import('electron').WebContentsView}
 */
function createTabView(tab) {
  const profileId = tab?.profileId ?? 'default';
  const browsingSession = tab?.private
    ? getPrivateBrowsingSession(profileId)
    : getNormalBrowsingSession(profileId);
  return new WebContentsView({
    webPreferences: { ...TAB_WEB_PREFERENCES, session: browsingSession },
  });
}

/**
 * Supply the main-process operations that tab setup calls back into. Keeping
 * these explicit lets a discarded tab replay its exact wiring without this
 * module owning the process-wide tab map or a window runtime.
 */
function initTabView(injected) {
  const required = [
    'tabs', 'windowRuntimes', 'bindWindowRuntime', 'tabIdByWebContentsId',
    'broadcastTabs', 'scheduleBroadcastTabs', 'scheduleSampleTint', 'scheduleMenuRebuild',
    'createTab', 'setActiveTab', 'closeTab', 'openInternalPage',
    'currentChromeLayout', 'currentTabBounds', 'hideOverlay', 'hasLiveWindow',
    'reclaimAddressBarFocus', 'shouldReclaimAddressBarFocus',
    'installChromeShortcuts', 'watchCursorFor',
    'isUtilityUrl', 'handOffToOs', 'setTabFavicon',
    'isStartupGateActive', 'startupQueuedNavigations',
    'onMainFrameCommit', 'noteWakeSuppressed', 'notePopupChild',
    'registerPopupCaptureSurface', 'clearTabCaptureState',
  ];
  for (const name of required) {
    if (injected?.[name] === undefined) throw new Error(`initTabView missing dependency: ${name}`);
  }
  deps = injected;
}

/**
 * Attach every per-tab webContents listener and setup call. It never removes
 * listeners itself: a later renderer replacement installs a new view and
 * leaves stale callbacks harmless through the guards below.
 *
 * @param {object} tab the tab record, whose view has already been set to view
 * @param {import('electron').WebContentsView} view
 * @param {{owner: object, adopted: boolean}} options the owning runtime; an
 *   adopted view is Chromium's already-created window.open child
 */
/** Every (event, handler) pair the last wireTabView call added to a given
 *  WebContents. Recorded by before/after diff so no call site changes; lets
 *  unwireTabView remove EXACTLY our listener set. Name-based stripping is
 *  wrong in both directions (proven live): blanket removeAllListeners()
 *  severs Electron's internal '-'-prefixed window-open pipeline (SIGSEGV on
 *  a held page's window.open), and stripping all PUBLIC names removes
 *  Electron's own visibility/teardown bookkeeping ("Object has been
 *  destroyed" in BrowserWindow.visibilityChanged). */
const wiredListeners = new WeakMap();

/** Remove exactly the listeners the last wireTabView call installed on this
 *  WebContents, leaving every Electron-owned listener (any name) intact.
 *  This rule also applies immediately before close(): Electron can deliver
 *  queued visibility/teardown work after close has destroyed the native
 *  object, so removeAllListeners() is never safe on a managed WebContents. */
function unwireTabView(wc) {
  for (const [event, handler] of wiredListeners.get(wc) ?? []) {
    wc.removeListener(event, handler);
  }
  wiredListeners.delete(wc);
}

function wireTabView(tab, view, { owner, adopted }) {
  if (!deps) throw new Error('wireTabView called before initTabView');
  const {
    tabs, windowRuntimes, bindWindowRuntime, tabIdByWebContentsId,
    broadcastTabs, scheduleBroadcastTabs, scheduleSampleTint, scheduleMenuRebuild,
    createTab, setActiveTab, closeTab, openInternalPage,
    currentChromeLayout, currentTabBounds, hideOverlay, hasLiveWindow,
    reclaimAddressBarFocus, shouldReclaimAddressBarFocus,
    installChromeShortcuts, watchCursorFor,
    isUtilityUrl, handOffToOs, setTabFavicon,
    isStartupGateActive, startupQueuedNavigations,
    onMainFrameCommit, noteWakeSuppressed, notePopupChild,
    registerPopupCaptureSurface, clearTabCaptureState,
  } = deps;
  const id = tab.id;
  const wc = view.webContents;
  // Snapshot pre-existing listeners so the closing diff records exactly what
  // THIS call adds — Electron's own listeners are never in the recorded set.
  const preWired = new Map(wc.eventNames().map((n) => [n, new Set(wc.listeners(n))]));
  installChromeShortcuts(wc);
  // Resolve the owner once at attach time rather than looking it up in every
  // asynchronous callback. A later rewire supplies the tab's actual owner.
  const boundToTab = (fn) => bindWindowRuntime(owner, fn);
  watchCursorFor(wc, () => currentTabBounds(tab), boundToTab);

  wc.setWebRTCIPHandlingPolicy(webrtcPolicyFor(settings.getSettings().webrtcPolicy));
  if (effectiveTabMuted(tab)) wc.setAudioMuted(true);
  const syncNavState = () => {
    tab.canGoBack = wc.navigationHistory.canGoBack();
    tab.canGoForward = wc.navigationHistory.canGoForward();
    tab.url = wc.getURL();
    tab.bookmarked = bookmarks.isBookmarked(tab.url);
  };

  wc.on('audio-state-changed', boundToTab(() => {
    if (tab.sleeping || tab.view?.webContents !== wc) return;
    tab.audible = wc.isCurrentlyAudible();
    scheduleBroadcastTabs();
  }));
  // pageState carries no media currentTime, so waking a media tab lands at
  // 0:00. Once this document plays media it must not be quieted; only a new
  // main-frame commit clears the signal.
  wc.on('media-started-playing', boundToTab(() => {
    if (tab.sleeping || tab.view?.webContents !== wc) return;
    if (noteMediaStarted(tab, id === owner.activeTabId)) wc.setAudioMuted(true);
  }));
  wc.on('page-title-updated', boundToTab((_e, title) => {
    if (tab.sleeping || tab.view?.webContents !== wc) return;
    tab.title = title;
    if (tab.historyEligible && !noteWakeSuppressed(tab)) history.updateTitle(tab.url, title);
    broadcastTabs();
  }));
  wc.on('page-favicon-updated', boundToTab((_e, favicons) => {
    if (tab.sleeping || tab.view?.webContents !== wc) return;
    const pending = updateFaviconFromPage(tab, favicons, { setTabFavicon })
      .catch(() => false);
    tab.faviconPending = pending;
    pending.finally(() => {
      if (tab.faviconPending !== pending) return;
      tab.faviconPending = null;
      if (tab.sleeping || tab.view?.webContents !== wc) return;
      // Chromium can replay a document's original ICO after the DOM pass chose
      // its SVG. Re-read the settled document and refine only when the source
      // left behind is one of its declared static icons; dynamic page state
      // such as an unread badge keeps winning.
      refineDeclaredStaticFavicon(tab, wc, { setTabFavicon })
        .catch(() => {});
    });
  }));
  wc.on('dom-ready', boundToTab(() => {
    if (tab.sleeping || tab.view?.webContents !== wc) return;
    updateFaviconAfterDomReady(tab, wc, { setTabFavicon })
      .catch(() => {});
  }));
  wc.on('did-start-loading', boundToTab(() => {
    if (tab.sleeping || tab.view?.webContents !== wc) return;
    tab.isLoading = true;
    broadcastTabs();
  }));
  wc.on('did-stop-loading', boundToTab(() => {
    if (tab.sleeping || tab.view?.webContents !== wc) return;
    tab.isLoading = false;
    syncNavState();
    broadcastTabs();
    scheduleSampleTint(tab);
    sync.captureTabIcon(tab).catch(() => {});
  }));
  wc.on('did-change-theme-color', boundToTab((_e, color) => {
    if (tab.sleeping || tab.view?.webContents !== wc) return;
    tab.themeColor = typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color) ? color : null;
    scheduleBroadcastTabs();
  }));
  wc.on('did-navigate', boundToTab((_e, url, httpResponseCode) => {
    if (tab.sleeping || tab.view?.webContents !== wc) return;
    tab.navEpoch++;
    const shouldReclaimChromeFocus = url === tab.url && owner.tabsWantingAddressBarFocus.has(id) && owner.activeTabId === id;
    if (url !== tab.url) owner.tabsWantingAddressBarFocus.delete(id);
    tab.blockedCount = 0;
    tab.pageBg = null;
    tab.themeColor = null;
    if (shouldClearFaviconOnNavigate(tab.url, url)) setTabFavicon(tab, null);
    syncNavState();
    tab.historyEligible = !tab.private && (httpResponseCode ?? 200) < 400;
    onMainFrameCommit(tab, { url, httpResponseCode });
    if (tab.historyEligible && !noteWakeSuppressed(tab)) history.addVisit(url, wc.getTitle());
    broadcastTabs();
    scheduleMenuRebuild();
    if (shouldReclaimChromeFocus) reclaimAddressBarFocus(id);
  }));
  wc.on('did-navigate-in-page', boundToTab((_e, url, isMainFrame) => {
    if (tab.sleeping || tab.view?.webContents !== wc) return;
    if (isMainFrame) tab.navEpoch++;
    // A same-document navigation of the active tab replaces what a fill
    // message was about — dismiss it (runtime-scoped; optional dep).
    if (isMainFrame && id === owner.activeTabId) deps.dismissFillStatusForNavigation?.(owner);
    syncNavState();
    if (isMainFrame && tab.historyEligible && !noteWakeSuppressed(tab)) history.addVisit(url, wc.getTitle());
    broadcastTabs();
    if (isMainFrame) sync.captureTabIcon(tab).catch(() => {});
  }));
  wc.on('did-start-navigation', boundToTab((_e, url, _isInPlace, isMainFrame) => {
    if (tab.sleeping || tab.view?.webContents !== wc) return;
    if (isMainFrame) tab.navEpoch++;
    // Main-frame navigation of the active tab dismisses a visible fill
    // message immediately — a decision must not stay actionable, nor an
    // error notice persist, over the successor page (same posture as the
    // shield dismissal below).
    if (isMainFrame && id === owner.activeTabId) deps.dismissFillStatusForNavigation?.(owner);
    if (
      isMainFrame
      && owner.overlayMode === 'shield'
      && id === owner.activeTabId
      && blockableHostname(url) !== owner.shieldPopoverHost
    ) {
      hideOverlay({ refocusContent: false });
    }
  }));
  wc.once('did-finish-load', boundToTab(() => {
    if (tab.sleeping || tab.view?.webContents !== wc) return;
    if (shouldReclaimAddressBarFocus(id)) reclaimAddressBarFocus(id, { consume: true });
  }));
  wc.on('focus', boundToTab(() => {
    if (tab.sleeping || tab.view?.webContents !== wc) return;
    if (shouldReclaimAddressBarFocus(id)) reclaimAddressBarFocus(id, { consume: true });
  }));

  // Content may not navigate into privileged blanc:// pages. Main-initiated
  // navigation uses loadURL and therefore bypasses this page-initiated guard.
  wc.on('will-navigate', boundToTab((event, targetUrl) => {
    if (tab.sleeping || tab.view?.webContents !== wc) return;
    if (isForbiddenTopLevelUrl(targetUrl)) {
      event.preventDefault();
      return;
    }
    if (isUtilityUrl(targetUrl)) {
      event.preventDefault();
      if (wc.getURL().startsWith('blanc://')) openInternalPage(targetUrl);
      return;
    }
    if (/^blanc:/i.test(targetUrl) && !wc.getURL().startsWith('blanc://')) event.preventDefault();
    if (handOffToOs(targetUrl)) event.preventDefault();
  }));
  // ERR_ABORTED is an ordinary cancelled load. The startup gate deliberately
  // queues HTTP(S) navigation until the blocker is ready, so do not replace
  // that controlled cancellation with an error page.
  wc.on('did-fail-load', boundToTab((_e, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (tab.sleeping || tab.view?.webContents !== wc) return;
    if (noteWakeSuppressed(tab)) return;
    if (!isMainFrame || errorCode === -3 || !validatedURL) return;
    if (isStartupGateActive() && startupQueuedNavigations.has(wc.id) && /^https?:/i.test(validatedURL)) return;
    const q = new URLSearchParams({ url: validatedURL, code: String(errorCode), desc: errorDescription });
    wc.loadURL(`blanc://error/?${q}`).catch(() => {});
  }));
  // Adopted window.open children can die outside closeTab. A sleeping tab
  // deliberately destroys its own view, so it must not prune the tab record.
  wc.once('destroyed', boundToTab(() => {
    if (tab.sleeping) return;
    closeTab(id);
  }));
  wc.on('render-process-gone', boundToTab((_e, details) => {
    if (tab.sleeping || tab.view?.webContents !== wc) return;
    // A dead renderer holds no tracks. Explicit rather than relying on the
    // error page's commit — that loadURL can itself fail (spec §3.2).
    clearTabCaptureState(tab);
    if (details.reason === 'clean-exit') return;
    const q = new URLSearchParams({ url: tab.url, code: details.reason, desc: 'The page crashed' });
    wc.loadURL(`blanc://error/?${q}`).catch(() => {});
  }));
  // Electron's polarity is deliberately inverted: preventing this event lets
  // the underlying unload proceed.
  wc.on('will-prevent-unload', boundToTab((event) => {
    if (tab.sleeping || tab.view?.webContents !== wc) return;
    const choice = dialog.showMessageBoxSync(hasLiveWindow() ? owner.window : undefined, {
      type: 'question',
      buttons: ['Leave', 'Stay'],
      defaultId: 0,
      cancelId: 1,
      message: 'Leave this page?',
      detail: 'Changes you made may not be saved.',
    });
    if (choice === 0) event.preventDefault();
  }));
  wc.on('found-in-page', boundToTab((_e, result) => {
    if (tab.sleeping || tab.view?.webContents !== wc) return;
    if (id === owner.activeTabId) {
      owner.overlayView?.webContents.send('chrome:find-result', {
        activeMatchOrdinal: result.activeMatchOrdinal,
        matches: result.matches,
      });
    }
  }));

  // target=_blank becomes an adopted managed tab; featureful new-window
  // requests (OAuth/SSO and payments) keep a real BrowserWindow so their
  // opener survives. Both paths preserve opener relationships.
  const applyWindowOpenPolicy = (targetWc) => {
    targetWc.setWindowOpenHandler(boundToTab(({ url: targetUrl, disposition }) => {
      if (isForbiddenTopLevelUrl(targetUrl)) return { action: 'deny' };
      if (isUtilityUrl(targetUrl)) {
        if (targetWc.getURL().startsWith('blanc://')) openInternalPage(targetUrl);
        return { action: 'deny' };
      }
      if (/^blanc:/i.test(targetUrl) && !targetWc.getURL().startsWith('blanc://')) return { action: 'deny' };
      if (handOffToOs(targetUrl)) return { action: 'deny' };
      if (disposition === 'new-window') {
        return {
          action: 'allow',
          outlivesOpener: true,
          overrideBrowserWindowOptions: {
            autoHideMenuBar: true,
            webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
          },
        };
      }
      return {
        action: 'allow',
        outlivesOpener: true,
        overrideBrowserWindowOptions: { webPreferences: { plugins: true } },
        createWindow: boundToTab((options) => {
          const childView = new WebContentsView({ webContents: options.webContents });
          // A discarded opener leaves this child's window.opener unusable.
          const newId = createTab(targetUrl, {
            private: tab.private, groupId: tab.groupId, view: childView, openerTabId: tab.id,
          });
          if (disposition !== 'background-tab') setImmediate(() => setActiveTab(newId));
          return childView.webContents;
        }),
      };
    }));
    targetWc.on('did-create-window', boundToTab((childWindow) => {
      const childId = childWindow.webContents.id;
      const isManagedTab = [...tabs.values()].some((candidate) => liveContents(candidate)?.id === childId);
      if (!isManagedTab) {
        applyWindowOpenPolicy(childWindow.webContents);
        notePopupChild(tab.id, childWindow);
        const childWc = childWindow.webContents;
        const childWcId = childWc.id;
        windowRuntimes.registerAuxiliaryContent(owner, childWcId);
        // Alongside — not via — auxiliaryOwner: popup capture state must
        // survive detachWindow on macOS close/reopen (spec §3.3).
        registerPopupCaptureSurface(childWc);
        childWc.once('destroyed', bindWindowRuntime(owner, () => {
          windowRuntimes.unregisterAuxiliaryContent(childWcId);
        }));
      }
    }));
  };
  applyWindowOpenPolicy(wc);
  attachContextMenu(wc, {
    openBackgroundTab: boundToTab((targetUrl) => {
      if (handOffToOs(targetUrl)) return;
      if (isForbiddenTopLevelUrl(targetUrl)) return;
      createTab(targetUrl, { private: tab.private, groupId: tab.groupId });
    }),
    openTab: boundToTab((targetUrl) => {
      if (handOffToOs(targetUrl)) return;
      if (isForbiddenTopLevelUrl(targetUrl)) return;
      setActiveTab(createTab(targetUrl, { private: tab.private, groupId: tab.groupId }));
    }),
  });

  const wired = [];
  for (const name of wc.eventNames()) {
    for (const handler of wc.listeners(name)) {
      if (!preWired.get(name)?.has(handler)) wired.push([name, handler]);
    }
  }
  wiredListeners.set(wc, wired);
}

module.exports = {
  createTabView,
  wireTabView,
  unwireTabView,
  initTabView,
  liveContents,
  liveViewContents,
  TAB_WEB_PREFERENCES,
  configureProfileSessions,
  getNormalBrowsingSession,
  getPrivateBrowsingSession,
  PRIVATE_PARTITION,
};
