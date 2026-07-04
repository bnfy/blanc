// Renderer for the chrome strip — the slim band the resting island pill
// floats in, plus window controls and permission prompts. The island's
// expanded states live in a separate overlay WebContentsView (overlay.js)
// so they can float over the web content.
(() => {
  const { platform } = window.browserAPI;
  const isMac = platform === 'darwin';
  if (isMac) document.body.classList.add('mac');

  const chromeEl = document.getElementById('chrome');
  const stripEl = document.getElementById('strip');
  const islandPill = document.getElementById('islandPill');
  const pillDots = document.getElementById('pillDots');
  const pillFavicon = document.getElementById('pillFavicon');
  const pillDomain = document.getElementById('pillDomain');
  const pillShield = document.getElementById('pillShield');
  const pillPrivateChip = document.getElementById('pillPrivateChip');
  const windowControls = document.getElementById('windowControls');
  const permissionBar = document.getElementById('permissionBar');
  const permissionText = document.getElementById('permissionText');
  const permAllowBtn = document.getElementById('permAllowBtn');
  const permBlockBtn = document.getElementById('permBlockBtn');

  let state = { tabs: [], activeTabId: null };
  /** Overlay mode mirrored from main — the pill hides while the command
   * bar is expanded in place ('panel'); the palette keeps it visible. */
  let islandMode = null;

  const ICONS = {
    close: '<svg viewBox="0 0 16 16"><path d="M4.75 4.75l6.5 6.5M11.25 4.75l-6.5 6.5"/></svg>',
    minimize: '<svg viewBox="0 0 16 16"><path d="M3.5 8h9"/></svg>',
    maximize: '<svg viewBox="0 0 16 16"><rect x="3.5" y="3.5" width="9" height="9" rx="1"/></svg>',
  };

  // --- Window controls (non-mac only; macOS gets native traffic lights) ---
  if (!isMac) {
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

  /** Short label for a tab's location: host for web pages, page name for
   * internal ones, empty for a blank new tab. */
  function tabDomain(tab) {
    if (!tab?.url || tab.url.startsWith('bowser://newtab')) return '';
    try {
      const u = new URL(tab.url);
      return u.protocol === 'bowser:' ? `bowser://${u.host}` : u.host;
    } catch {
      return tab.url;
    }
  }

  function setFavicon(el, tab) {
    el.className = 'favicon' + (tab?.isLoading ? ' loading' : '');
    el.style.backgroundImage = '';
    if (!tab || tab.isLoading) return;
    if (tab.favicon) {
      el.classList.add('has-icon');
      el.style.backgroundImage = `url("${tab.favicon.replace(/[\\"]/g, '\\$&')}")`;
    } else if (tab.url.startsWith('bowser://')) {
      el.classList.add('has-icon');
      el.style.backgroundImage = 'url("pages/icon.svg")'; // Bowser mark
    }
  }

  /** Faux header: paint the strip with the active page's own top-edge
   * color so it reads as a continuation of the site, not a chrome bar.
   * Private tabs keep the private theme untinted. */
  function applyStripTint(tab) {
    const tint = (!tab?.private && (tab?.pageBg || tab?.themeColor)) || null;
    if (!tint) {
      stripEl.style.removeProperty('--page-bg');
      stripEl.classList.remove('tint-dark');
      return;
    }
    stripEl.style.setProperty('--page-bg', tint);
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(tint.slice(i, i + 2), 16));
    stripEl.classList.toggle('tint-dark', 0.299 * r + 0.587 * g + 0.114 * b < 128);
  }

  function render() {
    const tab = activeTab();

    pillDots.replaceChildren(
      ...state.tabs.map((t) => {
        const dot = document.createElement('button');
        dot.className =
          'island-dot' +
          (t.id === state.activeTabId ? ' active' : '') +
          (t.isLoading ? ' loading' : '') +
          (t.private ? ' private' : '');
        dot.title = t.title || 'New Tab';
        dot.setAttribute('aria-label', `Switch to ${t.title || 'New Tab'}`);
        dot.addEventListener('click', (e) => {
          e.stopPropagation(); // switch without expanding
          window.browserAPI.switchTab(t.id);
        });
        return dot;
      })
    );

    setFavicon(pillFavicon, tab);
    pillDomain.textContent = tab?.isLoading
      ? 'Loading…'
      : tabDomain(tab) || (tab?.private ? 'private tab' : 'new tab');
    pillDomain.classList.toggle('dim', !!tab?.isLoading);

    pillPrivateChip.hidden = !tab?.private;

    const blocked = tab?.blockedCount ?? 0;
    pillShield.hidden = blocked === 0;
    pillShield.textContent = String(blocked);

    // The private theme scope follows the active tab.
    if (tab?.private) document.documentElement.dataset.theme = 'private';
    else delete document.documentElement.dataset.theme;

    applyStripTint(tab);

    islandPill.style.visibility = islandMode === 'panel' ? 'hidden' : '';

    // The strip's draggable region is registered at the WINDOW level and
    // hit-tests above every WebContentsView — with the command bar overlay
    // expanded over the strip band, it would swallow clicks meant for the
    // panel's input row (the ✕, nav buttons). Suspend it while overlaid.
    stripEl.classList.toggle('drag-suspended', islandMode === 'panel' || islandMode === 'palette');
  }

  // Quick exit: clicking the pill's private chip closes the private tab.
  pillPrivateChip.addEventListener('click', (e) => {
    e.stopPropagation();
    if (state.activeTabId) window.browserAPI.closeTab(state.activeTabId);
  });

  islandPill.addEventListener('click', () => window.browserAPI.openIsland());
  islandPill.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      window.browserAPI.openIsland();
    }
  });

  // Double-click on empty strip area zooms the window (desktop convention).
  stripEl.addEventListener('dblclick', (e) => {
    if (e.target === stripEl) window.browserAPI.maximizeWindow();
  });

  // --- Permission prompts (one visible at a time, FIFO) ---
  const permissionQueue = [];
  let activePermissionPrompt = null;

  function describePermission({ permission, mediaTypes }) {
    if (permission === 'media') {
      const wantsAudio = mediaTypes.includes('audio');
      const wantsVideo = mediaTypes.includes('video');
      if (wantsAudio && wantsVideo) return 'use your camera and microphone';
      if (wantsVideo) return 'use your camera';
      return 'use your microphone';
    }
    if (permission === 'geolocation') return 'know your location';
    if (permission === 'notifications') return 'show notifications';
    return `use “${permission}”`;
  }

  function showNextPermissionPrompt() {
    activePermissionPrompt = permissionQueue.shift() ?? null;
    permissionBar.hidden = !activePermissionPrompt;
    if (activePermissionPrompt) {
      const host = new URL(activePermissionPrompt.origin).host;
      permissionText.textContent = `${host} wants to ${describePermission(activePermissionPrompt)}`;
    }
  }

  function answerPermissionPrompt(allow) {
    if (!activePermissionPrompt) return;
    window.browserAPI.respondPermission(activePermissionPrompt.id, allow);
    showNextPermissionPrompt();
  }

  permAllowBtn.addEventListener('click', () => answerPermissionPrompt(true));
  permBlockBtn.addEventListener('click', () => answerPermissionPrompt(false));

  window.browserAPI.onPermissionPrompt((payload) => {
    permissionQueue.push(payload);
    if (!activePermissionPrompt) showNextPermissionPrompt();
  });

  // --- State sync ---
  window.browserAPI.onTabsUpdated((payload) => {
    state = payload;
    render();
  });
  window.browserAPI.onIslandState(({ mode }) => {
    islandMode = mode;
    render();
  });
  window.browserAPI.getAllTabs().then((payload) => {
    state = payload;
    render();
  });

  // --- Report strip height so main can size tab views below it. ---
  const reportLayout = () => {
    window.browserAPI.reportChromeLayout(chromeEl.getBoundingClientRect().height);
  };
  new ResizeObserver(reportLayout).observe(chromeEl);
  requestAnimationFrame(reportLayout);
})();
