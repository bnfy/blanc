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
const { shouldClearFaviconOnNavigate } = require('./favicon-policy');
const { blockableHostname } = require('./adblock-exceptions');

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
const PRIVATE_PARTITION = 'private-browsing'; // no `persist:` prefix = memory only
const getPrivateBrowsingSession = () =>
  (privateBrowsingSession ??= session.fromPartition(PRIVATE_PARTITION));

/** After wc.close(), view.webContents reads back UNDEFINED, not destroyed —
 *  see main.js's reloadTabAfterSettingsFanout, where this exact dereference
 *  killed main once. Two steps, always: read, then test. */
const liveContents = (tab) => {
  const wc = tab?.view?.webContents;
  return wc && !wc.isDestroyed() ? wc : null;
};

/**
 * The ONLY place a tab's WebContentsView is constructed. Never returns null,
 * never navigates, never registers a listener.
 * @param {{private?: boolean}} tab a tab record, or any object with a boolean
 *   `private`. Safe to call before the record exists (createTab does).
 * @returns {import('electron').WebContentsView}
 */
function createTabView(tab) {
  return new WebContentsView({
    webPreferences: tab?.private
      ? { ...TAB_WEB_PREFERENCES, session: getPrivateBrowsingSession() }
      : TAB_WEB_PREFERENCES,
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
    'currentChromeLayout', 'hideOverlay', 'hasLiveWindow',
    'reclaimAddressBarFocus', 'shouldReclaimAddressBarFocus',
    'installChromeShortcuts', 'watchCursorFor',
    'isUtilityUrl', 'handOffToOs', 'upgradeFavicon',
    'isStartupGateActive', 'startupQueuedNavigations',
    'onMainFrameCommit', 'noteWakeSuppressed', 'notePopupChild',
    'onePasswordSpikeEnabled', 'fillActiveTabFrom1Password',
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
function wireTabView(tab, view, { owner, adopted }) {
  if (!deps) throw new Error('wireTabView called before initTabView');
  const {
    tabs, windowRuntimes, bindWindowRuntime, tabIdByWebContentsId,
    broadcastTabs, scheduleBroadcastTabs, scheduleSampleTint, scheduleMenuRebuild,
    createTab, setActiveTab, closeTab, openInternalPage,
    currentChromeLayout, hideOverlay, hasLiveWindow,
    reclaimAddressBarFocus, shouldReclaimAddressBarFocus,
    installChromeShortcuts, watchCursorFor,
    isUtilityUrl, handOffToOs, upgradeFavicon,
    isStartupGateActive, startupQueuedNavigations,
    onePasswordSpikeEnabled, fillActiveTabFrom1Password,
    onMainFrameCommit, noteWakeSuppressed, notePopupChild,
  } = deps;
  const id = tab.id;
  const wc = view.webContents;
  installChromeShortcuts(wc);
  // Resolve the owner once at attach time rather than looking it up in every
  // asynchronous callback. A later rewire supplies the tab's actual owner.
  const boundToTab = (fn) => bindWindowRuntime(owner, fn);
  watchCursorFor(wc, () => currentChromeLayout().pageBounds, boundToTab);

  // The tab's own webContents receives page-focused keys; the overlay cannot.
  if (onePasswordSpikeEnabled) {
    wc.on('before-input-event', boundToTab((event, input) => {
      if (tab.sleeping || tab.view?.webContents !== wc) return;
      if (input.type !== 'keyDown' || input.isAutoRepeat) return;
      if (input.code !== 'KeyP') return;
      if (!(input.meta && input.alt && !input.control && !input.shift)) return;
      event.preventDefault();
      if (owner.onePasswordFillInFlight) return;
      owner.onePasswordFillInFlight = true;
      fillActiveTabFrom1Password()
        .catch((err) => console.warn('[1p-spike] fill error:', err?.message))
        .finally(() => { owner.onePasswordFillInFlight = false; });
    }));
  }

  wc.setWebRTCIPHandlingPolicy(webrtcPolicyFor(settings.getSettings().webrtcPolicy));
  if (tab.muted) wc.setAudioMuted(true);
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
  wc.on('page-title-updated', boundToTab((_e, title) => {
    if (tab.sleeping || tab.view?.webContents !== wc) return;
    tab.title = title;
    if (tab.historyEligible) history.updateTitle(tab.url, title);
    broadcastTabs();
  }));
  wc.on('page-favicon-updated', boundToTab((_e, favicons) => {
    if (tab.sleeping || tab.view?.webContents !== wc) return;
    tab.favicon = favicons[0] ?? null;
    if (tab.bookmarked) bookmarks.updateFavicon(tab.url, tab.favicon);
    broadcastTabs();
    sync.captureTabIcon(tab).catch(() => {});
    upgradeFavicon(tab);
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
    if (shouldClearFaviconOnNavigate(tab.url, url)) tab.favicon = null;
    syncNavState();
    tab.historyEligible = !tab.private && (httpResponseCode ?? 200) < 400;
    if (tab.historyEligible) history.addVisit(url, wc.getTitle());
    broadcastTabs();
    scheduleMenuRebuild();
    if (shouldReclaimChromeFocus) reclaimAddressBarFocus(id);
  }));
  wc.on('did-navigate-in-page', boundToTab((_e, url, isMainFrame) => {
    if (tab.sleeping || tab.view?.webContents !== wc) return;
    if (isMainFrame) tab.navEpoch++;
    syncNavState();
    if (isMainFrame && tab.historyEligible) history.addVisit(url, wc.getTitle());
    broadcastTabs();
    if (isMainFrame) sync.captureTabIcon(tab).catch(() => {});
  }));
  wc.on('did-start-navigation', boundToTab((_e, url, _isInPlace, isMainFrame) => {
    if (tab.sleeping || tab.view?.webContents !== wc) return;
    if (isMainFrame) tab.navEpoch++;
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
          const newId = createTab(targetUrl, { private: tab.private, groupId: tab.groupId, view: childView });
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
        const childWc = childWindow.webContents;
        const childWcId = childWc.id;
        windowRuntimes.registerAuxiliaryContent(owner, childWcId);
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
      createTab(targetUrl, { private: tab.private, groupId: tab.groupId });
    }),
    openTab: boundToTab((targetUrl) => {
      if (handOffToOs(targetUrl)) return;
      setActiveTab(createTab(targetUrl, { private: tab.private, groupId: tab.groupId }));
    }),
  });
}

module.exports = {
  createTabView,
  wireTabView,
  initTabView,
  liveContents,
  TAB_WEB_PREFERENCES,
  getPrivateBrowsingSession,
  PRIVATE_PARTITION,
};
