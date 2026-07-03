(() => {
  const { platform } = window.browserAPI;
  if (platform === 'darwin') document.body.classList.add('mac');

  const chromeEl = document.getElementById('chrome');
  const tabStrip = document.getElementById('tabStrip');
  const newTabBtn = document.getElementById('newTabBtn');
  const windowControls = document.getElementById('windowControls');
  const backBtn = document.getElementById('backBtn');
  const fwdBtn = document.getElementById('fwdBtn');
  const reloadBtn = document.getElementById('reloadBtn');
  const addressInput = document.getElementById('addressInput');
  const loadingBar = document.getElementById('loadingBar');
  const shieldBadge = document.getElementById('shieldBadge');
  const starBtn = document.getElementById('starBtn');
  const downloadsBtn = document.getElementById('downloadsBtn');
  const downloadsBadge = document.getElementById('downloadsBadge');
  const historyBtn = document.getElementById('historyBtn');
  const settingsBtn = document.getElementById('settingsBtn');
  const actionList = document.getElementById('actionList');

  let tabIndicator = document.getElementById('tabIndicator');
  if (!tabIndicator) {
    tabIndicator = document.createElement('div');
    tabIndicator.id = 'tabIndicator';
    tabStrip.appendChild(tabIndicator);
  }

  let state = { tabs: [], activeTabId: null };
  let addressBarEditing = false;

  // Icon set: 16px grid, 1.5px rounded strokes, currentColor (see styles.css).
  const ICONS = {
    reload: '<svg viewBox="0 0 16 16"><path d="M14 8a6 6 0 1 1-6-6c1.68 0 3.29.67 4.49 1.83L14 5.33"/><path d="M14 2v3.33h-3.33"/></svg>',
    stop: '<svg viewBox="0 0 16 16"><path d="M4.25 4.25l7.5 7.5M11.75 4.25l-7.5 7.5"/></svg>',
    close: '<svg viewBox="0 0 16 16"><path d="M4.75 4.75l6.5 6.5M11.25 4.75l-6.5 6.5"/></svg>',
    minimize: '<svg viewBox="0 0 16 16"><path d="M3.5 8h9"/></svg>',
    maximize: '<svg viewBox="0 0 16 16"><rect x="3.5" y="3.5" width="9" height="9" rx="1"/></svg>',
  };
  reloadBtn.innerHTML = ICONS.reload;

  // While a tab is being dragged we own the strip's DOM order; incoming
  // broadcasts are parked and applied when the drag ends.
  let draggedTabId = null;
  let pendingState = null;

  // --- Window controls (non-mac only; macOS gets native traffic lights) ---
  if (platform !== 'darwin') {
    const mk = (icon, title, onClick, extraClass) => {
      const b = document.createElement('button');
      b.innerHTML = icon;
      b.title = title;
      if (extraClass) b.classList.add(extraClass);
      b.addEventListener('click', onClick);
      return b;
    };
    windowControls.append(
      mk(ICONS.minimize, 'Minimize', () => window.browserAPI.minimizeWindow()),
      mk(ICONS.maximize, 'Maximize / Restore', () => window.browserAPI.maximizeWindow()),
      mk(ICONS.close, 'Close', () => window.browserAPI.closeWindow(), 'close-btn')
    );
  }

  function activeTab() {
    return state.tabs.find((t) => t.id === state.activeTabId) || null;
  }

  const isInternalUrl = (url) => url.startsWith('bowser://') || url.startsWith('file://');
  const isBookmarkable = (url) => /^https?:\/\//.test(url);

  function addressDisplayValue(tab) {
    if (!tab) return '';
    if (tab.url.startsWith('bowser://newtab') || tab.url.startsWith('file://')) return '';
    return tab.url;
  }

  function render() {
    // Tab strip
    tabStrip.querySelectorAll('.tab').forEach((el) => el.remove());
    let activeEl = null;

    for (const tab of state.tabs) {
      const el = document.createElement('div');
      el.className = 'tab' + (tab.id === state.activeTabId ? ' active' : '');
      el.setAttribute('role', 'tab');
      el.dataset.tabId = tab.id;
      el.draggable = true;
      el.title = tab.url && !tab.url.startsWith('bowser://') ? `${tab.title}\n${tab.url}` : tab.title;

      const favicon = document.createElement('div');
      favicon.className =
        'tab-favicon' + (tab.isLoading ? ' loading' : tab.favicon ? ' has-icon' : '');
      if (tab.favicon && !tab.isLoading) favicon.style.backgroundImage = `url("${tab.favicon}")`;

      const title = document.createElement('div');
      title.className = 'tab-title';
      title.textContent = tab.isLoading ? 'Loading…' : (tab.title || 'New Tab');

      const close = document.createElement('div');
      close.className = 'tab-close';
      close.innerHTML = ICONS.close;
      close.addEventListener('click', (e) => {
        e.stopPropagation();
        window.browserAPI.closeTab(tab.id);
      });

      el.append(favicon, title, close);
      el.addEventListener('click', () => window.browserAPI.switchTab(tab.id));
      el.addEventListener('auxclick', (e) => {
        if (e.button === 1) window.browserAPI.closeTab(tab.id); // middle-click closes
      });

      // --- Drag-to-reorder ---
      el.addEventListener('dragstart', (e) => {
        draggedTabId = tab.id;
        el.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', tab.id);
      });
      el.addEventListener('dragend', () => {
        el.classList.remove('dragging');
        const finalIndex = [...tabStrip.querySelectorAll('.tab')].indexOf(el);
        const id = draggedTabId;
        draggedTabId = null;
        if (id) window.browserAPI.reorderTab(id, finalIndex);
        if (pendingState) {
          state = pendingState;
          pendingState = null;
          render();
        }
      });

      tabStrip.insertBefore(el, tabIndicator);
      if (tab.id === state.activeTabId) activeEl = el;
    }

    // Signature active-tab indicator: slide/resize under the active tab
    if (activeEl) {
      tabIndicator.style.width = `${activeEl.offsetWidth}px`;
      tabIndicator.style.transform = `translateX(${activeEl.offsetLeft}px)`;
    }

    // Toolbar state
    const tab = activeTab();
    backBtn.disabled = !tab?.canGoBack;
    fwdBtn.disabled = !tab?.canGoForward;
    loadingBar.classList.toggle('active', !!tab?.isLoading);
    const wantStop = !!tab?.isLoading;
    if (reloadBtn.dataset.mode !== (wantStop ? 'stop' : 'reload')) {
      reloadBtn.dataset.mode = wantStop ? 'stop' : 'reload';
      reloadBtn.innerHTML = wantStop ? ICONS.stop : ICONS.reload;
      reloadBtn.title = wantStop ? 'Stop' : 'Reload';
    }

    const blocked = tab?.blockedCount ?? 0;
    shieldBadge.hidden = blocked === 0;
    shieldBadge.textContent = String(blocked);

    // Point extension toolbar icons (badge counts, popup targets) at the
    // active tab's webContents.
    if (tab?.wcId != null) actionList.setAttribute('tab', String(tab.wcId));

    starBtn.disabled = !tab || !isBookmarkable(tab.url);
    starBtn.classList.toggle('starred', !!tab?.bookmarked);

    if (!addressBarEditing) {
      addressInput.value = addressDisplayValue(tab);
    }
  }

  // Reordering happens live while dragging over the strip: the dragged tab
  // slots in before whichever tab's midpoint the cursor is left of.
  tabStrip.addEventListener('dragover', (e) => {
    if (!draggedTabId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    const draggedEl = tabStrip.querySelector('.tab.dragging');
    if (!draggedEl) return;
    const siblings = [...tabStrip.querySelectorAll('.tab:not(.dragging)')];
    const nextEl = siblings.find((el) => {
      const rect = el.getBoundingClientRect();
      return e.clientX < rect.left + rect.width / 2;
    });
    tabStrip.insertBefore(draggedEl, nextEl ?? tabIndicator);
  });
  tabStrip.addEventListener('drop', (e) => e.preventDefault());

  // Double-click on empty titlebar area zooms the window (desktop convention).
  document.getElementById('titlebar').addEventListener('dblclick', (e) => {
    if (e.target.id === 'titlebar' || e.target.id === 'dragFill' || e.target.id === 'trafficSpacer') {
      window.browserAPI.maximizeWindow();
    }
  });

  // --- Toolbar wiring ---
  newTabBtn.addEventListener('click', () => window.browserAPI.createTab());
  backBtn.addEventListener('click', () => state.activeTabId && window.browserAPI.goBack(state.activeTabId));
  fwdBtn.addEventListener('click', () => state.activeTabId && window.browserAPI.goForward(state.activeTabId));
  reloadBtn.addEventListener('click', () => {
    if (!state.activeTabId) return;
    const tab = activeTab();
    tab?.isLoading ? window.browserAPI.stop(state.activeTabId) : window.browserAPI.reload(state.activeTabId);
  });
  starBtn.addEventListener('click', () => window.browserAPI.toggleBookmark());
  downloadsBtn.addEventListener('click', () => window.browserAPI.openPage('downloads'));
  historyBtn.addEventListener('click', () => window.browserAPI.openPage('history'));
  settingsBtn.addEventListener('click', () => window.browserAPI.openPage('settings'));

  addressInput.addEventListener('focus', () => {
    addressBarEditing = true;
    addressInput.select();
  });
  addressInput.addEventListener('blur', () => {
    addressBarEditing = false;
    render();
  });
  addressInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && state.activeTabId) {
      window.browserAPI.navigate(state.activeTabId, addressInput.value);
      addressInput.blur();
    } else if (e.key === 'Escape') {
      addressInput.blur();
    }
  });

  // --- Downloads badge ---
  function renderDownloads({ activeCount }) {
    downloadsBadge.hidden = activeCount === 0;
    downloadsBadge.textContent = activeCount > 0 ? String(activeCount) : '';
    downloadsBtn.classList.toggle('has-active', activeCount > 0);
  }

  // --- IPC subscriptions ---
  window.browserAPI.onTabsUpdated((payload) => {
    if (draggedTabId) {
      pendingState = payload;
      return;
    }
    state = payload;
    render();
  });
  window.browserAPI.onDownloadsUpdated(renderDownloads);
  window.browserAPI.onFocusAddressBar(() => {
    addressInput.focus();
  });
  window.browserAPI.getAllTabs().then((payload) => {
    state = payload;
    render();
  });
  window.browserAPI.getDownloadsSummary().then(renderDownloads);

  // --- Report chrome height so the main process can size the active
  // WebContentsView to fill exactly the remaining space. ---
  const reportLayout = () => {
    window.browserAPI.reportChromeLayout(chromeEl.getBoundingClientRect().height);
  };
  new ResizeObserver(reportLayout).observe(chromeEl);
  requestAnimationFrame(reportLayout);
})();
