// Renderer for the chrome strip — the slim band the resting island pill
// floats in, plus window controls. The island's
// expanded states live in a separate overlay WebContentsView (overlay.js)
// so they can float over the web content.
(() => {
  const { platform } = window.browserAPI;
  const isMac = platform === 'darwin';
  document.documentElement.dataset.platform = platform;
  if (isMac) document.body.classList.add('mac');

  const chromeEl = document.getElementById('chrome');
  const stripEl = document.getElementById('strip');
  const islandPill = document.getElementById('islandPill');
  const pillDots = document.getElementById('pillDots');
  const pillNav = document.getElementById('pillNav');
  const pillActions = document.getElementById('pillActions');
  const pillFavicon = document.getElementById('pillFavicon');
  const pillDomain = document.getElementById('pillDomain');
  const pillShield = document.getElementById('pillShield');
  const pillShieldCount = document.getElementById('pillShieldCount');
  const pillCapture = document.getElementById('pillCapture');
  const pillCaptureMic = document.getElementById('pillCaptureMic');
  const pillCaptureCam = document.getElementById('pillCaptureCam');
  const pillInsecure = document.getElementById('pillInsecure');
  const pillPrivateChip = document.getElementById('pillPrivateChip');
  const pillSourceChip = document.getElementById('pillSourceChip');
  const windowControls = document.getElementById('windowControls');
  const mainMenuButton = document.getElementById('mainMenuButton');

  let state = {
    tabs: [],
    activeTabId: null,
    groups: [],
    tabLayout: 'island',
  };
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
    // Same cut as the panel row's close (overlay.js ICONS.close) — both mean
    // "close tab". The only ✕ in the pill; see `stop` above.
    close: '<svg viewBox="0 0 16 16"><path d="M4.75 4.75l6.5 6.5M11.25 4.75l-6.5 6.5"/></svg>',
  };

  /** A quiet icon button for the pill. stopPropagation keeps a click on the
   * button from bubbling to the pill (which would open the panel). */
  function pillButton(iconKey, title, onClick) {
    const b = document.createElement('button');
    b.className = 'pill-btn';
    b.innerHTML = PILL_ICONS[iconKey];
    b.title = title;
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

  const backBtn = pillButton('back', 'Back', () => state.activeTabId && window.browserAPI.goBack(state.activeTabId));
  const forwardBtn = pillButton('forward', 'Forward', () => state.activeTabId && window.browserAPI.goForward(state.activeTabId));
  pillNav.append(backBtn, forwardBtn);

  const reloadBtn = pillButton('reload', 'Reload', () => {
    const t = activeTab();
    if (!t) return;
    if (t.isLoading) window.browserAPI.stop(t.id);
    else window.browserAPI.reload(t.id);
  });
  const favoriteBtn = pillButton('heart', 'Favorite this page', () => window.browserAPI.toggleBookmark());
  const closeBtn = pillButton('close', 'Close tab', () => {
    if (state.activeTabId) window.browserAPI.closeTab(state.activeTabId);
  });
  closeBtn.classList.add('pill-close');
  pillActions.append(reloadBtn, favoriteBtn, closeBtn);

  let downloadState = { active: 0, hasRecent: false, receivedBytes: 0, totalBytes: 0 };
  const downloadsBtn = pillButton('download', 'Downloads', () => {
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
    downloadsBtn.hidden = !(active > 0 || hasRecent);
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

    downloadsBtn.title = active > 0
      ? `Downloading — ${active} active`
      : heldFull ? 'Download complete — open Downloads' : 'Downloads';
  }
  renderDownloads();

  // --- Window controls (non-mac only; macOS gets native traffic lights) ---
  if (!isMac) {
    let mainMenuOpen = false;
    mainMenuButton.hidden = false;
    mainMenuButton.addEventListener('click', async () => {
      if (mainMenuOpen) return;
      const rect = mainMenuButton.getBoundingClientRect();
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
      mk(ICONS.minimize, 'Minimize', () => window.browserAPI.minimizeWindow()),
      mk(ICONS.maximize, 'Maximize / Restore', () => window.browserAPI.maximizeWindow()),
      mk(ICONS.close, 'Close', () => window.browserAPI.closeWindow(), 'close-btn')
    );
  }

  function activeTab() {
    return state.tabs.find((t) => t.id === state.activeTabId) || null;
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


  function setFavicon(el, tab, base = 'favicon') {
    el.className = base + (tab?.isLoading ? ' loading' : '');
    el.style.backgroundImage = '';
    if (!tab || tab.isLoading) return;
    if (tab.url.startsWith('blanc://')) {
      // Blanc mark via CSS mask so it follows the theme — the pages' own SVG
      // favicon always rasterizes light-scheme (see .favicon.internal).
      el.classList.add('internal');
    } else if (tab.favicon) {
      el.classList.add('has-icon');
      el.style.backgroundImage = `url("${tab.favicon.replace(/[\\"]/g, '\\$&')}")`;
    }
  }

  /** Faux header: paint the strip with the active page's own top-edge
   * color so it reads as a continuation of the site, not a chrome bar.
   * Private tabs keep the private theme untinted. */
  function applyStripTint(tab) {
    // A theme handoff invalidates the previous website sample. Ignore any
    // stale tabs:updated payload still in flight until main clears/resamples it.
    const tint = (!themeHandoffPending && !tab?.private && (tab?.pageBg || tab?.themeColor)) || null;
    if (!tint) {
      // Private keeps its dedicated token scope. For ordinary tabs, paint the
      // newly selected theme immediately instead of waiting for Electron to
      // propagate prefers-color-scheme into this renderer.
      const optimisticBg = tab?.private
        ? 'var(--bg)'
        : ({ light: '#ffffff', dark: '#0e0e0e' }[pendingThemeAppearance] ?? 'var(--bg)');
      // The normal strip transition is for site-to-site faux-header changes.
      // A theme preview should land in this interaction frame, not animate
      // for another 160ms after the command has already completed.
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

  /** Dots for the pill: the ACTIVE tab's group only (null groupId = the
   * complete ungrouped set). Pins lead their group or ungrouped set; the
   * standalone pinned shelf remains in the panel as well. Capped at
   * DOT_CAP with a trailing "+k" that opens the panel; the window slides only
   * when needed to keep the active dot visible. The pill deliberately does
   * NOT map other groups — that lives in ⌘L. */
  /** The windowed dot set: which tabs get a dot, and how many overflow into
   * the trailing "+k". Shared by the node builder and the render-skip
   * signature so the two never disagree. */
  function activeGroupMembers() {
    const tab = activeTab();
    if (!tab) return { shown: [], hidden: 0 };
    const g = tab.groupId ?? null;
    const members = state.tabs
      .filter((t) => (t.groupId ?? null) === g)
      .sort((a, b) => Number(b.pinned) - Number(a.pinned));
    if (members.length <= DOT_CAP) return { shown: members, hidden: 0 };

    const activeIdx = Math.max(0, members.indexOf(tab));
    const start = activeIdx < DOT_CAP ? 0 : Math.min(activeIdx - (DOT_CAP - 1), members.length - DOT_CAP);
    return { shown: members.slice(start, start + DOT_CAP), hidden: members.length - DOT_CAP };
  }

  function activeGroupDots() {
    const { shown, hidden } = activeGroupMembers();
    const nodes = shown.map(tabDot);
    if (hidden > 0) {
      const more = document.createElement('button');
      more.className = 'pill-overflow';
      more.textContent = `+${hidden}`;
      more.title = `${hidden} more ${hidden === 1 ? 'tab' : 'tabs'} in this group — open the list`;
      more.setAttribute('aria-label', more.title);
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
    const { shown, hidden } = activeGroupMembers();
    return JSON.stringify({
      shown: shown.map((t) => ({
        id: t.id,
        active: t.id === state.activeTabId,
        loading: t.isLoading,
        private: t.private,
        title: t.title || 'New Tab',
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
    dot.className =
      'island-dot' +
      (t.id === state.activeTabId ? ' active' : '') +
      (t.isLoading ? ' loading' : '') +
      (t.private ? ' private' : '');
    dot.title = t.title || 'New Tab';
    // A dot is a switch target, not a status field: quiet is carried by the
    // row-level dim on the panel row and rail, never on the dot.
    dot.setAttribute('aria-label', `Switch to ${t.title || 'New Tab'}`);
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

  function render() {
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
      reloadBtn.title = reloadMode === 'stop' ? 'Stop' : 'Reload';
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
    favoriteBtn.title = tab?.bookmarked ? 'Remove favorite' : 'Favorite this page';

    // Only rebuild the dot row when the dots themselves change — not on every
    // blocked-count broadcast (see dotsSignature). Rebuilding tears down each
    // dot's peek span and any keyboard focus on it.
    const dotsSig = dotsSignature();
    if (dotsSig !== lastDotsSig) {
      lastDotsSig = dotsSig;
      pillDots.replaceChildren(...activeGroupDots());
    }

    setFavicon(pillFavicon, tab);
    pillDomain.textContent = tab?.isLoading
      ? 'Loading…'
      : tabDomain(tab) || (tab?.private ? 'private tab' : 'new tab');
    pillDomain.classList.toggle('dim', !!tab?.isLoading);

    // tab.connection is main's single derivation (null while loading, so the
    // old page's security state can't linger under a "Loading…" domain).
    pillInsecure.hidden = tab?.connection !== 'http';

    pillPrivateChip.hidden = !tab?.private;
    // A view-source tab is opened fresh, so Back is dead and the island has
    // no per-tab close control — without this chip the tab is a dead end.
    // Suppressed on a private tab (view-source inherits the opener's privacy):
    // the private chip already closes the tab, and two adjacent ✕ chips doing
    // the same thing is noise.
    pillSourceChip.hidden = !viewSourceTarget(tab?.url) || !!tab?.private;

    // Shield chip: state fully derived in main (shield-model.js) and shipped
    // on the broadcast — the strip only renders. Always present on a page
    // with a blockable host, so the popover entry point never vanishes.
    const shield = tab?.shield ?? { mode: 'hidden', count: 0, title: '' };
    pillShield.hidden = shield.mode === 'hidden';
    pillShield.classList.toggle('shield-off', shield.mode === 'off');
    pillShield.classList.toggle('shield-quiet', shield.mode === 'quiet');
    pillShieldCount.textContent = shield.mode === 'count' ? String(shield.count) : '';
    pillShield.title = shield.title;
    pillShield.setAttribute('aria-label', shield.title);

    // Capture chip: WINDOW-WIDE — lit while any tab or popup captures
    // (spec §6.1), unlike every per-active-tab neighbour in the pill.
    const cap = state.captureChip ?? { audio: false, video: false };
    pillCapture.hidden = !cap.audio && !cap.video;
    // toggleAttribute, not .hidden — SVGElement has no hidden IDL property,
    // so the property form silently does nothing on these glyphs.
    pillCaptureMic.toggleAttribute('hidden', !cap.audio);
    pillCaptureCam.toggleAttribute('hidden', !cap.video);
    const capTitle = cap.audio && cap.video ? 'camera & microphone in use'
      : cap.video ? 'camera in use' : 'microphone in use';
    pillCapture.title = `${capTitle} — open capture controls`;
    pillCapture.setAttribute('aria-label', `${capTitle} — open capture controls`);

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
  pillShield.addEventListener('click', (e) => {
    e.stopPropagation();
    const r = pillShield.getBoundingClientRect();
    window.browserAPI.openShieldPopover({ right: r.right, trigger: 'shield' });
  });

  // The not-secure badge is the popover's second door — same room, anchored
  // under whichever control was clicked. Enter/Space come free (real button).
  pillInsecure.addEventListener('click', (e) => {
    e.stopPropagation();
    const r = pillInsecure.getBoundingClientRect();
    window.browserAPI.openShieldPopover({ right: r.right, trigger: 'insecure' });
  });

  pillCapture.addEventListener('click', (e) => {
    e.stopPropagation();
    const r = pillCapture.getBoundingClientRect();
    window.browserAPI.openCapturePopover({ right: r.right });
  });

  islandPill.addEventListener('click', () => window.browserAPI.openIsland());
  islandPill.addEventListener('keydown', (e) => {
    // Only when the pill itself is focused — a focused child button (tab
    // dot, folded group capsule) must keep its own Enter/Space activation.
    if (e.target !== islandPill) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      window.browserAPI.openIsland();
    }
  });

  // Double-click on empty strip area zooms the window (desktop convention).
  stripEl.addEventListener('dblclick', (e) => {
    if (e.target === stripEl) window.browserAPI.maximizeWindow();
  });

  // Permission prompts render in their own floating bottom-center view
  // (permission.html/permission.js) — the strip no longer hosts them.

  // --- State sync ---
  window.browserAPI.onTabsUpdated((payload) => {
    state = payload;
    render();
  });
  window.browserAPI.onIslandState(({ mode, trigger, restoreTrigger }) => {
    islandMode = mode;
    // Truthful per-control expanded state: the popover is one surface with
    // two doors, and only the door that opened it reads as expanded.
    const shieldOpen = mode === 'shield';
    pillShield.setAttribute('aria-expanded', String(shieldOpen && trigger === 'shield'));
    pillInsecure.setAttribute('aria-expanded', String(shieldOpen && trigger === 'insecure'));
    pillCapture.setAttribute('aria-expanded', String(mode === 'capture'));
    if (restoreTrigger === 'capture') pillCapture.focus();
    // Escape dismissal: main has already focused this webContents, so a DOM
    // focus() here lands in a focused document and paints the ring.
    if (restoreTrigger === 'shield') pillShield.focus();
    else if (restoreTrigger === 'insecure') pillInsecure.focus();
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
  const ISLAND_SCALE = 0.045;   // keep in step with #islandPill in styles.css
  const ISLAND_RISE = 3.5;
  const ISLAND_LEAN = 6;

  const reportIslandRect = () => {
    const r = islandPill.getBoundingClientRect();
    if (!r.width) return;
    const k = Number(islandPill.style.getPropertyValue('--island-k')) || 0;
    const lean = Number(islandPill.style.getPropertyValue('--island-lean')) || 0;
    const scale = 1 + ISLAND_SCALE * k;
    // transform-origin is the top centre, so the top edge only moves by the rise.
    const width = r.width / scale;
    const height = r.height / scale;
    window.browserAPI.reportIslandRect({
      x: (r.left + r.width / 2) - ISLAND_LEAN * lean - width / 2,
      y: r.top + ISLAND_RISE * k,
      width,
      height,
    });
  };
  new ResizeObserver(reportIslandRect).observe(islandPill);
  requestAnimationFrame(reportIslandRect);

  window.browserAPI.onIslandProximity(({ k, lean }) => {
    islandPill.style.setProperty('--island-k', String(k ?? 0));
    islandPill.style.setProperty('--island-lean', String(lean ?? 0));
  });
})();
