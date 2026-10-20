// Renderer for the chrome strip — the slim band the resting island pill
// floats in, plus window controls. The island's
// expanded states live in a separate overlay WebContentsView (overlay.js)
// so they can float over the web content.
(() => {
  const { platform } = window.browserAPI;
  const isMac = platform === 'darwin';
  document.documentElement.dataset.platform = platform;
  // The floating Island (auto-hide, float style) runs this document again in
  // small views above the page, each showing one element of the strip.
  const floatSurface = window.location.hostname === 'float';
  if (floatSurface) document.documentElement.dataset.surface = 'float';
  // Window coordinates of an element: its place on the strip stage (#chrome).
  // The strip's stage sits at the window's origin; a float view's stage is
  // shifted by the view's origin and, mid-slide, by the slide.
  const stageRect = (el) => {
    const r = el.getBoundingClientRect();
    const stage = document.getElementById('chrome').getBoundingClientRect();
    const left = r.left - stage.left;
    const top = r.top - stage.top;
    return { x: left, y: top, left, top, right: left + r.width, bottom: top + r.height, width: r.width, height: r.height };
  };
  if (isMac) document.body.classList.add('mac');

  // Tooltips for the strip's buttons (the pill, the Glance header, the side
  // list). Each carries data-tooltip rather than a native title, like the
  // overlay's (overlay.js islandTip), so the two look and time alike. The
  // strip is only 68px tall and the page view covers anything past it, so
  // main draws the tip in its own small view (tooltip.html): this measures it
  // with the same .island-tip styles and asks main to float it under the
  // button. Visual only; each button's aria-label already says the same.
  const stripTipMeasure = document.createElement('div');
  stripTipMeasure.className = 'island-tip';
  stripTipMeasure.setAttribute('aria-hidden', 'true');
  document.body.append(stripTipMeasure);
  const STRIP_TIP_DELAY_MS = 350;
  let stripTipTarget = null;
  let stripTipTimer = 0;
  let stripTipShown = false;
  let stripTipPointer = null;

  function showStripTip(el) {
    const text = el.dataset.tooltip;
    if (!text || !el.isConnected) return;
    stripTipMeasure.textContent = text;
    const tip = stripTipMeasure.getBoundingClientRect();
    const box = stageRect(el);
    window.browserAPI.showTooltip({
      text,
      anchor: { x: box.x, y: box.y, width: box.width, height: box.height },
      width: tip.width,
      height: tip.height,
      privateTheme: document.documentElement.dataset.theme === 'private',
    });
    stripTipShown = true;
  }

  function hideStripTip() {
    clearTimeout(stripTipTimer);
    stripTipTarget = null;
    if (!stripTipShown) return;
    stripTipShown = false;
    window.browserAPI.hideTooltip();
  }

  function aimStripTip(el, delay) {
    if (el === stripTipTarget) return;
    hideStripTip();
    if (!el || !el.dataset.tooltip) return;
    stripTipTarget = el;
    if (delay) stripTipTimer = setTimeout(() => showStripTip(el), delay);
    else showStripTip(el);
  }

  document.addEventListener('pointermove', (e) => {
    stripTipPointer = { x: e.clientX, y: e.clientY };
    aimStripTip(e.target.closest?.('[data-tooltip]') || null, STRIP_TIP_DELAY_MS);
  });
  document.documentElement.addEventListener('pointerleave', () => {
    stripTipPointer = null;
    hideStripTip();
  });
  document.addEventListener('pointerdown', hideStripTip, true);
  document.addEventListener('focusin', (e) => {
    const el = e.target.closest?.('[data-tooltip]');
    if (el && el.matches(':focus-visible')) aimStripTip(el, 0);
  });
  document.addEventListener('focusout', (e) => {
    if (e.target === stripTipTarget) hideStripTip();
  });
  // The strip redraws its buttons on every tab update: carry the tip over to
  // whatever button now sits under a still pointer, and keep a shown tip's
  // text current (a download count, Reload turning into Stop).
  new MutationObserver((mutations) => {
    if (!stripTipTarget) return;
    if (!stripTipTarget.isConnected) {
      const shown = stripTipShown;
      const under = stripTipPointer
        && document.elementFromPoint(stripTipPointer.x, stripTipPointer.y)?.closest('[data-tooltip]');
      hideStripTip();
      if (under) aimStripTip(under, shown ? 0 : STRIP_TIP_DELAY_MS);
    } else if (stripTipShown && mutations.some((m) => m.target === stripTipTarget && m.type === 'attributes')) {
      showStripTip(stripTipTarget);
    }
  }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-tooltip'] });

  // Right-click opens the pill's unified menu, or a vertical-rail row's tab
  // menu (both native, built in main). Everywhere else on the strip — window
  // controls, empty drag band — shows nothing. Rail rows record their tab id
  // at event time (same mechanism as the overlay's rows): main reads the id
  // instead of hit-testing coordinates the strip may have re-rendered under.
  document.addEventListener('contextmenu', (e) => {
    // The Glance header's title and empty area address the reference tab;
    // its buttons are controls and open nothing.
    const onGlanceHeader = !!e.target.closest('#glanceHeader') && !e.target.closest('button');
    window.__blancCtxRowTabId =
      e.target.closest('.vertical-tab-row[data-tab-id]')?.dataset.tabId
      ?? (onGlanceHeader ? state.glanceTabId : null)
      ?? null;
    // A rail group header opens its group menu (tab group colors spec §6).
    const groupHeader = window.__blancCtxRowTabId == null
      ? e.target.closest('.vertical-tabs-group-row')?.querySelector('.vertical-tabs-group-header[data-group-id]')
      : null;
    if (groupHeader) {
      e.preventDefault();
      window.blancRailGroupMenu?.open(groupHeader.dataset.groupId);
      return;
    }
    if (!e.target.closest('#islandPill') && window.__blancCtxRowTabId == null) {
      e.preventDefault();
    }
  });

  const chromeEl = document.getElementById('chrome');
  const stripEl = document.getElementById('strip');
  const islandPill = document.getElementById('islandPill');
  const pillDots = document.getElementById('pillDots');
  const pillNav = document.getElementById('pillNav');
  const pillActions = document.getElementById('pillActions');
  const pillFavicon = document.getElementById('pillFavicon');
  const pillDomain = document.getElementById('pillDomain');
  const pillSlash = document.getElementById('pillSlash');
  const pillShortcuts = document.getElementById('pillShortcuts');
  const pillFillHint = document.getElementById('pillFillHint');
  const fillHintLabel = blancI18n.t('pill.fillHint', {
    shortcut: isMac ? '⌥⌘P' : `${blancI18n.t('key.ctrl')}+${blancI18n.t('key.shift')}+P`,
  });
  pillFillHint.dataset.tooltip = fillHintLabel;
  pillFillHint.setAttribute('aria-label', fillHintLabel);
  const pillShield = document.getElementById('pillShield');
  const pillShieldCount = document.getElementById('pillShieldCount');
  const pillSpace = document.getElementById('pillSpace');
  const pillSpaceSymbol = document.getElementById('pillSpaceSymbol');
  const pillSpaceName = document.getElementById('pillSpaceName');
  const pillCapture = document.getElementById('pillCapture');
  const pillCaptureMic = document.getElementById('pillCaptureMic');
  const pillCaptureCam = document.getElementById('pillCaptureCam');
  const pillDisplayShare = document.getElementById('pillDisplayShare');
  const pillInsecure = document.getElementById('pillInsecure');
  const pillPrivateChip = document.getElementById('pillPrivateChip');
  const pillSourceChip = document.getElementById('pillSourceChip');
  const windowControls = document.getElementById('windowControls');
  const mainMenuButton = document.getElementById('mainMenuButton');
  const glanceHeader = document.getElementById('glanceHeader');
  const glanceFavicon = document.getElementById('glanceFavicon');
  const glanceTitle = document.getElementById('glanceTitle');
  const glancePrivate = document.getElementById('glancePrivate');
  const glanceIdentity = document.querySelector('#glanceHeader .glance-tab-identity');
  let shownGlanceTabId = null;
  const glancePromote = document.getElementById('glancePromote');
  const glanceChange = document.getElementById('glanceChange');
  const glanceClose = document.getElementById('glanceClose');
  const glanceBack = document.getElementById('glanceBack');
  const glanceReload = document.getElementById('glanceReload');
  const glanceDivider = document.getElementById('glanceDivider');
  const glanceStatus = document.getElementById('glanceStatus');

  let state = {
    tabs: [],
    activeTabId: null,
    glanceTabId: null,
    groups: [],
    tabLayout: 'island',
  };
  let glanceLayout = null;
  let glanceResizeState = null;
  let glanceResizeFrame = 0;
  let queuedGlancePoint = null;
  /** Optimistic ratio for keyboard resizing: key repeat outruns the
   * main-process layout echo, so consecutive keydowns step from here rather
   * than recomputing every step from the same stale layout. */
  let glanceKeyRatio = null;
  /** Overlay mode mirrored from main — the pill hides while the command
   * bar is expanded in place ('panel'); the palette keeps it visible. */
  let islandMode = null;
  /** Resolved app appearance pushed by main before prefers-color-scheme has
   * propagated. Cleared as soon as the media query catches up so --bg remains
   * the canonical steady-state color. */
  let pendingThemeAppearance = null;
  let themeHandoffPending = false;
  const darkSchemeQuery = window.matchMedia('(prefers-color-scheme: dark)');

  const ICONS = {
    close: '<svg viewBox="0 0 16 16"><path d="M4.75 4.75l6.5 6.5M11.25 4.75l-6.5 6.5"/></svg>',
    minimize: '<svg viewBox="0 0 16 16"><path d="M3.5 8h9"/></svg>',
    maximize: '<svg viewBox="0 0 16 16"><rect x="3.5" y="3.5" width="9" height="9" rx="1"/></svg>',
  };

  // Shared by the downloads button's own glyph and its submerged copy in the
  // cistern, which must be the same drawing at a different size.
  const DOWNLOAD_D = 'M8 2.5v6.5M5.3 6.3 8 9l2.7-2.7M3.5 12.5h9';
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const PILL_ICONS = {
    back: '<svg viewBox="0 0 16 16"><path d="M9.75 3.5 5.25 8l4.5 4.5"/></svg>',
    forward: '<svg viewBox="0 0 16 16"><path d="M6.25 3.5 10.75 8l-4.5 4.5"/></svg>',
    plus: '<svg viewBox="0 0 16 16"><path d="M8 3v10M3 8h10"/></svg>',
    reload: '<svg viewBox="0 0 16 16"><path d="M12.42 10.35a5 5 0 1 1-4.42-7.35c1.4 0 2.74.56 3.74 1.53L13 5.78"/><path d="M13 3v2.78h-2.78"/></svg>',
    // Deliberately NOT an ✕ (which is what most browsers use for stop): the
    // pill's trailing cluster already ends in the close-tab ✕, so a loading
    // tab drew a second, near-identical ✕ two buttons away from it. The ring
    // is the reload arc's own r=5, so the glyph doesn't change size when the
    // two swap; the filled square inside reads as an action rather than
    // progress, which the favicon slot's spinner (.favicon.loading) already
    // carries a centimetre to the left.
    stop: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="5"/><rect class="stop-mark" x="6.05" y="6.05" width="3.9" height="3.9" rx="0.8"/></svg>',
    heart: '<svg viewBox="0 0 16 16"><path d="M8 13.25C4.6 11 2.75 8.9 2.75 6.6a2.85 2.85 0 0 1 5.25-1.54A2.85 2.85 0 0 1 13.25 6.6c0 2.3-1.85 4.4-5.25 6.65z"/></svg>',
    download: `<svg viewBox="0 0 16 16"><path d="${DOWNLOAD_D}"/></svg>`,
    // The only ✕ in the pill; see `stop` above. Drawn 8 units across — larger
    // than the panel row's close (overlay.js ICONS.close) — so it carries the
    // same optical weight as its neighbours, reload's r=5 ring and the heart,
    // instead of reading a size smaller beside them.
    close: '<svg viewBox="0 0 16 16"><path d="M4 4l8 8M12 4l-8 8"/></svg>',
  };

  // The reference header reuses the pill's own back and reload glyphs.
  glanceBack.innerHTML = PILL_ICONS.back;
  glanceReload.innerHTML = PILL_ICONS.reload;
  glanceReload.dataset.mode = 'reload';

  /** A quiet icon button for the pill. stopPropagation keeps a click on the
   * button from bubbling to the pill (which would open the panel). */
  function pillButton(iconKey, title, onClick) {
    const b = document.createElement('button');
    b.className = 'pill-btn';
    b.innerHTML = PILL_ICONS[iconKey];
    b.dataset.tooltip = title;
    b.setAttribute('aria-label', title);
    // Don't let a mouse click focus the button. Reload (and friends) retain
    // focus after a click since they don't navigate away; a later keypress
    // then flips :focus-visible on and paints a stray circular ring
    // (border-radius:50%) in the resting pill. preventDefault on mousedown
    // keeps the focus ring for keyboard (Tab) users only, where it belongs.
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
    return b;
  }

  const backBtn = pillButton('back', blancI18n.t('pill.back'), () => state.activeTabId && window.browserAPI.goBack(state.activeTabId));
  const forwardBtn = pillButton('forward', blancI18n.t('pill.forward'), () => state.activeTabId && window.browserAPI.goForward(state.activeTabId));
  pillNav.append(backBtn, forwardBtn);

  const newTabShortcut = window.browserAPI.platform === 'darwin' ? '⌘T' : `${blancI18n.t('key.ctrl')}+T`;
  const newTabBtn = pillButton('plus', blancI18n.t('pill.newTab.title', { shortcut: newTabShortcut }), () => {
    window.browserAPI.createTab(null, { focusAddress: true });
  });
  newTabBtn.id = 'pillNewTab';
  newTabBtn.classList.add('pill-shortcut');
  newTabBtn.setAttribute('aria-label', blancI18n.t('tab.new'));
  pillSlash.after(newTabBtn);
  const reloadBtn = pillButton('reload', blancI18n.t('pill.reload'), () => {
    const t = activeTab();
    if (!t) return;
    if (t.isLoading) window.browserAPI.stop(t.id);
    else window.browserAPI.reload(t.id);
  });
  const favoriteBtn = pillButton('heart', blancI18n.t('pill.favorite'), () => window.browserAPI.toggleBookmark());
  // The first controls to give way in a slim Island (fitIslandDots); both
  // stay reachable from ⌘L, the menus and the keyboard.
  forwardBtn.classList.add('pill-slim-hide');
  favoriteBtn.classList.add('pill-slim-hide');
  const closeBtn = pillButton('close', blancI18n.t('pill.closeTab'), () => {
    if (state.activeTabId) window.browserAPI.closeTab(state.activeTabId);
  });
  closeBtn.classList.add('pill-close');
  pillActions.append(reloadBtn, favoriteBtn, closeBtn);

  let downloadState = { active: 0, hasRecent: false, receivedBytes: 0, totalBytes: 0 };
  const downloadsBtn = pillButton('download', blancI18n.t('pill.downloads'), () => {
    window.browserAPI.openPage('downloads');
    window.browserAPI.acknowledgeDownloads();
  });
  downloadsBtn.classList.add('pill-download');
  downloadsBtn.hidden = true;
  pillActions.append(downloadsBtn);

  // The cistern: while a download is in flight the button fills like a vessel,
  // its surface a pair of drifting waves, and the glyph goes under as the level
  // rises. Built with DOM methods rather than innerHTML — the markup is static,
  // so there's no injection today, but this document holds browserAPI and an
  // HTML sink in it isn't worth three lines of convenience.
  const svgEl = (tag, attrs) => {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
  };
  const span = (cls) => {
    const el = document.createElement('span');
    el.className = cls;
    return el;
  };
  // A 6-period sine on a 240×20 box, midline y=10, closed below into a slab so
  // the crest reads as the fluid's surface rather than a floating line.
  const WAVE_D = 'M0 10 Q 10 0 20 10 T 40 10 T 60 10 T 80 10 T 100 10 T 120 10 T 140 10 T 160 10 T 180 10 T 200 10 T 220 10 T 240 10 V 21 H 0 Z';
  const wave = (cls) => {
    const svg = svgEl('svg', {
      class: `dl-wave ${cls}`,
      viewBox: '0 0 240 20',
      preserveAspectRatio: 'none',
      'aria-hidden': 'true',
    });
    svg.append(svgEl('path', { d: WAVE_D }));
    return svg;
  };

  const fluid = span('dl-fluid');
  fluid.append(wave('w1'), wave('w2'));
  const vessel = span('dl-vessel');
  vessel.append(fluid);
  const under = span('dl-under');
  const underGlyph = svgEl('svg', { viewBox: '0 0 16 16', 'aria-hidden': 'true' });
  underGlyph.append(svgEl('path', { d: DOWNLOAD_D }));
  under.append(underGlyph);
  downloadsBtn.append(span('dl-glass'), vessel, under);

  // The download-complete sequence, per the design handoff's PORT-CHECKLIST:
  // the waves still at a full vessel, a check pops out of a solid accent disc
  // for ~3s, and then the vessel stays *held full* until the downloads page is
  // opened — it does not fall back to the idle glyph. Without this the level,
  // being derived from in-flight bytes, dropped to zero the instant `active`
  // emptied, so finishing a download drained the vessel.
  const DL_CHECK_MS = 3000;
  let lastCompletionSeen = null;
  let checkTimer = null;

  // A check knocked out of the disc: the disc paints --accent and sets its own
  // color to --surface-raised, so the stroke reads as a hole in it.
  const doneDisc = span('dl-done-disc');
  const checkGlyph = svgEl('svg', { viewBox: '0 0 16 16', 'aria-hidden': 'true' });
  checkGlyph.append(svgEl('path', { d: 'M3.5 8.5l3 3 6-6.5' }));
  doneDisc.append(checkGlyph);
  downloadsBtn.append(doneDisc);

  function renderDownloads() {
    const { active, hasRecent, receivedBytes, totalBytes, lastCompletedAt } = downloadState;
    const wasHidden = downloadsBtn.hidden;
    downloadsBtn.hidden = !(active > 0 || hasRecent);
    // The button takes or gives back room in the Island.
    if (downloadsBtn.hidden !== wasHidden) fitIslandDots();
    downloadsBtn.classList.toggle('active', active > 0);

    // Keyed off the timestamp changing rather than `active` falling to 0, so a
    // cancelled download never borrows the finished one's celebration. No
    // first-observation guard is needed or wanted: main holds lastCompletedAt
    // in memory and starts every launch at null, so any value at all belongs to
    // this session — suppressing the first would cost every session its first
    // completion, which is the common case of exactly one.
    if (lastCompletedAt && lastCompletedAt !== lastCompletionSeen) {
      lastCompletionSeen = lastCompletedAt;
      // A download still running behind this one keeps the vessel live; the
      // check belongs to the moment the last of them lands.
      if (active === 0) {
        clearTimeout(checkTimer);
        downloadsBtn.classList.add('dl-check');
        checkTimer = setTimeout(() => {
          checkTimer = null;
          downloadsBtn.classList.remove('dl-check');
        }, DL_CHECK_MS);
      }
    }

    // Held full is the resting state for an unacknowledged completed download,
    // so it keys off hasRecent rather than a timer — main clears that when the
    // downloads page opens, which is exactly step 4 of the sequence.
    const heldFull = hasRecent && active === 0;
    downloadsBtn.classList.toggle('dl-done', heldFull);
    if (!heldFull && checkTimer) {
      clearTimeout(checkTimer);
      checkTimer = null;
      downloadsBtn.classList.remove('dl-check');
    }

    const pct = heldFull
      ? 1
      : active > 0 && totalBytes > 0 ? Math.min(1, receivedBytes / totalBytes) : 0;
    downloadsBtn.style.setProperty('--dl-progress', String(pct));

    downloadsBtn.dataset.tooltip = active > 0
      ? blancI18n.t('pill.downloading', { count: active })
      : heldFull ? blancI18n.t('pill.downloadDone') : blancI18n.t('pill.downloads');
    downloadsBtn.setAttribute('aria-label', downloadsBtn.dataset.tooltip);
  }
  renderDownloads();

  // --- Window controls (non-mac only; macOS gets native traffic lights) ---
  if (!isMac) {
    let mainMenuOpen = false;
    mainMenuButton.hidden = false;
    mainMenuButton.addEventListener('click', async () => {
      if (mainMenuOpen) return;
      const rect = stageRect(mainMenuButton);
      mainMenuOpen = true;
      mainMenuButton.setAttribute('aria-expanded', 'true');
      try {
        await window.browserAPI.openMainMenu({ x: rect.left, y: rect.bottom });
      } finally {
        mainMenuOpen = false;
        mainMenuButton.setAttribute('aria-expanded', 'false');
      }
    });

    const mk = (icon, title, onClick, extraClass) => {
      const b = document.createElement('button');
      b.innerHTML = icon;
      b.title = title;
      if (extraClass) b.classList.add(extraClass);
      b.addEventListener('click', onClick);
      return b;
    };
    windowControls.append(
      mk(ICONS.minimize, blancI18n.t('window.minimize'), () => window.browserAPI.minimizeWindow()),
      mk(ICONS.maximize, blancI18n.t('window.maximize'), () => window.browserAPI.maximizeWindow()),
      mk(ICONS.close, blancI18n.t('window.close'), () => window.browserAPI.closeWindow(), 'close-btn')
    );
  }

  function activeTab() {
    return state.tabs.find((t) => t.id === state.activeTabId) || null;
  }

  function glanceTab() {
    return state.tabs.find((t) => t.id === state.glanceTabId) || null;
  }

  /** The page URL behind a `view-source:` URL, else null. Chromium's
   * view-source: is a non-special scheme, so `new URL(...).host` is '' and
   * the pill would fall back to the literal "new tab".
   * (Keep in sync with overlay.js.) */
  function viewSourceTarget(url) {
    if (!url?.startsWith('view-source:')) return null;
    // A bare "view-source:" has no page behind it — null, not '', so callers
    // can trust a truthy result to be a URL worth parsing.
    return url.slice('view-source:'.length) || null;
  }

  /** Short label for a tab's location: host for web pages, page name for
   * internal ones, empty for a blank new tab. */
  function tabDomain(tab) {
    if (!tab?.url || tab.url.startsWith('blanc://newtab')) return '';
    try {
      const u = new URL(viewSourceTarget(tab.url) ?? tab.url);
      return u.protocol === 'blanc:' ? `blanc://${u.host}` : u.host;
    } catch {
      return tab.url;
    }
  }


  /** Which of the three things the pill's label is showing right now. */
  function pillLabelMode(tab) {
    if (tab?.isLoading) return 'loading';
    return tabDomain(tab) ? 'domain' : 'placeholder';
  }

  // No transition guard here, deliberately. The placeholder's motion is a CSS
  // animation on #pillDomain itself — an element that is never recreated — so
  // the ~10/s tabs:updated broadcasts cannot restart it. (The caret this
  // replaced WAS a child element, and rebuilding it each broadcast did restart
  // its animation, which is what the removed guard existed for.) Writing
  // textContent replaces a text node inside the animated element; it does not
  // touch the animation. classList.toggle with an unchanged force value is a
  // no-op, so the class does not churn either.
  function renderPillLabel(tab) {
    const next = pillLabelMode(tab);
    pillDomain.textContent = next === 'loading' ? blancI18n.t('tab.loading')
      : next === 'domain' ? tabDomain(tab)
        : blancI18n.t('pill.placeholder');
    // A host name is page data, not interface copy (pseudo-locale sweep).
    pillDomain.toggleAttribute('data-i18n-ignore', next === 'domain');
    pillDomain.classList.toggle('dim', next === 'loading');
    pillDomain.classList.toggle('placeholder', next === 'placeholder');
    pillSlash.hidden = next !== 'placeholder';
  }

  function faviconFallbackLabel(tab) {
    try {
      const host = new URL(tab?.url || '').hostname.replace(/^www\./i, '');
      return Array.from(host)[0]?.toUpperCase() || '•';
    } catch {
      return '•';
    }
  }

  function setFavicon(el, tab, base = 'favicon') {
    el.className = base + (tab?.isLoading ? ' loading' : '');
    el.style.backgroundImage = '';
    el.textContent = '';
    if (!tab || tab.isLoading) return;
    if (tab.url.startsWith('blanc://')) {
      // CSS supplies the reviewed internal-page artwork consistently across
      // the resting pill, glance picker, overlay rows, and dot peeks.
      el.classList.add('internal');
    } else if (tab.favicon) {
      el.classList.add('has-icon');
      el.style.backgroundImage = `url("${tab.favicon.replace(/[\\"]/g, '\\$&')}")`;
    } else {
      // A site with no usable image still gets a recognizable identity instead
      // of the old anonymous gray box. The real favicon replaces this on the
      // next tabs:updated broadcast if a later candidate succeeds.
      el.classList.add('fallback');
      el.textContent = faviconFallbackLabel(tab);
    }
  }

  /** True when the pill's trailing controls run past its far edge. Compares
   * the trailing inset with the leading one, so it needs no knowledge of the
   * pill's padding or zoom. */
  function pillOverflows() {
    const pill = islandPill.getBoundingClientRect();
    const first = [...islandPill.children].find((element) => element.getBoundingClientRect().width > 0);
    if (!first) return false;
    const inset = first.getBoundingClientRect().left - pill.left;
    return pill.right - pillActions.getBoundingClientRect().right < inset - 1;
  }

  /** The page's address is cut short. Only a real address counts: the
   * placeholder and the loading label may truncate like any hint. */
  function addressTruncated() {
    if (pillDomain.classList.contains('placeholder') || pillDomain.classList.contains('dim')) return false;
    return pillDomain.scrollWidth > pillDomain.clientWidth + 1;
  }

  /** When the pill is narrower than its contents (a narrow Glance main
   * pane), the address keeps priority and the rest gives way in order: fewer
   * dots, with the rest folded into +N (the active tab always keeps its
   * dot); then, with one dot left, Forward and Favorite hide. Only then may
   * the address truncate; the Glance divider stops before it gets unreadable
   * (measureGlanceFloors). Any change to the room or to what the Island shows
   * starts again from the full Island, so it grows back when room returns;
   * when nothing changed, the last fit stands and nothing is measured. */
  function fitIslandDots() {
    const key = islandFitKey();
    const refit = key !== dotFitKey;
    if (refit) {
      dotFitKey = key;
      dotBudget = DOT_CAP;
      islandPill.classList.remove('slim', 'uncentred');
    } else if (dotsSignature() === lastDotsSig) {
      return;
    }
    // With vertical tabs or Glance the dot row is not drawn, so fewer dots
    // free nothing.
    const dotsShown = state.tabLayout !== 'vertical' && !stripEl.classList.contains('glance-open');
    // Stacked on Windows and Linux (the platforms with window controls on
    // the strip's right edge) the Island is centred between two reservations
    // for them (styles.css); when even the slim Island does not fit, it gives
    // up its centre line before its address.
    const canUncentre = stripEl.dataset.glanceDirection === 'vertical'
      && document.documentElement.dataset.platform !== 'darwin';
    for (;;) {
      renderDotRow();
      if (!pillOverflows() && !addressTruncated()) break;
      if (dotsShown && dotBudget > 1) dotBudget -= 1;
      else if (!islandPill.classList.contains('slim')) islandPill.classList.add('slim');
      else if (canUncentre && !islandPill.classList.contains('uncentred')) islandPill.classList.add('uncentred');
      else break;
    }
    if (refit) measureGlanceFloors();
  }

  /** Everything the fit depends on except the dots themselves: the room the
   * stylesheet gives the pill (styles.css #islandPill max-width rules follow
   * the window, the platform, the rail and Glance — read from those inputs,
   * not the computed max-width, which the fit's own .uncentred changes),
   * which chips are showing, and the address. Not the blocked count: it is a
   * badge over the shield and takes no width. No layout. */
  function islandFitKey() {
    const root = document.documentElement;
    const shown = [...islandPill.children, ...pillShortcuts.children, ...pillActions.children]
      .map((element) => (element.hidden ? 0 : 1)).join('');
    return [
      // A float view copies a strip of the window's width, not its own.
      floatSurface ? root.style.getPropertyValue('--float-stage-width') : window.innerWidth,
      root.dataset.platform, state.tabLayout, root.style.getPropertyValue('--vertical-tabs-w'),
      stripEl.dataset.glanceDirection ?? '', stripEl.style.getPropertyValue('--glance-primary-width'),
      shown, state.tabs.length, state.activeTabId, pillDomain.textContent,
    ].join('|');
  }

  // The interface fonts load with font-display: swap, so a fit made before
  // they arrive was measured in the fallback. Every label changes width when
  // they swap in, with nothing in the fit key changing: fit again from scratch.
  document.fonts.addEventListener('loadingdone', () => {
    dotFitKey = '';
    fitIslandDots();
    glanceHeaderFitKey = '';
    fitGlanceHeader();
    requestAnimationFrame(() => reportIslandRect());
  });

  /** Only rebuild the dot row when the dots themselves change — not on every
   * blocked-count broadcast. Rebuilding tears down each dot's peek span and
   * any keyboard focus on it. */
  function renderDotRow() {
    const dotsSig = dotsSignature();
    if (dotsSig !== lastDotsSig) {
      lastDotsSig = dotsSig;
      pillDots.replaceChildren(...islandDots());
    }
  }

  /** The pill's on-screen width without the proximity swell (reportIslandRect
   * applies the same correction). */
  function pillWidth() {
    const k = islandPill.classList.contains('shield-open') || islandPill.classList.contains('spaces-open') ? 0 : Number(islandPill.style.getPropertyValue('--island-k')) || 0;
    return islandPill.getBoundingClientRect().width / (1 + ISLAND_SCALE * k);
  }

  /** With Glance side by side, measure the two minimums main stops the
   * divider at. The main pane's: the slim Island (no Forward or Favorite, and
   * no dot row: Glance hides it) with about ten characters of address, plus
   * the clearance the stylesheet gives the Island in this layout. The
   * reference's: the Glance header at its most compact, with the padding the
   * stylesheet gives it (which reserves the window controls on Windows and
   * Linux). Measured on the live elements, so every chip, label and language
   * counts and the spacing stays defined in one place (styles.css). */
  function measureGlanceFloors() {
    if (glanceLayout?.direction !== 'horizontal' || !islandPill.getBoundingClientRect().width) return;
    // The room the stylesheet allows: a filler grows the pill to its max-width.
    const filler = document.createElement('span');
    filler.className = 'island-measure-filler';
    islandPill.append(filler);
    const room = pillWidth();
    filler.remove();
    const wasSlim = islandPill.classList.contains('slim');
    islandPill.classList.add('slim', 'measuring');
    const needed = pillWidth();
    islandPill.classList.remove('measuring');
    islandPill.classList.toggle('slim', wasSlim);
    islandFloor = Math.ceil(glanceLayout.primary.width - room + needed);
    glanceHeader.classList.add('measuring');
    const header = glanceHeader.getBoundingClientRect().width;
    glanceHeader.classList.remove('measuring');
    referenceFloor = Math.ceil(header - glanceLayout.divider.width);
  }

  /** With Glance open the fill chip follows the focused pane, like the fill. */
  function renderFillHint() {
    const hintTab = glanceLayout?.focusedPane === 'glance' ? glanceTab() : activeTab();
    pillFillHint.hidden = !(hintTab?.fillHint === true
      && typeof window.browserAPI.fillLoginFromOnePassword === 'function');
  }

  function renderGlance() {
    const tab = glanceTab();
    const visible = !!tab && !!glanceLayout;
    glanceHeader.hidden = !visible;
    glanceDivider.hidden = !visible;
    stripEl.classList.toggle('glance-open', visible);
    if (!visible) {
      stripEl.style.removeProperty('--glance-primary-right');
      stripEl.style.removeProperty('--glance-primary-width');
      delete stripEl.dataset.glanceDirection;
      shownGlanceTabId = null;
      fitGlanceHeader();
      return;
    }

    const { primary, glanceHeader: header, divider, page, direction, ratio } = glanceLayout;
    // Side by side the Island sits over the main pane; stacked, the main
    // pane is the full page width.
    const chromePrimaryRight = direction === 'horizontal'
      ? primary.x + primary.width
      : page.x + page.width;
    stripEl.dataset.glanceDirection = direction;
    stripEl.style.setProperty('--glance-primary-right', `${chromePrimaryRight}px`);
    stripEl.style.setProperty('--glance-primary-width', `${chromePrimaryRight - page.x}px`);
    glanceDivider.dataset.direction = direction;
    glanceDivider.style.left = `${divider.x}px`;
    glanceDivider.style.top = `${divider.y}px`;
    glanceDivider.style.width = `${divider.width}px`;
    glanceDivider.style.height = `${divider.height}px`;
    glanceDivider.setAttribute('aria-orientation', direction === 'horizontal' ? 'vertical' : 'horizontal');
    glanceDivider.setAttribute('aria-valuenow', String(Math.round(ratio * 100)));
    glanceDivider.setAttribute('aria-valuemin', String(Math.round((glanceLayout.minRatio ?? 0.5) * 100)));
    glanceDivider.setAttribute('aria-valuemax', String(Math.round((glanceLayout.maxRatio ?? 0.78) * 100)));
    glanceDivider.setAttribute('aria-valuetext', blancI18n.t('glance.dividerValue', { percent: Math.round(ratio * 100) }));

    glanceHeader.style.left = `${header.x}px`;
    glanceHeader.style.top = `${header.y}px`;
    glanceHeader.style.width = `${header.width}px`;
    glanceHeader.style.height = `${header.height}px`;
    glanceHeader.dataset.direction = direction;
    glanceHeader.classList.toggle('private', !!tab.private);
    glanceHeader.classList.toggle('focused', glanceLayout.focusedPane === 'glance');
    // A different reference (Make main, Change): the favicon, title and chip
    // cross-fade over 120 ms (styles.css .swapping) instead of changing in
    // one frame. The panes themselves swap at once.
    if (shownGlanceTabId != null && shownGlanceTabId !== tab.id) {
      glanceIdentity.classList.add('swapping');
      requestAnimationFrame(() => requestAnimationFrame(() => glanceIdentity.classList.remove('swapping')));
    }
    shownGlanceTabId = tab.id;
    setFavicon(glanceFavicon, tab);
    glancePrivate.hidden = !tab.private;
    glanceBack.disabled = !tab.canGoBack;
    const glanceReloadMode = tab.isLoading ? 'stop' : 'reload';
    if (glanceReload.dataset.mode !== glanceReloadMode) {
      glanceReload.dataset.mode = glanceReloadMode;
      glanceReload.innerHTML = PILL_ICONS[glanceReloadMode];
      const label = blancI18n.t(glanceReloadMode === 'stop' ? 'pill.stop' : 'pill.reload');
      glanceReload.dataset.tooltip = label;
      glanceReload.setAttribute('aria-label', label);
    }
    // Keep an already-known title visible while the reference navigates —
    // same rule as the picker rows: replacing useful identity with a generic
    // loading label makes the header useless on slow or long-lived loads.
    glanceTitle.textContent = tab.title || tabDomain(tab)
      || (tab.isLoading ? blancI18n.t('tab.loading') : tab.private ? blancI18n.t('tab.privateLabel') : blancI18n.t('tab.new'));
    glanceHeader.title = tab.title || glanceTitle.textContent;
    fitGlanceHeader();
  }

  // The title is what the header is for. Before it is cut below about ten
  // characters, Make main gives up its label for its swap icon (its name and
  // tooltip stay). Measured, not a fixed width, because the label's length
  // depends on the language and Windows and Linux reserve the window
  // controls' width. 70 px is the floor the Island keeps for its address
  // too. Measured only when an input changed (the title, the header's width
  // or direction, the font swap), not on every broadcast.
  let glanceHeaderFitKey = '';
  function fitGlanceHeader() {
    const titleFloor = 70;
    const key = glanceHeader.hidden ? '' : [glanceTitle.textContent, glanceHeader.style.width, glanceHeader.dataset.direction].join('|');
    if (key === glanceHeaderFitKey) return;
    glanceHeaderFitKey = key;
    glanceHeader.classList.remove('promote-icon');
    if (glanceHeader.hidden) return;
    // At the narrowest tier the stylesheet hides the title altogether; Make
    // main is icon-only there too.
    if (glanceTitle.getClientRects().length === 0) { glanceHeader.classList.add('promote-icon'); return; }
    const cut = glanceTitle.scrollWidth > glanceTitle.clientWidth + 1;
    if (cut && glanceTitle.getBoundingClientRect().width < titleFloor) glanceHeader.classList.add('promote-icon');
  }

  function queueGlanceResize(point) {
    queuedGlancePoint = point;
    if (glanceResizeFrame) return;
    glanceResizeFrame = requestAnimationFrame(() => {
      glanceResizeFrame = 0;
      const queued = queuedGlancePoint;
      queuedGlancePoint = null;
      if (queued) window.browserAPI.resizeGlance(queued);
    });
  }

  function pointForGlanceRatio(ratio) {
    if (!glanceLayout) return null;
    const { page, direction, divider, glanceHeader: header } = glanceLayout;
    return direction === 'horizontal'
      ? { x: page.x + (page.width - divider.width) * ratio, y: page.y }
      : { x: page.x, y: page.y + (page.height - divider.height - header.height) * ratio };
  }

  /** Faux header: paint the strip with the active page's own top-edge
   * color so it reads as a continuation of the site, not a chrome bar.
   * Private tabs take only a sampled Start Page wallpaper (main samples
   * nothing else for them); a private site's theme-color never tints. */
  function applyStripTint(tab) {
    if (floatSurface) return;
    // A theme handoff invalidates the previous website sample. Ignore any
    // stale tabs:updated payload still in flight until main clears/resamples it.
    const tint = (!themeHandoffPending && (tab?.private ? tab.pageBg : (tab?.pageBg || tab?.themeColor))) || null;
    if (!tint) {
      // Private keeps its dedicated token scope. For ordinary tabs, paint the
      // newly selected theme immediately instead of waiting for Electron to
      // propagate prefers-color-scheme into this renderer.
      const optimisticBg = tab?.private
        ? 'var(--bg)'
        : ({ light: '#ffffff', dark: '#0e0e0e' }[pendingThemeAppearance] ?? 'var(--bg)');
      // The normal strip transition is for site-to-site faux-header changes.
      // A theme preview should land in this interaction frame, not animate
      // for another transition after the command has already completed.
      stripEl.classList.toggle('theme-optimistic', !tab?.private && themeHandoffPending);
      stripEl.style.setProperty('--page-bg', optimisticBg);
      // On Windows/Linux the window controls use the current theme tokens.
      // Keep their dark-background treatment in step with the early strip
      // paint while those tokens are still catching up.
      stripEl.classList.toggle('tint-dark', pendingThemeAppearance === 'dark');
      return;
    }
    stripEl.classList.remove('theme-optimistic');
    stripEl.style.setProperty('--page-bg', tint);
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(tint.slice(i, i + 2), 16));
    stripEl.classList.toggle('tint-dark', 0.299 * r + 0.587 * g + 0.114 * b < 128);
  }

  function themeAppearanceMatchesMedia(appearance) {
    return darkSchemeQuery.matches === (appearance === 'dark');
  }

  function releaseOptimisticThemeAppearance() {
    if (!pendingThemeAppearance || !themeAppearanceMatchesMedia(pendingThemeAppearance)) return;
    pendingThemeAppearance = null;
    themeHandoffPending = false;
    applyStripTint(activeTab());
  }

  window.browserAPI.onThemeAppearance((appearance) => {
    if (appearance === 'pending') {
      // "System" cannot be resolved until main removes an explicit override.
      // Disable the strip transition now; a resolved appearance follows.
      pendingThemeAppearance = null;
      themeHandoffPending = true;
      applyStripTint(activeTab());
      return;
    }
    if (appearance !== 'light' && appearance !== 'dark') return;
    // If Chromium won the race, use the tokenized CSS immediately. Otherwise
    // bridge only the gap until matchMedia's change event below releases it.
    pendingThemeAppearance = themeAppearanceMatchesMedia(appearance) ? null : appearance;
    themeHandoffPending = !!pendingThemeAppearance;
    applyStripTint(activeTab());
  });
  darkSchemeQuery.addEventListener('change', releaseOptimisticThemeAppearance);

  const DOT_CAP = 8;
  /** How many dots fit right now: DOT_CAP, or fewer when the pill is too
   * narrow for its controls (fitIslandDots). */
  let dotBudget = DOT_CAP;
  let dotFitKey = '';
  /** The last measured main-pane minimum (measureGlanceFloors), reported to
   * main with the Island's rectangle. */
  let islandFloor = null;
  /** The last measured reference minimum (the compact Glance header). */
  let referenceFloor = null;

  /** The resting Island is current context, not a false total-tab map:
   * standalone pins stay globally reachable, followed by the active section
   * (named group, loose tabs, or the pinned shelf itself). Every node remains
   * one real tab. A window-wide +N accounts for everything not directly shown.
   *
   * Eight is a hard total budget. When pins + the active section exceed it,
   * retain the active tab, then as many standalone pins as fit, then use the
   * remaining slots for an active-containing window of the current section.
   * Quiet state is deliberately irrelevant: discarding a renderer must not
   * make its tab disappear, move, or churn the dot DOM. */
  function islandTabPresentation() {
    const tab = activeTab();
    if (!tab) return { pinned: [], section: [], shown: [], hidden: 0 };

    const standalonePins = state.tabs.filter((t) => t.pinned && !t.groupId);
    const activeIsStandalonePin = tab.pinned && !tab.groupId;

    const activeWindow = (members, capacity) => {
      if (members.length <= capacity) return members;
      const activeIdx = Math.max(0, members.indexOf(tab));
      const start = activeIdx < capacity
        ? 0
        : Math.min(activeIdx - (capacity - 1), members.length - capacity);
      return members.slice(start, start + capacity);
    };

    // The pinned shelf is already the active section in this case. Return it
    // as one set so no artificial section gap or duplicate active dot appears.
    if (activeIsStandalonePin) {
      const pinned = activeWindow(standalonePins, dotBudget);
      return {
        pinned,
        section: [],
        shown: pinned,
        hidden: Math.max(0, state.tabs.length - pinned.length),
      };
    }

    // Reserve one slot for the active tab before applying pinned-first
    // priority. Any additional standalone pins remain included in +N.
    const pinned = standalonePins.slice(0, Math.max(0, dotBudget - 1));
    // The active tab's group, or its run of ungrouped tabs (tab-sections.js:
    // ungrouped tabs between groups form separate runs, spec 2026-10-17).
    const byId = new Map(state.tabs.map((t) => [t.id, t]));
    const sectionMembers = (TabSections.sectionsOf(state.tabs)
      .find((entry) => entry.tabIds.includes(tab.id))?.tabIds ?? [tab.id])
      .map((id) => byId.get(id));
    const section = activeWindow(sectionMembers, dotBudget - pinned.length);
    const shown = [...pinned, ...section];
    return {
      pinned,
      section,
      shown,
      hidden: Math.max(0, state.tabs.length - shown.length),
    };
  }

  function islandDots() {
    const { pinned, section, hidden } = islandTabPresentation();
    const pinnedNodes = pinned.map(tabDot);
    const sectionNodes = section.map(tabDot);
    if (pinnedNodes.length && sectionNodes.length) sectionNodes[0].classList.add('dot-section-start');
    const nodes = [...pinnedNodes, ...sectionNodes];
    if (hidden > 0) {
      const more = document.createElement('button');
      more.className = 'pill-overflow';
      more.textContent = `+${hidden}`;
      more.dataset.tooltip = blancI18n.t('pill.moreTabs', { count: hidden });
      more.setAttribute('aria-label', more.dataset.tooltip);
      more.addEventListener('click', (e) => { e.stopPropagation(); window.browserAPI.openIsland(); });
      nodes.push(more);
    }
    return nodes;
  }

  /** Everything the dot row's DOM depends on, as a string. Deliberately omits
   * blockedCount (the shield owns it): tab loads emit ~10 tabs:updated/s that
   * only bump blocked counts, and rebuilding the row on each would restart a
   * hovered peek's reveal and drop keyboard focus off a focused dot. */
  function dotsSignature() {
    const { pinned, shown, hidden } = islandTabPresentation();
    return JSON.stringify({
      // The first active-section dot gains spacing after the pinned set, so a
      // pin/group move can change the DOM even if the visible ids do not.
      pinnedCount: pinned.length,
      shown: shown.map((t) => ({
        id: t.id,
        active: t.id === state.activeTabId,
        loading: t.isLoading,
        private: t.private,
        // A colored group's dots take its color (tab group colors spec §5).
        color: t.groupId ? (state.groups || []).find((g) => g.id === t.groupId)?.color ?? null : null,
        title: t.title || 'untitled',
        // While loading, setFavicon deliberately ignores both URL and favicon;
        // omit them here too so an irrelevant favicon event cannot churn the
        // row before the loading state changes.
        favicon: t.isLoading
          ? 'loading'
          : t.url?.startsWith('blanc://')
            ? 'internal'
            : t.favicon || 'fallback',
      })),
      hidden,
    });
  }
  let lastDotsSig = null;

  function tabDot(t) {
    const dot = document.createElement('button');
    // Stable identity lets trusted chrome tests and future focus restoration
    // address a dot without relying on page titles, which are not unique.
    dot.dataset.tabId = t.id;
    // A colored group's dots take its color (tab group colors spec §5).
    const dotGroup = t.groupId ? (state.groups || []).find((g) => g.id === t.groupId) : null;
    dot.className =
      'island-dot' +
      (t.id === state.activeTabId ? ' active' : '') +
      (t.isLoading ? ' loading' : '') +
      (t.private ? ' private' : '');
    TabSections.paintGroup(dot, dotGroup, 'dot-group-colored');
    const dotTitle = t.title || blancI18n.t('tab.untitled');
    dot.dataset.tooltip = dotTitle;
    // A tab title is page data, not interface copy (pseudo-locale sweep).
    if (t.title) dot.dataset.i18nIgnore = '';
    // A dot is a switch target, not a status field: quiet is carried by the
    // row-level dim on the panel row and rail, never on the dot.
    dot.setAttribute('aria-label', blancI18n.t('dot.switchTo', { title: dotTitle }));
    // Hover/focus peek: the dot blooms into its tab's favicon so you can tell
    // which site it holds before switching. Reuses the pill favicon rendering
    // (has-icon / internal / loading / fallback); the native title tooltip
    // still carries the exact page title a beat later.
    const peek = document.createElement('span');
    setFavicon(peek, t, 'dot-peek favicon');
    dot.appendChild(peek);
    dot.addEventListener('click', (e) => {
      e.stopPropagation(); // switch without expanding
      window.browserAPI.switchTab(t.id);
    });
    return dot;
  }

  // ---- Blanc Spaces mark (F41) ----
  // The strip reads the same projection as the Spaces menu and only draws the
  // current space's mark: its symbol and name on its colour, the grey Spaces
  // planet (SpaceIdentity.SPACES_GLYPH) when this window is in no space,
  // nothing before the first space exists.
  let spaces = { items: [], tint: 'mark' };
  let markedSpace = { id: null, index: -1 };
  let spaceMarkPainted = false;
  function symbolSvg(elements) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    for (const [tag, attrs] of elements) {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
      svg.append(node);
    }
    return svg;
  }
  function chromeTheme() {
    if (document.documentElement.dataset.theme === 'private') return 'private';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  // The menu lines up with the mark but hangs from the Island's bottom edge,
  // so it never covers the Island (spec D18).
  function spacesAnchor() {
    return { left: stageRect(pillSpace).left, bottom: stageRect(islandPill).bottom };
  }
  function renderSpaceMark() {
    const items = Array.isArray(spaces.items) ? spaces.items : [];
    const index = items.findIndex((w) => w.active);
    const bound = index >= 0 ? items[index] : null;
    const state = bound ? 'space' : items.length ? 'neutral' : 'none';
    const widthBefore = pillSpace.hidden ? 0 : pillSpace.getBoundingClientRect().width;
    pillSpace.hidden = state === 'none';
    pillSpace.dataset.state = state;
    islandPill.classList.toggle('has-space', state === 'space');
    document.documentElement.dataset.spaceTint = spaces.tint || 'mark';
    if (bound) {
      // The quiet mark: the space's exact colour fills the square behind its
      // symbol (white or black on it); data-edge outlines a colour that would
      // vanish into the Island. The band wash is only for the dev tint switch.
      const theme = chromeTheme();
      const painted = SpaceIdentity.paint(bound.color, theme) ?? SpaceIdentity.paint(SpaceIdentity.PRESETS[0].hex, theme);
      pillSpace.style.setProperty('--space-fill', painted.fill);
      pillSpace.style.setProperty('--space-on', painted.on);
      pillSpace.dataset.edge = String(painted.edge);
      document.documentElement.style.setProperty('--space-band-wash', SpaceIdentity.wash(painted.fill, theme));
      pillSpace.dataset.tooltip = blancI18n.t('spaces.mark.current', { name: bound.name });
    } else {
      pillSpace.style.removeProperty('--space-fill');
      pillSpace.style.removeProperty('--space-on');
      delete pillSpace.dataset.edge;
      document.documentElement.style.removeProperty('--space-band-wash');
      pillSpace.dataset.tooltip = blancI18n.t('footer.workspaces');
    }
    pillSpace.setAttribute('aria-label', pillSpace.dataset.tooltip);
    const symbol = bound ? (SpaceIdentity.isSymbol(bound.symbol) ? bound.symbol : SpaceIdentity.SYMBOL_IDS[0]) : 'neutral';
    if (pillSpaceSymbol.dataset.symbol !== symbol) {
      pillSpaceSymbol.replaceChildren(symbolSvg(bound ? SpaceIdentity.SYMBOLS[symbol] : SpaceIdentity.SPACES_GLYPH));
      pillSpaceSymbol.dataset.symbol = symbol;
    }
    pillSpaceName.textContent = bound?.name ?? '';
    const next = { id: bound?.id ?? null, index };
    if (spaceMarkPainted && next.id !== markedSpace.id) animateSpaceSwitch(markedSpace.index, index, widthBefore);
    markedSpace = next;
    spaceMarkPainted = true;
  }
  // A switch slides the new mark in from the side it comes from in the list
  // (moving down the list, content moves up) while the page cluster follows
  // and the mark settles to its new width — critically damped, no overshoot.
  // Reduce Motion keeps only a cross-fade.
  function animateSpaceSwitch(fromIndex, toIndex, widthBefore) {
    const easing = 'cubic-bezier(.2, .9, .25, 1)';
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      for (const node of [pillSpaceSymbol, pillSpaceName]) node.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' });
      return;
    }
    const dir = toIndex > fromIndex ? 1 : -1;
    for (const node of [pillSpaceSymbol, pillSpaceName]) {
      node.animate([{ transform: `translateY(${7 * dir}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 300, easing });
    }
    for (const node of [pillDots, pillFavicon, pillDomain]) {
      node.animate([{ transform: `translateX(${10 * dir}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 300, easing });
    }
    const widthAfter = pillSpace.hidden ? 0 : pillSpace.getBoundingClientRect().width;
    if (widthBefore && widthAfter && widthBefore !== widthAfter) {
      pillSpace.animate([{ width: `${widthBefore}px` }, { width: `${widthAfter}px` }], { duration: 320, easing });
    }
  }
  function applySpaces(payload) {
    spaces = payload && Array.isArray(payload.items) ? payload : { items: [], tint: 'mark' };
    renderSpaceMark();
  }
  window.browserAPI.listWorkspaces().then(applySpaces, () => {});
  window.browserAPI.onWorkspacesUpdated(applySpaces);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', renderSpaceMark);
  // Pressing the mark while its menu is open closes the menu: the press takes
  // focus from the overlay, whose blur closes it before the click arrives. The
  // click then says so, and main never reopens it (a blink).
  let pressedWhileOpen = false;
  pillSpace.addEventListener('pointerdown', () => { pressedWhileOpen = pillSpace.getAttribute('aria-expanded') === 'true'; });
  pillSpace.addEventListener('mousedown', (e) => e.preventDefault());
  pillSpace.addEventListener('click', (e) => {
    e.stopPropagation(); // the pill's own click opens the ⌘L panel
    const closing = pressedWhileOpen; pressedWhileOpen = false;
    window.browserAPI.openSpacesMenu({ ...spacesAnchor(), closing });
  });

  function render() {
    requestAnimationFrame(() => reportIslandRect());
    // The rail is a presentation of this same trusted payload, not another
    // tab store. Its module also applies the layout attribute/width used to
    // center the resting Island over the remaining website pane.
    window.blancVerticalTabs?.render(state);

    const tab = activeTab();

    backBtn.disabled = !tab?.canGoBack;
    forwardBtn.disabled = !tab?.canGoForward;
    const reloadMode = tab?.isLoading ? 'stop' : 'reload';
    if (reloadBtn.dataset.mode !== reloadMode) {
      reloadBtn.dataset.mode = reloadMode;
      reloadBtn.innerHTML = PILL_ICONS[reloadMode];
      reloadBtn.dataset.tooltip = reloadMode === 'stop' ? blancI18n.t('pill.stop') : blancI18n.t('pill.reload');
      reloadBtn.setAttribute('aria-label', reloadBtn.dataset.tooltip);
    }
    // Nothing to close with no tabs. This has to ride the tab render pass:
    // renderDownloads() only runs on download broadcasts, so a session with
    // no downloads would never re-evaluate it.
    closeBtn.hidden = !state.tabs.length;

    // Favorites only apply to real web pages (blanc:// and private tabs are
    // no-ops in main), so mirror the overlay and disable the heart otherwise.
    const favoritable = /^https?:\/\//.test(tab?.url || '');
    favoriteBtn.disabled = !favoritable;
    favoriteBtn.classList.toggle('on', favoritable && !!tab?.bookmarked);
    favoriteBtn.dataset.tooltip = tab?.bookmarked ? blancI18n.t('pill.unfavorite') : blancI18n.t('pill.favorite');
    favoriteBtn.setAttribute('aria-label', favoriteBtn.dataset.tooltip);

    // The dot row is fitted after renderGlance below: the pill's width
    // depends on the Glance geometry it applies.

    setFavicon(pillFavicon, tab);
    renderPillLabel(tab);

    // tab.connection is main's single derivation (null while loading, so the
    // old page's security state can't linger under a "Loading…" domain).
    const securityWarning = ['insecure', 'certificate-error', 'certificate-exception'].includes(tab?.siteInfo?.state);
    pillInsecure.hidden = !securityWarning;
    pillInsecure.dataset.tooltip = tab?.siteInfo?.title ?? blancI18n.t('pill.insecure.fallback');
    pillInsecure.setAttribute('aria-label', blancI18n.t('pill.insecure.open', { title: pillInsecure.dataset.tooltip }));

    pillPrivateChip.hidden = !tab?.private;
    // A view-source tab is opened fresh, so Back is dead and the island has
    // no per-tab close control — without this chip the tab is a dead end.
    // Suppressed on a private tab (view-source inherits the opener's privacy):
    // the private chip already closes the tab, and two adjacent ✕ chips doing
    // the same thing is noise.
    pillSourceChip.hidden = !viewSourceTarget(tab?.url) || !!tab?.private;

    // Fill-hint chip (spec §5): the active tab declared an authoritative
    // login form and 1Password fill is configured. Click = the normal
    // explicit fill — an invitation, never an action. Gated on the API
    // existing so Windows/Linux never surface it.
    renderFillHint();

    // Shield chip: state fully derived in main (shield-model.js) and shipped
    // on the broadcast — the strip only renders. Always present on a page
    // with a blockable host, so the popover entry point never vanishes.
    const shield = tab?.shield ?? { mode: 'hidden', count: 0, title: '' };
    pillShield.hidden = shield.mode === 'hidden';
    pillShield.classList.toggle('shield-off', shield.mode === 'off');
    pillShield.classList.toggle('shield-quiet', shield.mode === 'quiet');
    pillShield.classList.toggle('shield-restarting', shield.mode === 'restarting');
    pillShieldCount.textContent = shield.mode === 'count' ? String(shield.count) : '';
    pillShield.dataset.tooltip = shield.title;
    pillShield.setAttribute('aria-label', shield.title);

    // Capture chip: WINDOW-WIDE — lit while any tab or popup captures
    // (spec §6.1), unlike every per-active-tab neighbour in the pill.
    const cap = state.captureChip ?? { audio: false, video: false };
    pillCapture.hidden = !cap.audio && !cap.video;
    // toggleAttribute, not .hidden — SVGElement has no hidden IDL property,
    // so the property form silently does nothing on these glyphs.
    pillCaptureMic.toggleAttribute('hidden', !cap.audio);
    pillCaptureCam.toggleAttribute('hidden', !cap.video);
    const capTitle = cap.audio && cap.video ? blancI18n.t('capture.both')
      : cap.video ? blancI18n.t('capture.camera') : blancI18n.t('capture.microphone');
    pillCapture.dataset.tooltip = capTitle;
    pillCapture.setAttribute('aria-label', capTitle);

    // Display-share chip: WINDOW-WIDE — pending picker or active share on
    // any tab in this window, including a backgrounded sharing tab.
    const shares = state.displayShares ?? [];
    pillDisplayShare.hidden = shares.length === 0;
    const shareTitle = shares.length !== 1 ? blancI18n.t('share.count', { count: shares.length })
      : shares[0].pending ? blancI18n.t('share.choosing')
        : shares[0].surfaceLabel ? blancI18n.t('share.sharing', { surface: shares[0].surfaceLabel })
          : blancI18n.t('share.sharingScreen');
    pillDisplayShare.dataset.tooltip = shareTitle;
    pillDisplayShare.setAttribute('aria-label', shareTitle);

    // The private theme scope follows the active tab.
    if (tab?.private) document.documentElement.dataset.theme = 'private';
    else delete document.documentElement.dataset.theme;
    // The space mark's ink depends on that theme, so it is drawn after it.
    renderSpaceMark();

    applyStripTint(tab);
    renderGlance();
    fitIslandDots();

    // The strip's draggable region is registered at the WINDOW level and
    // hit-tests above every WebContentsView — with the command bar overlay
    // expanded over the strip band, it would swallow clicks meant for the
    // panel's input row (the ✕, nav buttons). Suspend it while overlaid.
    stripEl.classList.toggle('drag-suspended', islandMode === 'panel' || islandMode === 'palette');
  }

  // Quick exit: either chip closes the active tab — the private chip leaves
  // private mode, the source chip is the way back out of a page-source tab
  // (whose Back is dead). One shared handler so the two can't drift apart.
  for (const chip of [pillPrivateChip, pillSourceChip]) {
    chip.addEventListener('click', (e) => {
      e.stopPropagation();
      if (state.activeTabId) window.browserAPI.closeTab(state.activeTabId);
    });
  }

  // The chip toggles the site-protection popover; stopPropagation keeps the
  // pill's own click (open panel) out of it. Enter/Space come free — it's a
  // real <button>, and islandPill's keydown guard ignores focused children.
  function shieldAnchorFor(trigger) {
    const button = trigger === 'insecure' ? pillInsecure : pillShield;
    const r = stageRect(button);
    return { right: r.right, center: r.left + r.width / 2, bottom: r.bottom, trigger };
  }
  pillShield.addEventListener('click', (e) => {
    e.stopPropagation();
    window.browserAPI.openShieldPopover(shieldAnchorFor('shield'));
  });

  pillFillHint.addEventListener('click', (e) => {
    e.stopPropagation();
    window.browserAPI.fillLoginFromOnePassword?.();
  });

  // The not-secure badge is the popover's second door — same room, anchored
  // under whichever control was clicked. Enter/Space come free (real button).
  pillInsecure.addEventListener('click', (e) => {
    e.stopPropagation();
    if (activeTab()?.siteInfo?.state === 'certificate-error') {
      window.browserAPI.openIsland();
      return;
    }
    window.browserAPI.openShieldPopover(shieldAnchorFor('insecure'));
  });

  pillCapture.addEventListener('click', (e) => {
    e.stopPropagation();
    const r = stageRect(pillCapture);
    window.browserAPI.openCapturePopover({ right: r.right });
  });

  pillDisplayShare.addEventListener('click', (e) => {
    e.stopPropagation();
    const r = stageRect(pillDisplayShare);
    window.browserAPI.openCapturePopover({ right: r.right });
  });

  glanceBack.addEventListener('click', (event) => {
    event.stopPropagation();
    if (state.glanceTabId) window.browserAPI.goBack(state.glanceTabId);
  });
  glanceReload.addEventListener('click', (event) => {
    event.stopPropagation();
    if (!state.glanceTabId) return;
    if (glanceReload.dataset.mode === 'stop') window.browserAPI.stop(state.glanceTabId);
    else window.browserAPI.reload(state.glanceTabId);
  });
  glancePromote.addEventListener('click', (event) => {
    event.stopPropagation();
    window.browserAPI.promoteGlance();
  });
  glanceChange.addEventListener('click', (event) => {
    event.stopPropagation();
    window.browserAPI.openGlancePicker();
  });
  glanceClose.addEventListener('click', (event) => {
    event.stopPropagation();
    window.browserAPI.closeGlance();
  });

  glanceDivider.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || !glanceLayout) return;
    event.preventDefault();
    // Main maps the reported point to the divider's leading edge, so report
    // the pointer minus where inside the grip it went down — otherwise the
    // first move jumps the divider by that much.
    const rect = glanceDivider.getBoundingClientRect();
    glanceResizeState = {
      pointerId: event.pointerId,
      grabOffset: glanceLayout.direction === 'horizontal'
        ? event.clientX - rect.left
        : event.clientY - rect.top,
    };
    glanceDivider.setPointerCapture(event.pointerId);
    document.documentElement.dataset.glanceResizing = glanceLayout.direction;
  });
  function glanceDragPoint(event) {
    return glanceLayout?.direction === 'horizontal'
      ? { x: event.clientX - glanceResizeState.grabOffset, y: event.clientY }
      : { x: event.clientX, y: event.clientY - glanceResizeState.grabOffset };
  }
  glanceDivider.addEventListener('pointermove', (event) => {
    if (!glanceResizeState || glanceResizeState.pointerId !== event.pointerId) return;
    queueGlanceResize(glanceDragPoint(event));
  });
  const finishGlanceResize = (event) => {
    if (!glanceResizeState || glanceResizeState.pointerId !== event.pointerId) return;
    queueGlanceResize(glanceDragPoint(event));
    glanceResizeState = null;
    delete document.documentElement.dataset.glanceResizing;
    if (glanceDivider.hasPointerCapture(event.pointerId)) {
      glanceDivider.releasePointerCapture(event.pointerId);
    }
  };
  glanceDivider.addEventListener('pointerup', finishGlanceResize);
  glanceDivider.addEventListener('pointercancel', finishGlanceResize);
  glanceDivider.addEventListener('lostpointercapture', () => {
    glanceResizeState = null;
    delete document.documentElement.dataset.glanceResizing;
  });
  glanceDivider.addEventListener('dblclick', (event) => {
    event.preventDefault();
    window.browserAPI.resetGlance();
  });
  glanceDivider.addEventListener('keydown', (event) => {
    if (!glanceLayout) return;
    let next = glanceKeyRatio ?? glanceLayout.ratio;
    const step = event.shiftKey ? 0.05 : 0.02;
    const minRatio = glanceLayout.minRatio ?? 0.5;
    const maxRatio = glanceLayout.maxRatio ?? 0.78;
    if (event.key === 'Home') next = minRatio;
    else if (event.key === 'End') next = maxRatio;
    else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      glanceKeyRatio = null;
      window.browserAPI.resetGlance();
      return;
    } else if (
      (glanceLayout.direction === 'horizontal' && event.key === 'ArrowLeft') ||
      (glanceLayout.direction === 'vertical' && event.key === 'ArrowUp')
    ) next -= step;
    else if (
      (glanceLayout.direction === 'horizontal' && event.key === 'ArrowRight') ||
      (glanceLayout.direction === 'vertical' && event.key === 'ArrowDown')
    ) next += step;
    else return;
    event.preventDefault();
    glanceKeyRatio = Math.max(minRatio, Math.min(maxRatio, next));
    const point = pointForGlanceRatio(glanceKeyRatio);
    if (point) window.browserAPI.resizeGlance(point);
  });

  islandPill.addEventListener('click', () => window.browserAPI.openIsland());
  islandPill.addEventListener('keydown', (e) => {
    // Only when the pill itself is focused — a focused child button (tab
    // dot, folded group capsule) must keep its own Enter/Space activation.
    if (e.target !== islandPill) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      window.browserAPI.openIsland();
      return;
    }
    // Typing while the pill has keyboard focus goes where the caret says it
    // does. Extended here rather than in a second listener so the pill's
    // activation semantics stay in one place.
    if (!globalThis.blancTypeToOpen.isTypeToOpenKey(e, isMac)) return;
    e.preventDefault();
    window.browserAPI.openIslandTyping(e.key);
  });

  // The "/" chip. stopPropagation keeps the click off the pill, which would
  // otherwise also open the panel — with no prefill, landing on the tab
  // switcher instead of the command list. mousedown preventDefault keeps the
  // focus ring for keyboard users only, same as pillButton.
  pillSlash.addEventListener('mousedown', (e) => e.preventDefault());
  pillSlash.addEventListener('click', (e) => {
    e.stopPropagation();
    window.browserAPI.openIslandCommands();
  });

  // Double-click on empty strip area zooms the window (desktop convention).
  // Not in a float view: its bare strip is the margin around its one element.
  stripEl.addEventListener('dblclick', (e) => {
    if (e.target === stripEl && !floatSurface) window.browserAPI.maximizeWindow();
  });
  // The covered strip's top band zooms the window the same way.
  const dragBand = document.getElementById('dragBand');
  dragBand.addEventListener('dblclick', () => window.browserAPI.maximizeWindow());

  // Permission prompts render in their own floating bottom-center view
  // (permission.html/permission.js) — the strip no longer hosts them.

  // --- State sync ---
  window.browserAPI.onTabsUpdated((payload) => {
    state = payload;
    render();
  });
  window.browserAPI.onPageTint(({ id, color }) => {
    const tab = activeTab();
    // Main samples a private tab only on its Start Page (page-tint-policy.js).
    if (!tab || tab.id !== id || !/^#[0-9a-f]{6}$/i.test(color)) return;
    tab.pageBg = color;
    applyStripTint(tab);
  });
  window.browserAPI.onGlanceLayout((layout) => {
    glanceLayout = layout;
    // Main has echoed the applied ratio; later keydowns step from the layout
    // again until the next same-task burst.
    glanceKeyRatio = null;
    // Only the Glance header and the fill chip depend on this message. A full
    // render() here would re-apply the rail width from the last tabs payload
    // on every resize, snapping the rail back mid-drag.
    renderGlance();
    renderFillHint();
    fitIslandDots();
    requestAnimationFrame(() => reportIslandRect());
  });
  window.browserAPI.onGlanceStatus((message) => {
    glanceStatus.textContent = message;
  });
  // The panel expanded in place ('panel') covers the pill, so the pill hides,
  // but only once main reports that the overlay has actually drawn the panel
  // over it. The two are separate views painting on their own schedules:
  // hiding the pill on the island-state alone left nothing on screen until the
  // overlay caught up, a blink on every click and the whole island gone
  // whenever the overlay was slow. Any other mode uncovers it at once (in
  // onIslandState); the palette never covers it.
  window.browserAPI.onIslandCovered(() => {
    if (islandMode === 'panel') islandPill.classList.add('covered');
  });

  // Auto-hide moves the page over the strip, but the strip's drag region
  // hit-tests above every view: left on, it would drag the window from the
  // page's top band and (on Wayland) keep the page from seeing the pointer.
  window.browserAPI.onStripHidden((hidden) => {
    stripEl.classList.toggle('strip-hidden', hidden === true);
  });

  // A float view is a clipped window onto a full-size copy of the strip: main
  // says which element it shows and where the view sits, and the stage is
  // offset so that element lands exactly where the strip draws it. The strip
  // underneath stays the only one reporting geometry.
  if (floatSurface) {
    const root = document.documentElement;
    window.browserAPI.onFloatFrame(({ role, x, y, width, height, stageWidth }) => {
      root.dataset.floatRole = role;
      root.style.setProperty('--float-x', `${x}px`);
      root.style.setProperty('--float-y', `${y}px`);
      root.style.setProperty('--float-width', `${width}px`);
      root.style.setProperty('--float-height', `${height}px`);
      root.style.setProperty('--float-stage-width', `${stageWidth}px`);
      // The pill fits the strip's room, which may just have changed.
      fitIslandDots();
    });
    let showGeneration = 0;
    window.browserAPI.onFloatShown((shown) => {
      const generation = ++showGeneration;
      if (!shown) {
        root.classList.remove('float-shown');
        return;
      }
      // Two frames: the view has just become visible, and the slide must start
      // from above the window edge rather than land at once.
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (generation === showGeneration) root.classList.add('float-shown');
      }));
    });
  }
  // end float surface

  window.browserAPI.onIslandState(({ mode, trigger, restoreTrigger, nativePopup }) => {
    islandMode = mode;
    if (mode !== 'panel') islandPill.classList.remove('covered');
    // Expanding over the pill: drop its proximity swell at once (restIsland).
    if (mode === 'panel' || mode === 'palette') restIsland();
    // Truthful per-control expanded state: the popover is one surface with
    // two doors, and only the door that opened it reads as expanded.
    const shieldOpen = mode === 'shield';
    islandPill.classList.toggle('shield-open', shieldOpen && !nativePopup);
    pillShield.setAttribute('aria-expanded', String(shieldOpen && trigger === 'shield'));
    pillSpace.setAttribute('aria-expanded', String(mode === 'spaces'));
    islandPill.classList.toggle('spaces-open', mode === 'spaces');
    pillInsecure.setAttribute('aria-expanded', String(shieldOpen && trigger === 'insecure'));
    pillCapture.setAttribute('aria-expanded', String(mode === 'capture'));
    pillDisplayShare.setAttribute('aria-expanded', String(mode === 'capture'));
    glanceChange.setAttribute('aria-expanded', String(mode === 'glance'));
    if (restoreTrigger === 'capture') {
      if (!pillCapture.hidden) pillCapture.focus();
      else pillDisplayShare.focus();
    }
    if (restoreTrigger === 'glance-change') glanceChange.focus();
    // Escape dismissal: main has already focused this webContents, so a DOM
    // focus() here lands in a focused document and paints the ring.
    if (restoreTrigger === 'shield') pillShield.focus();
    else if (restoreTrigger === 'insecure') pillInsecure.focus();
    if (restoreTrigger === 'spaces') pillSpace.focus();
    // The side list's group menu closed: its header row forgets the open
    // state, and Escape hands focus back to that header's ⋮.
    if (mode === null && typeof trigger === 'string' && trigger.startsWith('group-menu:')) {
      window.blancRailGroupMenu?.closed(trigger.slice('group-menu:'.length), { focus: restoreTrigger === 'group-menu' });
    }
    render();
  });
  window.browserAPI.onDownloadsActivity((payload) => {
    downloadState = payload;
    renderDownloads();
  });
  window.browserAPI.getAllTabs().then((payload) => {
    state = payload;
    render();
  });

  // --- Report strip height so main can size tab views below it. ---
  const reportLayout = () => {
    if (floatSurface) return;
    window.browserAPI.reportChromeLayout(chromeEl.getBoundingClientRect().height);
  };
  new ResizeObserver(reportLayout).observe(chromeEl);
  requestAnimationFrame(reportLayout);

  // --- Island proximity: the pill reacts to the cursor approaching. ---------
  // Main does the measuring — the cursor is usually over the page, which this
  // document never sees — and sends back how close it is. This side only tells
  // main where the pill is, and paints what comes back.
  //
  // The reported box is the RESTING one, with the effect's own transform
  // divided back out. Reporting the transformed box would let the pill chase
  // itself: closer reads as bigger reads as closer.
  const ISLAND_SCALE = 0.02;    // keep in step with #islandPill in styles.css
  const ISLAND_RISE = 2;
  const hoverQuery = matchMedia('(any-hover: hover) and (any-pointer: fine)');

  let lastIslandReport = '';
  // Hover-open's target: the favicon and domain, full pill height, never the
  // buttons, dots or chips around them. Unscaled like the pill rectangle (the
  // swell grows from the top center). The Not-secure badge between favicon
  // and domain is a button of its own, so while it shows only the domain counts.
  const islandUrlArea = (pill, scale, y, height) => {
    const parts = [pillDomain.getBoundingClientRect()];
    if (pillInsecure.hidden) parts.push(pillFavicon.getBoundingClientRect());
    const visible = parts.filter((part) => part.width > 0);
    if (!visible.length) return null;
    const left = Math.min(...visible.map((part) => part.left));
    const right = Math.max(...visible.map((part) => part.right));
    const center = pill.left + pill.width / 2;
    return { x: center + (left - center) / scale, y, width: (right - left) / scale, height };
  };
  const boxOf = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 ? { x: r.left, y: r.top, width: r.width, height: r.height } : null;
  };
  const reportIslandRect = () => {
    if (floatSurface) return;
    const r = islandPill.getBoundingClientRect();
    if (!r.width) return;
    const k = islandPill.classList.contains('shield-open') || islandPill.classList.contains('spaces-open') ? 0 : Number(islandPill.style.getPropertyValue('--island-k')) || 0;
    const scale = 1 + ISLAND_SCALE * k;
    // transform-origin is the top centre, so the top edge only moves by the rise.
    const width = r.width / scale;
    const height = r.height / scale;
    const trigger = pillShield.getAttribute('aria-expanded') === 'true' ? 'shield'
      : pillInsecure.getAttribute('aria-expanded') === 'true' ? 'insecure' : null;
    const y = r.top + ISLAND_RISE * k;
    const hoverRect = islandUrlArea(r, scale, y, height);
    // Windows and Linux: where the window controls and the main-menu button
    // sit, so a floating Island can draw its copies of them in place.
    const controlsBox = isMac ? null : boxOf(windowControls);
    // With vertical tabs the rail covers the strip's menu button: never float it.
    const menuBox = isMac || state.tabLayout === 'vertical' ? null : boxOf(mainMenuButton);
    const rect = {
      x: (r.left + r.width / 2) - width / 2,
      y,
      width,
      height,
      hoverCapable: hoverQuery.matches,
      ...(hoverRect ? { hoverRect } : {}),
      ...(trigger ? { shieldAnchor: shieldAnchorFor(trigger) } : {}),
      ...(pillSpace.getAttribute('aria-expanded') === 'true' ? { spacesAnchor: spacesAnchor() } : {}),
      ...(islandFloor != null ? { minPrimaryWidth: islandFloor } : {}),
      ...(referenceFloor != null ? { minReferenceWidth: referenceFloor } : {}),
      ...(controlsBox ? { windowControlsRect: controlsBox } : {}),
      ...(menuBox ? { menuButtonRect: menuBox } : {}),
    };
    const serialized = JSON.stringify(rect);
    if (serialized === lastIslandReport) return;
    lastIslandReport = serialized;
    window.browserAPI.reportIslandRect(rect);
  };
  new ResizeObserver(reportIslandRect).observe(islandPill);
  // The observer only sees the pill's SIZE change. A window resize re-centers
  // the pill without resizing it, which left this rect stale — and the ⌘L
  // morph (and proximity glow) anchored to where the centre USED to be,
  // visibly growing out of the left or right instead of the pill.
  window.addEventListener('resize', reportIslandRect);
  hoverQuery.addEventListener('change', reportIslandRect);
  requestAnimationFrame(reportIslandRect);

  // Main's value is a target, and it arrives on main's clock (at most ~60 a
  // second, only while the cursor moves). Ease toward it once per DISPLAY
  // frame instead. A CSS transition restarted on every message moved in
  // stop-start steps on a 120 Hz screen (about one frame in five barely moved,
  // then the pill lurched), and that gets worse as the refresh rate rises.
  const ISLAND_EASE_MS = 60;    // time constant: ~95% of the way in 180 ms
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let islandTarget = 0;
  let islandShown = 0;
  let islandFrame = 0;
  let islandFrameAt = 0;
  const paintIslandK = (next) => {
    islandPill.style.setProperty('--island-k', String(next));
    islandPill.classList.toggle('proximity-active', next > 0);
  };
  const stepIslandK = (now) => {
    const dt = Math.min(64, Math.max(0, now - islandFrameAt));
    islandFrameAt = now;
    islandShown += (islandTarget - islandShown) * (1 - Math.exp(-dt / ISLAND_EASE_MS));
    // 0.01 of k is under 0.1 px of movement; settle there rather than restyle
    // for another 200 ms of invisible steps.
    if (Math.abs(islandTarget - islandShown) < 0.01) islandShown = islandTarget;
    paintIslandK(Math.round(islandShown * 10000) / 10000);
    islandFrame = islandShown === islandTarget ? 0 : requestAnimationFrame(stepIslandK);
  };
  // Paint the pill at rest this frame, with no easing. Also used when the
  // island expands: the panel starts on the pill's RESTING box, so a pill
  // easing down from a swell would show its edge around the panel's first
  // frames.
  const restIsland = () => {
    cancelAnimationFrame(islandFrame);
    islandFrame = 0;
    islandTarget = 0;
    islandShown = 0;
    paintIslandK(0);
  };
  window.browserAPI.onIslandProximity(({ k }) => {
    if (reducedMotion.matches) {
      // The effect is off entirely under reduced motion (styles.css forces the
      // transform to none), so the value must say so too: reportIslandRect
      // divides the scale for --island-k back out of the measured box.
      restIsland();
      return;
    }
    islandTarget = Number(k) || 0;
    if (!islandFrame) {
      // Time the first step from the message, so the pace is the same at any
      // refresh rate.
      islandFrameAt = performance.now();
      islandFrame = requestAnimationFrame(stepIslandK);
    }
  });
})();
