// Renderer for the overlay WebContentsView — the island's expanded states,
// floating over web content: the command bar ('panel', anchored where the
// pill sits), the summoned palette ('palette', centered over a scrim), and
// the find-in-page capsule ('find', tight bounds set by main).
(() => {
  const { platform } = window.browserAPI;
  const isMac = platform === 'darwin';
  const modKey = isMac ? '⌘' : 'ctrl+';
  const modShiftKey = isMac ? '⌘⇧' : 'ctrl+shift+';

  const backdrop = document.getElementById('backdrop');
  const panelAnchor = document.getElementById('panelAnchor');
  const islandPanel = document.getElementById('islandPanel');
  const addressInput = document.getElementById('addressInput');
  const panelInsecure = document.getElementById('panelInsecure');
  const islandList = document.getElementById('islandList');
  const islandHint = document.getElementById('islandHint');
  const backBtn = document.getElementById('backBtn');
  const fwdBtn = document.getElementById('fwdBtn');
  const reloadBtn = document.getElementById('reloadBtn');
  const heartBtn = document.getElementById('heartBtn');
  const dismissBtn = document.getElementById('dismissBtn');
  const findBar = document.getElementById('findBar');
  const shieldPop = document.getElementById('shieldPop');
  const shieldPopHost = document.getElementById('shieldPopHost');
  const shieldPopOnOff = document.getElementById('shieldPopOnOff');
  const shieldPopToggle = document.getElementById('shieldPopToggle');
  const shieldPopConnection = document.getElementById('shieldPopConnection');
  const shieldPopCount = document.getElementById('shieldPopCount');
  const shieldPopNote = document.getElementById('shieldPopNote');
  const shieldPopSettings = document.getElementById('shieldPopSettings');
  const capturePop = document.getElementById('capturePop');
  const capturePopRows = document.getElementById('capturePopRows');
  const CONNECTION_LABEL = {
    https: 'Connection · Uses HTTPS',
    http: 'Connection · Not encrypted',
    local: 'Connection · Local',
  };
  const findInput = document.getElementById('findInput');
  const findCount = document.getElementById('findCount');
  const findPrevBtn = document.getElementById('findPrevBtn');
  const findNextBtn = document.getElementById('findNextBtn');
  const findCloseBtn = document.getElementById('findCloseBtn');
  const footerNewTab = document.getElementById('footerNewTab');
  const footerNewPrivate = document.getElementById('footerNewPrivate');
  const footerWorkspace = document.getElementById('footerWorkspace');
  const footerWorkspaceLabel = document.getElementById('footerWorkspaceLabel');
  const workspaceSwitcher = document.getElementById('workspaceSwitcher');
  const workspaceSwitcherList = document.getElementById('workspaceSwitcherList');
  const wsSwitcherSep = document.getElementById('wsSwitcherSep');
  const wsSwitcherNew = document.getElementById('wsSwitcherNew');
  const wsSwitcherSaveAs = document.getElementById('wsSwitcherSaveAs');
  const footerFavorites = document.getElementById('footerFavorites');
  const footerHistory = document.getElementById('footerHistory');
  const footerDownloads = document.getElementById('footerDownloads');
  const footerTabLayout = document.getElementById('footerTabLayout');
  const footerSettings = document.getElementById('footerSettings');
  const glancePickerEl = document.getElementById('glancePicker');
  const glancePickerInput = document.getElementById('glancePickerInput');
  const glancePickerList = document.getElementById('glancePickerList');
  const glancePickerState = document.getElementById('glancePickerState');
  const glancePickerClose = document.getElementById('glancePickerClose');
  const glancePickerLive = document.getElementById('glancePickerLive');

  let state = { tabs: [], activeTabId: null, glanceTabId: null, groups: [], closed: [] };
  /** @type {null | 'panel' | 'palette' | 'glance' | 'find' | 'shield' | 'capture'} */
  let mode = null;
  let glancePickerPurpose = null;
  let glancePickerSelectedId = null;
  let glancePickerError = '';
  let glancePickerBusy = false;
  /** The tab a context-menu "New Group…" is naming via the /group command
   * (arrives in overlay:show's purpose payload; cleared once used, dismissed,
   * or the command is edited away from /group). */
  let pendingGroupTabId = null;
  /** A click only reaches a row's handler when mousedown and mouseup land on
   * the same element. tabs:updated broadcasts arrive in bursts while any page
   * loads, and a replaceChildren between the two destroys the pressed row —
   * the browser then retargets the click to <body> and the row's handler never
   * runs, silently dropping the interaction. Hold list re-renders while a
   * pointer is down and flush one frame after release, so the click has
   * already been dispatched against the row the user actually pressed. */
  let pointerHeld = false;
  let renderQueued = false;

  function releasePointerHold() {
    pointerHeld = false;
    if (!renderQueued) return;
    renderQueued = false;
    renderList();
  }
  // The address input's value is only ours to overwrite while untouched;
  // once the user types, incoming tab updates must not clobber it.
  let inputTouched = false;
  let findLastQuery = null;
  // Quick Switcher corpora, refreshed each time the panel opens.
  let favorites = [];
  let historyEntries = [];
  // Other devices' tab snapshots (tab sync). Renderer-local fold state —
  // devices start folded so the panel stays quiet (spec §2).
  let remoteDevices = [];
  const unfoldedDevices = new Set();
  // Recently closed starts folded — one line like a synced device; unfold to
  // see the reopen rows (Claude island declutter iteration).
  let closedSectionOpen = false;
  // What Enter acts on — rebuilt on every list render.
  let visibleCommands = [];
  let visibleResults = [];
  // Result text for a command that deliberately leaves the panel open. A
  // generation prevents a late IPC result from repainting a newer query or a
  // panel that has since been closed and reopened.
  let commandNotice = '';
  let commandResultGeneration = 0;
  // Search-engine autocomplete is best-effort and asynchronous. The query
  // token plus request generation prevent late responses from repainting a
  // newer query (or a panel that was closed and reopened).
  let providerSuggestions = [];
  let providerSuggestionQuery = '';
  let searchProviderId = null;
  let searchProviderLabel = 'search';
  let suggestionDebounce = null;
  let suggestionRequestGeneration = 0;
  let addressInputComposing = false;
  // A paste/drop or text entered while a private tab is active can contain
  // credentials or private prose. Once detected, keep provider autocomplete
  // off for that edit session; Enter still submits the value normally.
  let suppressProviderSuggestions = false;
  // -1 means no explicit ArrowUp/ArrowDown choice; renderList still highlights
  // the result that bare Enter would choose.
  let selectedResultIndex = -1;
  // Named Workspaces (Blanc Patron). Populated from listWorkspaces() when the
  // panel opens (refreshSwitcherData) and kept fresh via onWorkspacesUpdated —
  // a pull-once list would keep showing a stale "active" row after a switch
  // that happened elsewhere (another window, or this window's own command).
  let wsPatronActive = false;
  let wsWorkspaces = [];
  // A workspace row's context-menu Rename/Delete lands here. main has no
  // other channel back into an already-open panel, so both reuse the SAME
  // overlay:show purpose payload beginNewGroup already relies on — see
  // applyMode's purpose handling below. Only one edit/confirm is ever open;
  // a stray id (the workspace was deleted from elsewhere while open) simply
  // has no row left to render into, so it goes inert rather than needing to
  // be reconciled explicitly. All of these editors live in the footer
  // workspace popover — never in the tab list.
  let pendingRenameWorkspaceId = null;
  let workspaceEditValue = '';
  let pendingDeleteWorkspaceId = null;
  // "new…" / "save as…": name editors inside the popover (create blank vs
  // capture this window). Mutually exclusive with rename/delete.
  let pendingCreateWorkspace = false;
  let createWorkspaceValue = '';
  let pendingSaveAsWorkspace = false;
  let saveAsWorkspaceValue = '';
  // Scratch guard (Task 9 follow-up): set when an open/create attempt comes
  // back {error:'unsaved-scratch'} — this window is unbound and holds real
  // tabs, so main refused to switch it without confirming first. Carries
  // enough to retry the SAME action: 'open' replays openWorkspace(workspaceId),
  // 'create' replays createBlankWorkspace(name). awaitingSave is set only
  // while "save first" is in flight — see commitSaveAsWorkspace, which is
  // the one place that consumes it.
  let pendingScratchGuard = null; // { kind: 'open'|'create', workspaceId?, name, tabCount, privateCount, awaitingSave? }
  // A popover editor is built into a detached element and only reaches the
  // document when renderWorkspaceSwitcherList() runs replaceChildren, and
  // focus() on a detached node is silently a no-op. So the editors record the
  // focus they want here and the switcher paint applies it once the input is live.
  let pendingEditorFocus = null; // { input, caret, select }
  // True only for the render that opened an editor (user clicked new… /
  // Rename). Incidental tabs:updated re-renders must not re-claim focus —
  // that stole the caret out of the address input. An editor that already
  // holds focus still re-claims via caret != null.
  let claimEditorFocus = false;
  // Footer workspace switcher popover (open/closed). Closed on Esc, outside
  // click, tab switch, and whenever the overlay itself hides.
  let workspaceSwitcherOpen = false;

  const ICONS = {
    reload: '<svg viewBox="0 0 16 16"><path d="M12.42 10.35a5 5 0 1 1-4.42-7.35c1.4 0 2.74.56 3.74 1.53L13 5.78"/><path d="M13 3v2.78h-2.78"/></svg>',
    // Ring + square, not an ✕ — the same drawing as the pill's stop
    // (renderer.js PILL_ICONS.stop). Here too the ✕ belongs to `close`, which
    // every row in the list carries.
    stop: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="5"/><rect class="stop-mark" x="6.05" y="6.05" width="3.9" height="3.9" rx="0.8"/></svg>',
    close: '<svg viewBox="0 0 16 16"><path d="M4.75 4.75l6.5 6.5M11.25 4.75l-6.5 6.5"/></svg>',
    pin: '<svg viewBox="0 0 16 16"><path d="M5 3h6l-1 5 2 2v1H4v-1l2-2z"/><path d="M8 11v3"/></svg>',
    mute: '<svg viewBox="0 0 16 16"><path d="M2.75 6.25h2.5L9 3.25v9.5l-3.75-3H2.75z" stroke-linejoin="round"/><path d="M11.25 6.5l3 3M14.25 6.5l-3 3"/></svg>',
    search: '<svg viewBox="0 0 16 16"><circle cx="7" cy="7" r="4.25"/><path d="m10.25 10.25 3 3"/></svg>',
    // Reopen: a leftward return arrow — drawn, not the Unicode ↶, which sits
    // baseline-low and renders unevenly across platforms.
    reopen: '<svg viewBox="0 0 16 16"><path d="M3.5 6.75h6a3 3 0 0 1 0 6h-3"/><path d="M6.25 4 3.5 6.75l2.75 2.75"/></svg>',
  };
  reloadBtn.innerHTML = ICONS.reload;

  function activeTab() {
    return state.tabs.find((t) => t.id === state.activeTabId) || null;
  }

  const groupById = (id) => state.groups.find((g) => g.id === id) || null;

  /** Cluster order: each non-empty group in group order, then ungrouped,
   * unpinned tabs. Pins lead their named group; only ungrouped pins use the
   * standalone shelf. (Keep in sync with main.js.) */
  function clusterTabs() {
    const clusters = [];
    for (const g of state.groups) {
      const gtabs = state.tabs
        .filter((t) => t.groupId === g.id)
        .sort((a, b) => Number(b.pinned) - Number(a.pinned));
      if (gtabs.length) clusters.push({ group: g, tabs: gtabs });
    }
    const loose = state.tabs.filter((t) => !t.groupId && !t.pinned);
    if (loose.length) clusters.push({ group: null, tabs: loose });
    return clusters;
  }

  const isFavoritable = (url) => /^https?:\/\//.test(url || '');

  function addressDisplayValue(tab) {
    if (!tab) return '';
    if (tab.url.startsWith('blanc://newtab') || tab.url.startsWith('file://')) return '';
    // The error page carries the failed URL in its query — show that, so
    // the user sees (and can edit/retry) the address they typed.
    if (tab.url.startsWith('blanc://error')) {
      try {
        return new URL(tab.url).searchParams.get('url') || tab.url;
      } catch {
        return tab.url;
      }
    }
    return tab.url;
  }


  /** The page URL behind a `view-source:` URL, else null. Chromium's
   * view-source: is a non-special scheme, so `new URL(...).host` is '' and
   * the row would fall back to the literal "new tab".
   * (Keep in sync with renderer.js.) */
  function viewSourceTarget(url) {
    if (!url?.startsWith('view-source:')) return null;
    // A bare "view-source:" has no page behind it — null, not '', so callers
    // can trust a truthy result to be a URL worth parsing.
    return url.slice('view-source:'.length) || null;
  }

  /** Short label for a tab's location: host for web pages (sans the noise
   * "www." carries in a list this dense), page name for internal ones,
   * empty for a blank new tab. */
  function tabDomain(tab) {
    if (!tab?.url || tab.url.startsWith('blanc://newtab')) return '';
    try {
      const u = new URL(viewSourceTarget(tab.url) ?? tab.url);
      return u.protocol === 'blanc:' ? `blanc://${u.host}` : u.host.replace(/^www\./, '');
    } catch {
      return tab.url;
    }
  }

  // `base` kept for parity with renderer.js's twin (the dot-peek reuses it
  // there); the overlay only ever needs the default. Keep the two in sync.
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

  // --- Dedicated Glance tab picker ---------------------------------------

  function eligibleGlanceTabs() {
    return state.tabs.filter((tab) =>
      tab.id !== state.activeTabId && tab.id !== state.glanceTabId
    );
  }

  function filteredGlanceTabs() {
    const query = glancePickerInput.value.trim().toLowerCase();
    const eligible = eligibleGlanceTabs();
    if (!query) return eligible;
    return eligible.filter((tab) => {
      const groupName = groupById(tab.groupId)?.name ?? '';
      return [tab.title, tabDomain(tab), groupName]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(query));
    });
  }

  function glanceOptionId(tabId) {
    return `glance-picker-option-${tabId}`;
  }

  function selectGlanceResult(tabId, { announce = false } = {}) {
    const results = filteredGlanceTabs();
    if (!results.some((tab) => tab.id === tabId)) tabId = results[0]?.id ?? null;
    glancePickerSelectedId = tabId;
    renderGlancePicker({ announce });
  }

  async function chooseGlanceTab(tabId) {
    if (glancePickerBusy || mode !== 'glance') return;
    const tab = filteredGlanceTabs().find((candidate) => candidate.id === tabId);
    if (!tab) return;
    glancePickerBusy = true;
    glancePickerError = '';
    renderGlancePicker();
    let selected = false;
    try {
      selected = await window.browserAPI.setGlanceTab(tab.id);
    } catch {
      selected = false;
    }
    if (mode !== 'glance') return;
    glancePickerBusy = false;
    if (selected) {
      glancePickerLive.textContent = `${tab.title || 'Tab'} opened in Glance`;
      window.browserAPI.closeOverlay('selected');
      return;
    }
    glancePickerError = 'Couldn’t open that tab in Glance';
    renderGlancePicker({ announce: true });
    glancePickerInput.focus();
  }

  function renderGlancePicker({ announce = false } = {}) {
    if (mode !== 'glance') return;
    const eligible = eligibleGlanceTabs();
    const results = filteredGlanceTabs();
    if (!results.some((tab) => tab.id === glancePickerSelectedId)) {
      glancePickerSelectedId = results[0]?.id ?? null;
    }

    const rows = results.map((tab) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.id = glanceOptionId(tab.id);
      row.className = 'glance-picker-option';
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', String(tab.id === glancePickerSelectedId));
      row.tabIndex = -1;
      row.disabled = glancePickerBusy;

      const favicon = document.createElement('span');
      setFavicon(favicon, tab);
      favicon.setAttribute('aria-hidden', 'true');

      const copy = document.createElement('span');
      copy.className = 'glance-picker-option-copy';
      const title = document.createElement('span');
      title.className = 'glance-picker-option-title';
      // Keep an already-known title visible while a tab continues loading.
      // Replacing useful identity with a generic spinner label makes the
      // picker impossible to use on a slow or long-lived navigation.
      title.textContent = tab.title || (tab.isLoading ? 'Loading…' : 'New tab');
      const metadata = [
        tabDomain(tab),
        groupById(tab.groupId)?.name,
        tab.private ? 'private' : '',
        tab.asleep ? 'quiet' : '',
      ].filter(Boolean);
      const sub = document.createElement('span');
      sub.className = 'glance-picker-option-sub';
      sub.textContent = metadata.join(' · ') || 'open tab';
      copy.append(title, sub);
      row.append(favicon, copy);
      row.setAttribute('aria-label', `${title.textContent}, ${sub.textContent}`);
      row.addEventListener('pointerdown', (event) => event.preventDefault());
      row.addEventListener('mousemove', () => {
        if (glancePickerSelectedId !== tab.id) selectGlanceResult(tab.id);
      });
      row.addEventListener('click', () => chooseGlanceTab(tab.id));
      return row;
    });
    glancePickerList.replaceChildren(...rows);

    if (glancePickerSelectedId !== null) {
      glancePickerInput.setAttribute('aria-activedescendant', glanceOptionId(glancePickerSelectedId));
    } else {
      glancePickerInput.removeAttribute('aria-activedescendant');
    }
    glancePickerInput.setAttribute('aria-busy', String(glancePickerBusy));

    const emptyMessage = eligible.length
      ? 'No matching open tabs'
      : 'Open another tab to use Glance';
    const message = glancePickerError || (!results.length ? emptyMessage : '');
    glancePickerState.hidden = !message;
    glancePickerState.textContent = message;
    glancePickerState.classList.toggle('error', !!glancePickerError);

    if (announce) {
      glancePickerLive.textContent = glancePickerError || (
        results.length
          ? `${results.length} ${results.length === 1 ? 'tab' : 'tabs'} available`
          : emptyMessage
      );
    }
  }

  glancePickerInput.addEventListener('input', () => {
    glancePickerError = '';
    glancePickerSelectedId = null;
    renderGlancePicker({ announce: true });
  });
  glancePickerInput.addEventListener('keydown', (event) => {
    const results = filteredGlanceTabs();
    if (event.key === 'Enter') {
      event.preventDefault();
      if (glancePickerSelectedId !== null) chooseGlanceTab(glancePickerSelectedId);
      return;
    }
    if (!results.length) return;
    const current = Math.max(0, results.findIndex((tab) => tab.id === glancePickerSelectedId));
    let next = current;
    if (event.key === 'ArrowDown') next = (current + 1) % results.length;
    else if (event.key === 'ArrowUp') next = (current - 1 + results.length) % results.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = results.length - 1;
    else return;
    event.preventDefault();
    selectGlanceResult(results[next].id, { announce: true });
    glancePickerList.querySelector(`#${CSS.escape(glanceOptionId(results[next].id))}`)
      ?.scrollIntoView({ block: 'nearest' });
  });
  glancePickerClose.addEventListener('click', () => window.browserAPI.closeOverlay('cancel'));

  // --- Panel rendering ---

  function renderPanelChrome() {
    const tab = activeTab();
    backBtn.disabled = !tab?.canGoBack;
    fwdBtn.disabled = !tab?.canGoForward;
    const wantStop = !!tab?.isLoading;
    if (reloadBtn.dataset.mode !== (wantStop ? 'stop' : 'reload')) {
      reloadBtn.dataset.mode = wantStop ? 'stop' : 'reload';
      reloadBtn.innerHTML = wantStop ? ICONS.stop : ICONS.reload;
      reloadBtn.title = wantStop ? 'Stop' : 'Reload';
    }
    heartBtn.disabled = !tab || !isFavoritable(tab.url);
    heartBtn.classList.toggle('favorited', !!tab?.bookmarked);
    heartBtn.title = tab?.bookmarked ? 'Remove favorite' : 'Favorite this page (Ctrl/Cmd+D)';
    // Same single source as the pill badge and the popover row.
    panelInsecure.hidden = tab?.connection !== 'http';

    const verticalTabsActive = state.tabLayout === 'vertical';
    footerTabLayout.title = verticalTabsActive
      ? 'Turn vertical tabs off'
      : 'Turn vertical tabs on';
    footerTabLayout.setAttribute('aria-pressed', String(verticalTabsActive));
  }

  function tabRow(tab) {
    const row = document.createElement('div');
    // .tab-row scopes the at-rest quieting (metadata joins the hover/focus
    // reveal) to list rows — Quick-Switcher/command rows keep their subs.
    row.className =
      'island-row tab-row' +
      (tab.id === state.activeTabId ? ' active' : '') +
      (tab.asleep ? ' quiet' : '');
    row.dataset.tabId = tab.id;
    // A row contains multiple real buttons, so it is a labelled group—not an
    // option/button, whose children would become presentational.
    row.setAttribute('role', 'group');

    const faviconWrap = document.createElement('span');
    faviconWrap.className = 'row-favicon-wrap';
    const favicon = document.createElement('span');
    setFavicon(favicon, tab);
    faviconWrap.append(favicon);
    if (tab.muted) {
      const muteBadge = document.createElement('span');
      muteBadge.className = 'row-mute-badge';
      muteBadge.innerHTML = ICONS.mute;
      faviconWrap.append(muteBadge);
    }

    const label = tab.isLoading ? 'Loading…' : tab.title || 'New Tab';
    const title = document.createElement('span');
    title.className = 'row-title';
    title.textContent = label;
    if (tab.title) title.title = tab.title;
    row.setAttribute('aria-label', label);

    const primary = document.createElement('button');
    primary.type = 'button';
    primary.className = 'row-primary';
    // tabDomain() is '' for a blank new tab; filter rather than emit ", ,".
    // The word a person hears is quiet; the field name stays internal.
    const parts = [label, tabDomain(tab), tab.asleep ? 'quiet' : ''].filter(Boolean);
    primary.setAttribute('aria-label', `Switch to ${parts.join(', ')}`);
    primary.append(faviconWrap, title);
    primary.addEventListener('click', () => {
      window.browserAPI.switchTab(tab.id);
      window.browserAPI.closeOverlay();
    });
    row.append(primary);

    if (tab.private) {
      const tag = document.createElement('span');
      tag.className = 'row-private';
      tag.textContent = 'private';
      row.append(tag);
    }

    // Quiet is dim-only (the row's `quiet` class + the aria word above); no
    // per-row marker — see docs/superpowers/specs/2026-08-18-quiet-marker-
    // dim-only-design.md before reintroducing one.

    const pin = document.createElement('button');
    pin.className = 'row-pin' + (tab.pinned ? ' on' : '');
    pin.title = tab.pinned ? 'Unpin tab' : 'Pin tab';
    pin.setAttribute('aria-label', pin.title);
    pin.innerHTML = ICONS.pin;
    pin.addEventListener('click', (e) => {
      e.stopPropagation();
      window.browserAPI.toggleTabPinned(tab.id);
    });
    row.append(pin);

    if (tab.audible || tab.muted) {
      const mute = document.createElement('button');
      mute.className = 'row-mute' + (tab.muted ? ' on' : '');
      mute.title = tab.muted ? 'Unmute tab' : 'Mute tab';
      mute.setAttribute('aria-label', mute.title);
      mute.innerHTML = ICONS.mute;
      mute.addEventListener('click', (e) => {
        e.stopPropagation();
        window.browserAPI.toggleTabMuted(tab.id);
      });
      row.append(mute);
    }

    if (tab.id !== state.activeTabId) {
      const glance = document.createElement('button');
      const isGlance = tab.id === state.glanceTabId;
      glance.className = 'row-glance' + (isGlance ? ' on' : '');
      glance.textContent = 'glance';
      glance.title = isGlance ? 'Close Glance' : 'Open this tab in Glance';
      glance.setAttribute('aria-label', `${glance.title}: ${label}`);
      glance.setAttribute('aria-pressed', String(isGlance));
      glance.addEventListener('click', async (e) => {
        e.stopPropagation();
        const changed = isGlance
          ? await window.browserAPI.closeGlance()
          : await window.browserAPI.setGlanceTab(tab.id);
        if (changed) window.browserAPI.closeOverlay();
      });
      row.append(glance);
    }

    const close = document.createElement('button');
    close.className = 'row-close';
    close.title = 'Close tab';
    close.setAttribute('aria-label', 'Close tab');
    close.innerHTML = ICONS.close;
    close.addEventListener('click', (e) => {
      e.stopPropagation();
      window.browserAPI.closeTab(tab.id);
    });
    row.append(close);

    // Grouping moved off the row into the right-click context menu (Move to
    // Group ▸) — the old inline chip + picker crowded rows into truncation.

    row.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      window.browserAPI.switchTab(tab.id);
      window.browserAPI.closeOverlay();
    });

    row.addEventListener('auxclick', (e) => {
      if (e.button === 1) window.browserAPI.closeTab(tab.id); // middle-click closes
    });
    return row;
  }

  const CARET = '<svg class="caret" viewBox="0 0 10 10"><path d="M3.5 2 L7 5 L3.5 8"/></svg>';

  /** Named-group band: present --surface tint behind header + member tabs.
   * Only named groups get this — pinned / loose / furniture stay flat. */
  function groupBand(nodes) {
    const band = document.createElement('div');
    band.className = 'island-group-band';
    band.append(...nodes);
    return band;
  }

  /** "pinned" section header for pins without a named group. */
  function pinnedHeaderRow(count) {
    const row = document.createElement('div');
    row.className = 'island-ghead static';
    const name = document.createElement('span');
    name.className = 'ghead-name';
    name.textContent = 'pinned';
    const n = document.createElement('span');
    n.className = 'ghead-n';
    n.textContent = String(count);
    row.append(name, n);
    return row;
  }

  /** "work — 3  ⌘1": click folds/unfolds. Collapsed groups are this one line. */
  function groupHeaderRow(group, count, clusterIndex) {
    const row = document.createElement('div');
    row.className = 'island-ghead';
    row.innerHTML = `${CARET}<span class="ghead-name"></span><span class="ghead-n"></span><span class="ghead-kbd">${modKey}${clusterIndex + 1}</span>`;
    row.querySelector('.caret').classList.toggle('open', !group.collapsed);
    row.querySelector('.ghead-name').textContent = group.name;
    row.querySelector('.ghead-n').textContent = String(count);
    row.title = group.collapsed ? 'Unfold group' : 'Fold group';
    row.addEventListener('click', () => window.browserAPI.toggleGroupCollapsed(group.id));
    return row;
  }

  // --- Named Workspaces (Blanc Patron) ---
  //
  // Identity, switching, and every name/confirm editor live in the island
  // footer popover. The tab list never hosts workspace chrome — only the
  // scratch-guard confirm (about this window) still appears there.

  function applyWorkspacesPayload(payload) {
    wsPatronActive = !!payload?.patronActive;
    wsWorkspaces = Array.isArray(payload?.items) ? payload.items : [];
    syncFooterWorkspace();
    if (workspaceSwitcherOpen) paintWorkspaceSwitcher();
  }

  function boundWorkspace() {
    return wsWorkspaces.find((w) => w.active) || null;
  }

  /** Bound: glyph + name + --surface fill. Unbound: glyph-only, same
   * weight as the other footer acts. */
  function syncFooterWorkspace() {
    const bound = boundWorkspace();
    footerWorkspace.classList.toggle('ws', !!bound);
    footerWorkspace.classList.toggle('bound', !!bound);
    if (bound) {
      footerWorkspaceLabel.hidden = false;
      footerWorkspaceLabel.textContent = bound.name;
      footerWorkspace.title = `Workspace · ${bound.name}`;
      footerWorkspace.setAttribute('aria-label', `Workspace ${bound.name}`);
    } else {
      footerWorkspaceLabel.hidden = true;
      footerWorkspaceLabel.textContent = '';
      footerWorkspace.title = 'Workspaces';
      footerWorkspace.setAttribute('aria-label', 'Workspaces');
    }
    footerWorkspace.setAttribute('aria-expanded', workspaceSwitcherOpen ? 'true' : 'false');
  }

  function clearWorkspacePopoverEditors() {
    pendingRenameWorkspaceId = null;
    workspaceEditValue = '';
    pendingDeleteWorkspaceId = null;
    pendingCreateWorkspace = false;
    createWorkspaceValue = '';
    pendingSaveAsWorkspace = false;
    saveAsWorkspaceValue = '';
    claimEditorFocus = false;
  }

  function workspacePopoverEditing() {
    return pendingCreateWorkspace
      || pendingSaveAsWorkspace
      || pendingRenameWorkspaceId != null
      || pendingDeleteWorkspaceId != null;
  }

  /** Drop only the "save first" hand-off flag so the unsaved-tabs confirm
   * stays on screen. Never null the whole guard here — canceling the name
   * field must not erase the original switch/create decision. */
  function clearScratchGuardAwaitingSave() {
    if (!pendingScratchGuard?.awaitingSave) return;
    pendingScratchGuard = { ...pendingScratchGuard, awaitingSave: false };
    renderList();
  }

  function closeWorkspaceSwitcher() {
    if (!workspaceSwitcherOpen && !workspacePopoverEditing()) return;
    workspaceSwitcherOpen = false;
    workspaceSwitcher.hidden = true;
    workspaceSwitcher.style.top = '';
    workspaceSwitcher.style.bottom = '';
    workspaceSwitcher.style.right = '';
    workspaceSwitcher.style.visibility = '';
    clearScratchGuardAwaitingSave();
    clearWorkspacePopoverEditors();
    footerWorkspace.setAttribute('aria-expanded', 'false');
    window.browserAPI.setWorkspaceSwitcherOpen(false);
  }

  /** Pin the menu to the footer control in viewport space. Prefer above the
   * trigger; if that would clip at the top of the overlay, flip below. */
  function layoutWorkspaceSwitcher() {
    const gap = 6;
    const edge = 8;
    const anchor = footerWorkspace.getBoundingClientRect();
    const menu = workspaceSwitcher;
    menu.style.top = '0px';
    menu.style.bottom = 'auto';
    menu.style.right = '0px';
    const h = menu.offsetHeight;
    const w = menu.offsetWidth;
    let top = anchor.top - h - gap;
    if (top < edge) {
      top = anchor.bottom + gap;
      const maxTop = window.innerHeight - h - edge;
      if (top > maxTop) top = Math.max(edge, maxTop);
    }
    let right = window.innerWidth - anchor.right;
    right = Math.max(edge, Math.min(right, window.innerWidth - w - edge));
    menu.style.top = `${Math.round(top)}px`;
    menu.style.right = `${Math.round(right)}px`;
  }

  function paintWorkspaceSwitcher({ deferFocus = false } = {}) {
    renderWorkspaceSwitcherList();
    layoutWorkspaceSwitcher();
    // Opening measures with visibility:hidden — focus() is a silent no-op then
    // (same class of bug as focusing a detached node). Callers that hide for
    // measure must restore visibility before applying deferred editor focus.
    if (!deferFocus) focusPendingEditor();
  }

  function openWorkspaceSwitcher() {
    workspaceSwitcherOpen = true;
    workspaceSwitcher.hidden = false;
    workspaceSwitcher.style.visibility = 'hidden';
    paintWorkspaceSwitcher({ deferFocus: true });
    workspaceSwitcher.style.visibility = '';
    focusPendingEditor();
    footerWorkspace.setAttribute('aria-expanded', 'true');
    window.browserAPI.setWorkspaceSwitcherOpen(true);
  }

  function toggleWorkspaceSwitcher() {
    if (workspaceSwitcherOpen) closeWorkspaceSwitcher();
    else openWorkspaceSwitcher();
  }

  function setSwitcherCommandVisibility(visible) {
    wsSwitcherSep.hidden = !visible;
    wsSwitcherNew.hidden = !visible;
    wsSwitcherSaveAs.hidden = !visible;
  }

  /** Shared name field for create / save-as / rename inside the popover. */
  function renderSwitcherNameInput({
    value, placeholder, ariaLabel, onInput, onCommit, onCancel, selectAll, caret, className,
  }) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = className || 'ws-switcher-input';
    input.maxLength = 60; // MAX_NAME_LENGTH (workspaces-model.js)
    input.placeholder = placeholder;
    input.value = value;
    input.setAttribute('aria-label', ariaLabel);
    input.addEventListener('input', () => onInput(input.value));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); onCommit(); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onCancel(); }
    });
    if (caret != null || claimEditorFocus) {
      pendingEditorFocus = { input, caret, select: !!selectAll };
      claimEditorFocus = false;
    }
    return input;
  }

  function renderWorkspaceSwitcherList() {
    const naming = pendingCreateWorkspace || pendingSaveAsWorkspace;
    setSwitcherCommandVisibility(!naming);

    if (pendingCreateWorkspace) {
      const wrap = document.createElement('div');
      wrap.className = 'ws-switcher-editor';
      wrap.append(renderSwitcherNameInput({
        value: createWorkspaceValue,
        placeholder: 'name this workspace',
        ariaLabel: 'Name for the new workspace',
        onInput: (v) => { createWorkspaceValue = v; },
        onCommit: commitCreateWorkspace,
        onCancel: cancelCreateWorkspace,
        selectAll: false,
        caret: currentSwitcherCaret('.ws-switcher-editor'),
      }));
      workspaceSwitcherList.replaceChildren(wrap);
      return;
    }

    if (pendingSaveAsWorkspace) {
      const wrap = document.createElement('div');
      wrap.className = 'ws-switcher-editor';
      wrap.append(renderSwitcherNameInput({
        value: saveAsWorkspaceValue,
        placeholder: 'name this window’s workspace',
        ariaLabel: 'Name for saving this window as a workspace',
        onInput: (v) => { saveAsWorkspaceValue = v; },
        onCommit: commitSaveAsWorkspace,
        onCancel: cancelSaveAsWorkspace,
        selectAll: false,
        caret: currentSwitcherCaret('.ws-switcher-editor'),
      }));
      workspaceSwitcherList.replaceChildren(wrap);
      return;
    }

    const nodes = [];
    if (wsWorkspaces.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'ws-switcher-empty';
      empty.textContent = wsPatronActive
        ? 'No workspaces yet'
        : 'Named sets of tabs — Patron';
      nodes.push(empty);
    } else {
      for (const workspace of wsWorkspaces) {
        if (pendingRenameWorkspaceId === workspace.id) {
          nodes.push(renderSwitcherRenameRow(workspace));
        } else if (pendingDeleteWorkspaceId === workspace.id) {
          nodes.push(renderSwitcherDeleteRow(workspace));
        } else {
          nodes.push(renderSwitcherWorkspaceRow(workspace));
        }
      }
    }
    workspaceSwitcherList.replaceChildren(...nodes);
  }

  function currentSwitcherCaret(scopeSelector) {
    const active = document.activeElement;
    if (
      active?.classList?.contains('ws-switcher-input')
      && active.closest(scopeSelector)
    ) return active.selectionStart;
    return null;
  }

  function renderSwitcherWorkspaceRow(workspace) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'ws-switcher-row workspace-row' + (workspace.active ? ' on' : '');
    row.dataset.workspaceId = workspace.id;
    row.setAttribute('role', 'menuitem');
    row.title = workspace.active
      ? `${workspace.name}, current workspace`
      : `Switch to ${workspace.name}`;
    const tick = document.createElement('span');
    tick.className = 'ws-switcher-tick';
    tick.textContent = workspace.active ? '✓' : '';
    tick.setAttribute('aria-hidden', 'true');
    const name = document.createElement('span');
    name.className = 'ws-switcher-name';
    name.textContent = workspace.name;
    const n = document.createElement('span');
    n.className = 'ws-switcher-n';
    n.textContent = String(workspace.tabCount);
    row.append(tick, name, n);
    row.addEventListener('click', () => {
      closeWorkspaceSwitcher();
      switchToWorkspace(workspace);
    });
    return row;
  }

  function renderSwitcherRenameRow(workspace) {
    const row = document.createElement('div');
    row.className = 'ws-switcher-row editing workspace-row';
    row.dataset.workspaceId = workspace.id;
    const input = renderSwitcherNameInput({
      value: workspaceEditValue,
      placeholder: '',
      ariaLabel: `New name for ${workspace.name}`,
      onInput: (v) => { workspaceEditValue = v; },
      onCommit: () => commitWorkspaceRename(workspace.id),
      onCancel: cancelWorkspaceEdit,
      selectAll: true,
      caret: currentSwitcherCaret(`[data-workspace-id="${CSS.escape(workspace.id)}"]`),
    });
    row.append(input);
    return row;
  }

  function renderSwitcherDeleteRow(workspace) {
    // Stacked confirm card: wrapping Inter message on a quiet surface, actions
    // below — a single mono row truncates long names (e.g. Delete "won…).
    const row = document.createElement('div');
    row.className = 'ws-switcher-confirm workspace-row';
    row.dataset.workspaceId = workspace.id;
    const msg = document.createElement('p');
    msg.className = 'ws-switcher-confirm-msg';
    msg.textContent = `Delete "${workspace.name}"?`;
    const actions = document.createElement('div');
    actions.className = 'ws-switcher-confirm-acts';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'ws-switcher-mini';
    cancel.textContent = 'cancel';
    cancel.addEventListener('click', (e) => { e.stopPropagation(); cancelWorkspaceDelete(); });
    const confirm = document.createElement('button');
    confirm.type = 'button';
    confirm.className = 'ws-switcher-mini danger';
    confirm.textContent = 'delete';
    confirm.setAttribute('aria-label', `Permanently delete ${workspace.name}`);
    confirm.addEventListener('click', (e) => { e.stopPropagation(); commitWorkspaceDelete(workspace.id); });
    actions.append(cancel, confirm);
    row.append(msg, actions);
    return row;
  }

  /** A quiet failure code -> the notice text a user actually needs. Every
   * mutating call funnels its failure through here so none of them can ever
   * become a silent no-op — the whole point of the shared commandNotice
   * channel (see runCommand's resultNotice usage for /sleep). 'unsaved-scratch'
   * is deliberately a safety net in the switch below: every call site that can
   * receive it passes runWorkspaceMutation an onUnsavedScratch handler, which
   * intercepts it before this function ever runs (see runWorkspaceMutation).
   * The case exists so a future call site that forgets that handler still
   * surfaces something instead of falling through to the generic default. */
  function workspaceErrorNotice(error, { name } = {}) {
    switch (error) {
      case 'not-patron': return 'Creating workspaces needs Blanc Patron.';
      case 'invalid-name': return 'Type a name for this workspace.';
      case 'duplicate-name': return name
        ? `A workspace named "${name}" already exists.`
        : 'A workspace with that name already exists.';
      case 'limit': return 'You’ve reached the 25-workspace limit.';
      case 'invalid-record': return 'Couldn’t save that workspace.';
      case 'not-found': return 'That workspace no longer exists.';
      case 'focus-failed': return 'Couldn’t switch to that workspace’s window.';
      case 'unsaved-scratch': return 'This window has unsaved tabs.';
      default: return 'Couldn’t complete that action.';
    }
  }

  /** Run a workspace mutation ({ok, error?, patronActive?, items?}). Applies
   * the fresh projection when the response carries one (every handler
   * returns it inline — see Task 7's report — so this never has to wait on
   * the separate onWorkspacesUpdated broadcast), always re-renders, and
   * surfaces a failure as a quiet notice. Generation-guarded like every other
   * async panel result: a response for a panel the user has since closed/
   * reopened, or a newer workspace action, must not paint a stale notice.
   *
   * onUnsavedScratch (Task 9 follow-up): an open/create-blank attempt can
   * come back {error:'unsaved-scratch', tabCount} instead of a plain
   * failure — this window is unbound and holds real tabs, and main refused
   * to switch it without confirming first. A call site that can trigger the
   * guard passes this to turn that response into the in-panel confirm
   * (pendingScratchGuard/scratchGuardRow) instead of a dead-end notice. */
  function runWorkspaceMutation(promise, { context, onSuccess, onUnsavedScratch } = {}) {
    const resultGeneration = ++commandResultGeneration;
    Promise.resolve(promise).then((result) => {
      if (resultGeneration !== commandResultGeneration) return;
      if (result && typeof result === 'object' && 'patronActive' in result) {
        applyWorkspacesPayload(result);
      }
      if (!result?.ok) {
        if (result?.error === 'unsaved-scratch' && onUnsavedScratch) onUnsavedScratch(result);
        else commandNotice = workspaceErrorNotice(result?.error, context);
      }
      renderList();
      if (result?.ok) onSuccess?.(result);
    }, () => {
      if (resultGeneration !== commandResultGeneration) return;
      commandNotice = 'Something went wrong with that workspace.';
      renderList();
    });
  }

  function switchToWorkspace(workspace) {
    runWorkspaceMutation(window.browserAPI.openWorkspace(workspace.id), {
      context: { name: workspace.name },
      onSuccess: () => window.browserAPI.closeOverlay(),
      onUnsavedScratch: (result) => rememberScratchGuard(result, {
        kind: 'open', workspaceId: workspace.id, name: workspace.name,
      }),
    });
  }

  /** "Save this window as…" — name the capture inside the popover, then
   * commit via saveWorkspaceAs (same path /workspace <name> uses). Also the
   * scratch guard's "save first" step. */
  function beginSaveWorkspace() {
    pendingCreateWorkspace = false;
    createWorkspaceValue = '';
    pendingRenameWorkspaceId = null;
    workspaceEditValue = '';
    pendingDeleteWorkspaceId = null;
    pendingSaveAsWorkspace = true;
    saveAsWorkspaceValue = '';
    claimEditorFocus = true;
    openWorkspaceSwitcher();
  }

  function cancelSaveAsWorkspace() {
    pendingSaveAsWorkspace = false;
    saveAsWorkspaceValue = '';
    clearScratchGuardAwaitingSave();
    if (workspaceSwitcherOpen) paintWorkspaceSwitcher();
  }

  function commitSaveAsWorkspace() {
    const name = saveAsWorkspaceValue;
    pendingSaveAsWorkspace = false;
    saveAsWorkspaceValue = '';
    if (workspaceSwitcherOpen) paintWorkspaceSwitcher();
    runWorkspaceMutation(window.browserAPI.saveWorkspaceAs(name), {
      context: { name },
      onSuccess: () => {
        if (pendingScratchGuard?.awaitingSave) retryScratchGuard(false);
        else closeWorkspaceSwitcher();
      },
    });
  }

  /** "new…" — create an empty workspace; name field stays in the popover. */
  function beginCreateWorkspace() {
    pendingSaveAsWorkspace = false;
    saveAsWorkspaceValue = '';
    pendingRenameWorkspaceId = null;
    workspaceEditValue = '';
    pendingDeleteWorkspaceId = null;
    pendingCreateWorkspace = true;
    createWorkspaceValue = '';
    claimEditorFocus = true;
    openWorkspaceSwitcher();
  }

  function cancelCreateWorkspace() {
    pendingCreateWorkspace = false;
    createWorkspaceValue = '';
    if (workspaceSwitcherOpen) paintWorkspaceSwitcher();
  }

  function commitCreateWorkspace() {
    const name = createWorkspaceValue;
    pendingCreateWorkspace = false;
    createWorkspaceValue = '';
    if (workspaceSwitcherOpen) paintWorkspaceSwitcher();
    runWorkspaceMutation(window.browserAPI.createBlankWorkspace(name), {
      context: { name },
      onSuccess: () => window.browserAPI.closeOverlay(),
      onUnsavedScratch: (result) => {
        closeWorkspaceSwitcher();
        rememberScratchGuard(result, { kind: 'create', name });
      },
    });
  }

  /** Capture a {error:'unsaved-scratch'} response as the in-panel confirm.
   * privateCount rides along so scratchGuardRow can hide "save first" when
   * every at-risk tab is private (save-as cannot clear those). */
  function rememberScratchGuard(result, extra = {}) {
    pendingScratchGuard = {
      ...extra,
      tabCount: result.tabCount,
      privateCount: result.privateCount ?? 0,
    };
  }

  /** Re-run the action pendingScratchGuard remembers, with an explicit
   * decision about the guard: force:true is "discard and switch" (the user's
   * own override); force:false is what "save first" retries with. A successful
   * save binds this window, which covers persistable tabs — but private pages
   * still trip the guard, so this MUST pass onUnsavedScratch. Without it a
   * re-trip falls through to the dead-end notice and drops the original
   * action. Clears pendingScratchGuard and repaints BEFORE the mutation
   * resolves, so the confirm row never lingers through the round-trip. */
  function retryScratchGuard(force) {
    const guard = pendingScratchGuard;
    if (!guard) return;
    pendingScratchGuard = null;
    renderList();
    const context = { name: guard.name };
    const onSuccess = () => window.browserAPI.closeOverlay();
    const onUnsavedScratch = (result) => rememberScratchGuard(result, {
      kind: guard.kind, workspaceId: guard.workspaceId, name: guard.name,
    });
    if (guard.kind === 'open') {
      runWorkspaceMutation(window.browserAPI.openWorkspace(guard.workspaceId, { force }), {
        context, onSuccess, onUnsavedScratch,
      });
    } else {
      runWorkspaceMutation(window.browserAPI.createBlankWorkspace(guard.name, { force }), {
        context, onSuccess, onUnsavedScratch,
      });
    }
  }

  /** "save these tabs as a workspace first" — opens the popover save-as
   * editor and marks the pending guard as awaiting that save.
   * commitSaveAsWorkspace retries the original action once the save succeeds. */
  function beginScratchGuardSaveFirst() {
    if (!pendingScratchGuard) return;
    pendingScratchGuard = { ...pendingScratchGuard, awaitingSave: true };
    beginSaveWorkspace();
  }

  /** "discard them and switch" — the explicit override; retryScratchGuard(true)
   * skips the guard on the retried attempt. */
  function discardScratchGuard() {
    retryScratchGuard(true);
  }

  function cancelScratchGuard() {
    pendingScratchGuard = null;
    renderList();
  }

  function cancelWorkspaceEdit() {
    pendingRenameWorkspaceId = null;
    workspaceEditValue = '';
    if (workspaceSwitcherOpen) paintWorkspaceSwitcher();
  }

  function commitWorkspaceRename(id) {
    const name = workspaceEditValue;
    pendingRenameWorkspaceId = null;
    workspaceEditValue = '';
    if (workspaceSwitcherOpen) paintWorkspaceSwitcher();
    runWorkspaceMutation(window.browserAPI.renameWorkspace(id, name), { context: { name } });
  }

  function cancelWorkspaceDelete() {
    pendingDeleteWorkspaceId = null;
    if (workspaceSwitcherOpen) paintWorkspaceSwitcher();
  }

  function commitWorkspaceDelete(id) {
    pendingDeleteWorkspaceId = null;
    if (workspaceSwitcherOpen) paintWorkspaceSwitcher();
    runWorkspaceMutation(window.browserAPI.removeWorkspace(id));
  }

  /** Scratch guard confirmation (Task 9 follow-up) — same warning + button
   * shape as renderWorkspaceDeleteConfirm, just one more (non-destructive)
   * choice. Rendered at the top of the at-rest list, the same slot
   * commandNoticeRow uses (see renderList) — the two never show together. */
  function scratchGuardRow() {
    const row = document.createElement('div');
    row.className = 'island-row confirming';
    const count = pendingScratchGuard.tabCount;
    const privateCount = pendingScratchGuard.privateCount ?? 0;
    const allPrivate = count > 0 && privateCount >= count;
    const tabWord = count === 1 ? 'tab' : 'tabs';
    const warning = document.createElement('span');
    warning.className = 'row-title';
    warning.textContent = allPrivate
      ? `${count} private ${tabWord} will close.`
      : `${count} unsaved ${tabWord} will close.`;
    const discard = document.createElement('button');
    discard.type = 'button';
    discard.className = 'ghead-action danger';
    discard.textContent = 'discard';
    discard.title = `Close ${count} ${allPrivate ? 'private' : 'unsaved'} ${tabWord} without saving`;
    discard.setAttribute('aria-label', discard.title);
    discard.addEventListener('click', () => discardScratchGuard());
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'ghead-action';
    cancel.textContent = 'cancel';
    cancel.title = 'Stay on this window';
    cancel.addEventListener('click', () => cancelScratchGuard());
    // Save-as never captures private tabs. Offering "save first" when every
    // at-risk tab is private re-trips the guard after a no-op save and used
    // to drop the original action into a dead-end notice.
    if (!allPrivate) {
      const saveFirst = document.createElement('button');
      saveFirst.type = 'button';
      saveFirst.className = 'ghead-action';
      saveFirst.textContent = 'save first';
      saveFirst.title = 'Save these tabs as a workspace, then continue';
      saveFirst.setAttribute('aria-label', saveFirst.title);
      saveFirst.addEventListener('click', () => beginScratchGuardSaveFirst());
      row.append(warning, saveFirst, discard, cancel);
    } else {
      row.append(warning, discard, cancel);
    }
    return row;
  }

  // --- Remote devices (tab sync) ---

  const hostOfUrl = (url) => {
    try { return new URL(url).host.replace(/^www\./, ''); } catch { return url; }
  };

  function timeAgo(ts) {
    const mins = Math.max(1, Math.round((Date.now() - ts) / 60000));
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.round(hours / 24)}d ago`;
  }

  /** Remote presentation mirrors clusterList() (main.js): each group in
   * group order with its pins leading, then loose tabs (pins first) —
   * snapshot order preserved within each cluster (spec §2). */
  function clusterRemoteTabs(device) {
    const rows = [];
    for (const g of device.groups) {
      const members = device.tabs.filter((t) => t.groupId === g.id);
      rows.push(...members.filter((t) => t.pinned), ...members.filter((t) => !t.pinned));
    }
    const loose = device.tabs.filter((t) => !device.groups.some((g) => g.id === t.groupId));
    rows.push(...loose.filter((t) => t.pinned), ...loose.filter((t) => !t.pinned));
    return rows;
  }

  /** "MacBook Air · 5 · 2h ago": click folds/unfolds. */
  function remoteHeaderRow(device) {
    const row = document.createElement('div');
    row.className = 'island-ghead';
    const open = unfoldedDevices.has(device.deviceId);
    row.innerHTML = `${CARET}<span class="ghead-name"></span><span class="ghead-n"></span><span class="ghead-n"></span>`;
    row.querySelector('.caret').classList.toggle('open', open);
    row.querySelector('.ghead-name').textContent = device.name;
    const ns = row.querySelectorAll('.ghead-n');
    ns[0].textContent = String(device.tabs.length);
    ns[1].textContent = timeAgo(device.updatedAt);
    ns[1].style.marginLeft = 'auto';
    row.title = open ? 'Fold device' : 'Unfold device';
    row.addEventListener('click', () => {
      if (open) unfoldedDevices.delete(device.deviceId);
      else unfoldedDevices.add(device.deviceId);
      renderList();
    });
    return row;
  }

  /** A remote tab row: opens the url as a plain new local tab (ungrouped —
   * no group reconstruction in v1, spec §2). */
  function remoteTabRow(tab, device) {
    const row = document.createElement('div');
    row.className = 'island-row tab-row';
    const favicon = document.createElement('span');
    setFavicon(favicon, tab);
    const title = document.createElement('span');
    title.className = 'row-title';
    title.textContent = tab.title || tab.url;
    if (tab.title) title.title = tab.title;
    row.append(favicon, title);
    if (tab.pinned) {
      const pin = document.createElement('span');
      pin.className = 'row-remote-pin';
      pin.innerHTML = ICONS.pin;
      row.append(pin);
    }
    const g = device.groups.find((x) => x.id === tab.groupId);
    if (g) {
      const tag = document.createElement('span');
      tag.className = 'row-tag';
      tag.textContent = g.name;
      row.append(tag);
    }
    row.addEventListener('click', () => {
      window.browserAPI.createTab(tab.url, { focusAddress: false });
      window.browserAPI.closeOverlay();
    });
    return row;
  }

  // --- Slash commands ---

  const COMMANDS = [
    // Also listed on blanc://shortcuts/ — update SLASH_COMMANDS in
    // pages/shortcuts.js when adding or changing a command here.
    { cmd: '/favorites', hint: 'Open favorites', run: () => window.browserAPI.openPage('bookmarks') },
    { cmd: '/save', hint: 'Save this page to favorites — name a folder to file it', run: (input) => {
      const folder = (input ?? '').replace(/^\/save\s*/, '').trim();
      window.browserAPI.saveFavorite(folder || null);
    } },
    { cmd: '/history', hint: 'Open browsing history', run: () => window.browserAPI.openPage('history') },
    { cmd: '/downloads', hint: 'Open downloads', run: () => window.browserAPI.openPage('downloads') },
    { cmd: '/settings', hint: 'Open settings', run: () => window.browserAPI.openPage('settings') },
    { cmd: '/clear', hint: 'Clear browsing history', run: () => window.browserAPI.clearHistory() },
    { cmd: '/new', hint: 'Open a new tab', run: () => window.browserAPI.createTab(null, { focusAddress: false }) },
    { cmd: '/private', hint: 'Open a private tab (history stays untouched)', run: () => window.browserAPI.createTab(null, { private: true, focusAddress: false }) },
    { cmd: '/close', hint: 'Close this tab', run: () => state.activeTabId && window.browserAPI.closeTab(state.activeTabId) },
    { cmd: '/reopen', hint: 'Reopen the tab you just closed', run: () => window.browserAPI.reopenClosedTab() },
    { cmd: '/pin', hint: 'Pin or unpin this tab', run: () => state.activeTabId && window.browserAPI.toggleTabPinned(state.activeTabId) },
    { cmd: '/mute', hint: 'Mute or unmute this tab', run: () => state.activeTabId && window.browserAPI.toggleTabMuted(state.activeTabId) },
    { cmd: '/sleep', hint: 'Quiet background tabs and free their memory', run: () => window.browserAPI.sleepBackgroundTabs(), keepOverlay: true, clearInput: true, resultNotice: (quieted) => Array.isArray(quieted) && quieted.length === 0 ? 'No background tabs can be quieted right now.' : '' },
    { cmd: '/group', hint: 'Type a space, then a group name — e.g. "work"', run: (input) => {
      const name = (input ?? '').replace(/^\/group\s*/, '').trim();
      // A context-menu "New Group…" targets the right-clicked tab, not the
      // active one (overlay:show's purpose payload sets the pending target).
      const target = pendingGroupTabId ?? state.activeTabId;
      if (name && target) window.browserAPI.groupTabByName(target, name);
      pendingGroupTabId = null;
    } },
    { cmd: '/ungroup', hint: 'Take this tab out of its group', run: () => state.activeTabId && window.browserAPI.setTabGroup(state.activeTabId, null) },
    { cmd: '/close-group', hint: 'Close every tab in this group', run: () => {
      const groupId = activeTab()?.groupId;
      if (groupId) window.browserAPI.closeGroup(groupId);
    } },
    { cmd: '/find', hint: 'Find in page', run: () => window.browserAPI.openFindBar(), keepOverlay: true },
    { cmd: '/block-ads', hint: 'Block ads here, or toggle blocking everywhere', run: () => window.browserAPI.toggleAdblock() },
    { cmd: '/allow-ads', hint: 'Allow ads on this site', run: () => window.browserAPI.allowAdsOnActiveSite() },
    { cmd: '/theme', hint: 'Cycle appearance, or choose system / light / dark', run: (input) => {
      const requested = (input ?? '').replace(/^\/theme\s*/, '').trim();
      window.browserAPI.cycleTheme(requested || null);
    } },
    { cmd: '/patron', hint: 'Support Blanc with a Patron subscription', run: () => window.browserAPI.openPage('settings', 'patron') },
    { cmd: '/workspace', hint: 'Switch to a named workspace, or type a new name to save this window', keepOverlay: true, clearInput: true, run: (input) => {
      const name = (input ?? '').replace(/^\/workspace\s*/, '').trim();
      if (!name) {
        // Reveal the footer switcher — the resting list no longer carries a
        // workspaces section to scroll to.
        openWorkspaceSwitcher();
        return;
      }
      // Case-insensitive switch-if-exists; create (Patron-gated) if not —
      // never create-only, and never /group-style find-or-create-a-group.
      const existing = wsWorkspaces.find((w) => w.name.toLowerCase() === name.toLowerCase());
      if (existing) { switchToWorkspace(existing); return; }
      runWorkspaceMutation(window.browserAPI.saveWorkspaceAs(name), {
        context: { name },
        // Scratch guard's "save first" (beginScratchGuardSaveFirst) lands
        // here: a save that succeeds while a guard is awaiting one means
        // THIS window is now bound, so persistable tabs are covered. Retry
        // still uses force:false — private pages remaining will re-trip,
        // and retryScratchGuard's onUnsavedScratch re-shows the confirm.
        onSuccess: () => { if (pendingScratchGuard?.awaitingSave) retryScratchGuard(false); },
      });
    } },
  ];

  function runCommand(command) {
    // Commands like "/group work" read their argument from the typed input.
    const input = addressInput.value;
    const resultGeneration = ++commandResultGeneration;
    commandNotice = '';
    // Close first: commands that open something (a page, a fresh tab) rely
    // on main re-showing the overlay in a clean state where needed.
    if (!command.keepOverlay) window.browserAPI.closeOverlay();
    const result = command.run(input);
    // A command that stays open and leaves its own text typed keeps the list
    // on slash commands, so the rows it just changed are never on screen —
    // /sleep quieted tabs and showed nothing. Clearing restores the tab
    // switcher, which is where the dimming reads. Opt-in: /find deliberately
    // keeps its query. A programmatic value change fires no input event, so
    // the re-render has to be explicit.
    if (command.clearInput) {
      addressInput.value = '';
      renderList();
    }
    if (command.resultNotice) {
      Promise.resolve(result).then((value) => {
        if (resultGeneration !== commandResultGeneration) return;
        commandNotice = command.resultNotice(value);
        renderList();
      }, () => {
        if (resultGeneration !== commandResultGeneration) return;
        commandNotice = 'Could not quiet background tabs.';
        renderList();
      });
    }
  }

  function commandRow(command, isTop) {
    const row = document.createElement('div');
    row.className = 'island-row' + (isTop ? ' active' : '');

    const name = document.createElement('span');
    name.className = 'row-cmd';
    name.textContent = command.cmd;

    const hint = document.createElement('span');
    hint.className = 'row-hint';
    hint.textContent = command.hint;

    row.append(name, hint);
    if (isTop) row.append(enterGlyph());
    row.addEventListener('click', () => runCommand(command));
    return row;
  }

  function enterGlyph() {
    const enter = document.createElement('span');
    enter.className = 'row-enter';
    enter.textContent = '↵';
    return enter;
  }

  function emptyRow(text) {
    const empty = document.createElement('div');
    empty.className = 'island-empty';
    empty.textContent = text;
    return empty;
  }

  /** "› recently closed 4" — one foldable line like a synced device. Clear
   * stays reachable when unfolded. */
  function closedHeaderRow(count) {
    const row = document.createElement('div');
    row.className = 'island-ghead';
    row.innerHTML = `${CARET}<span class="ghead-name dim">recently closed</span><span class="ghead-n"></span>`;
    row.querySelector('.caret').classList.toggle('open', closedSectionOpen);
    row.querySelector('.ghead-n').textContent = String(count);
    row.title = closedSectionOpen ? 'Fold recently closed' : 'Unfold recently closed';
    row.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      closedSectionOpen = !closedSectionOpen;
      renderList();
    });
    if (closedSectionOpen) {
      const clear = document.createElement('button');
      clear.type = 'button';
      clear.className = 'closed-clear';
      clear.textContent = 'clear';
      clear.title = 'Forget all closed tabs';
      clear.setAttribute('aria-label', clear.title);
      clear.addEventListener('click', (e) => {
        e.stopPropagation();
        window.browserAPI.clearClosedEntries();
      });
      row.append(clear);
    }
    return row;
  }

  /** One recently-closed entry: ↶ glyph, title (· N tabs for a group), and a
   *  real Forget action. The live/snapshot recovery tier is deliberately
   *  private implementation detail. Click reopens THIS entry; main re-resolves
   *  either proposed id, so a stale renderer action is a no-op. */
  function closedRow(entry) {
    const row = document.createElement('div');
    row.className = 'island-row closed-row';
    row.setAttribute('role', 'button');
    row.title = 'Reopen closed tab';
    const glyph = document.createElement('span');
    glyph.className = 'closed-glyph';
    glyph.innerHTML = ICONS.reopen;
    const title = document.createElement('span');
    title.className = 'row-title';
    title.textContent = entry.tabCount > 1
      ? `${entry.title} · ${entry.tabCount} tabs`
      : entry.title;
    const forget = document.createElement('button');
    forget.type = 'button';
    forget.className = 'row-close closed-forget';
    forget.title = 'Forget closed tab';
    forget.setAttribute('aria-label', `${forget.title}: ${title.textContent}`);
    forget.innerHTML = ICONS.close;
    forget.addEventListener('click', (event) => {
      event.stopPropagation();
      window.browserAPI.forgetClosedEntry(entry.id);
    });
    row.append(glyph, title, forget);
    row.addEventListener('click', () => {
      window.browserAPI.closeOverlay();
      window.browserAPI.reopenClosedEntry(entry.id);
    });
    return row;
  }

  function commandNoticeRow(text) {
    const notice = emptyRow(text);
    notice.classList.add('command-notice');
    notice.setAttribute('role', 'status');
    return notice;
  }

  // --- Quick Switcher ---

  /** Loose matching: substring beats in-order character match; anything
   * else is out. */
  function matchScore(query, text) {
    const t = text.toLowerCase();
    if (t.includes(query)) return 2;
    let i = 0;
    for (const ch of t) {
      if (ch === query[i]) i++;
      if (i === query.length) return 1;
    }
    return 0;
  }

  /** matchScore's genuine-substring tier — the only one confident enough
   * to auto-navigate on bare Enter. The loose in-order fallback (score 1)
   * is too permissive: a long-lived history entry can in-order-match
   * almost any query sharing a few letters, once silently hijacking Enter
   * away from whatever was actually typed. Kind bonuses (below) top out at
   * +0.3, so they can never lift a weak match up to this tier. */
  const STRONG_MATCH_SCORE = 2;

  /** What a candidate is matched against: title + host + a capped path.
   * Query strings and fragments are deliberately excluded — OAuth/token
   * URLs carry kilobytes of base64 that in-order-matches almost any
   * typed query, which turned one dead Google consent URL in history
   * into the top "result" for every address typed. */
  function matchableText(title, url) {
    try {
      const u = new URL(url || '');
      return `${title || ''} ${u.host}${u.pathname.slice(0, 64)}`;
    } catch {
      return `${title || ''} ${(url || '').slice(0, 100)}`;
    }
  }

  const stripUrl = (u) => (u || '').replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');

  /** True when the typed text is a real navigation target rather than a search
   * query — mirrors the navigate branches of normalizeAddressInput (main.js)
   * and the HANDOFF_PROTOCOLS allowlist (external-protocols.js). When it's an
   * address, bare Enter navigates instead of letting a Quick-Switcher match
   * hijack it — a tab whose *title* merely contains "getbowser.com" must not
   * steal Enter away from actually opening getbowser.com. Kept in hand-sync
   * with those sources.
   *
   * Main can also navigate existing local .htm/.html/.xhtml paths. The
   * extension guard below intentionally errs on the private side even though
   * this sandboxed renderer cannot check whether a whitespace-bearing path
   * actually exists. */
  function looksLikeAddress(input) {
    const trimmed = (input || '').trim();
    if (!trimmed) return false;
    const scheme = trimmed.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):\/\//)?.[1]?.toLowerCase();
    if (scheme) return !['javascript', 'data', 'vbscript'].includes(scheme);
    if (/^(mailto|tel|facetime|sms):/i.test(trimmed)) return true;       // OS-handoff URIs (no "://")
    if (/^(?:\.{1,2}[\\/]|~[\\/]|[a-z]:[\\/])/i.test(trimmed)) return true;
    if (/\.(?:x?html?)(?:[?#].*)?$/i.test(trimmed)) return true;
    if (/^localhost(:\d+)?([/?#]|$)/.test(trimmed)) return true;
    if (/^(\d{1,3}\.){3}\d{1,3}(:\d+)?([/?#]|$)/.test(trimmed)) return true; // bare IPv4
    if (/^\[[0-9a-z:.%_-]+\](?::\d+)?([/?#]|$)/i.test(trimmed)) return true;
    if (/^[0-9a-f]*:[0-9a-f:]+([/?#]|$)/i.test(trimmed)) return true;
    return /^(?!\.)[^\s./?#:]+(?:\.[^\s./?#:]+)+(?::\d+)?([/?#][^\s]*)?$/u.test(trimmed);
  }

  function switcherResults(query) {
    const results = [];
    // Group names rank above their member tabs — "wor" jumps to the whole
    // work cluster, not one tab in it.
    for (const g of state.groups) {
      const count = state.tabs.filter((t) => t.groupId === g.id).length;
      if (!count) continue;
      const s = matchScore(query, g.name);
      if (s) results.push({ kind: 'group', title: g.name, sub: `${count} ${count === 1 ? 'tab' : 'tabs'}`, group: g, count, score: s + 0.3 });
    }
    for (const t of state.tabs) {
      const s = matchScore(query, matchableText(t.title, t.url));
      // Quiet is not shown here: it lives only on the row-level dim (panel row
      // and rail). The switcher sub is just the tab's domain.
      const sub = tabDomain(t);
      if (s) results.push({ kind: 'tab', title: t.title || 'New Tab', sub, tab: t, score: s + 0.2 });
    }
    for (const f of favorites) {
      const s = matchScore(query, matchableText(f.title, f.url));
      // Carry a tab-shaped record so resultRow's shared setFavicon path can
      // paint the stored PNG — the Favorite store is the source of truth, not
      // an open tab (which may not even be loaded).
      if (s) results.push({
        kind: 'favorite',
        title: f.title,
        sub: stripUrl(f.url),
        url: f.url,
        tab: { url: f.url, favicon: f.favicon },
        score: s + 0.1,
      });
    }
    // Remote tabs rank below local tabs (+0.2) and favorites (+0.1), above
    // history (+0) — spec §2. The url-keyed dedup below keeps the
    // higher-ranked favorite row when both match.
    for (const device of remoteDevices) {
      for (const t of device.tabs) {
        const s = matchScore(query, matchableText(t.title, t.url));
        if (s) results.push({ kind: 'remote', title: t.title || t.url, sub: `${hostOfUrl(t.url)} · ${device.name}`, url: t.url, tab: t, score: s + 0.05 });
      }
    }
    for (const h of historyEntries) {
      const s = matchScore(query, matchableText(h.title, h.url));
      if (s) results.push({ kind: 'history', title: h.title, sub: stripUrl(h.url), url: h.url, score: s });
    }
    const seen = new Set();
    return results
      .sort((a, b) => b.score - a.score)
      .filter((r) => {
        const key = r.kind === 'tab' ? `tab:${r.tab.id}` : r.kind === 'group' ? `group:${r.group.id}` : r.url;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 6);
  }

  function searchResults(query) {
    const results = [{
      kind: 'search',
      title: query,
      query,
      // The exact text is a fresh submission, so main must resolve it against
      // the default engine at click/Enter time. Completions retain provider
      // provenance for their label, but main rejects stale routing metadata.
      providerId: null,
      providerLabel: searchProviderLabel,
      exact: true,
    }];
    if (providerSuggestionQuery.toLowerCase() !== query.toLowerCase()) return results;
    const seen = new Set([query.toLowerCase()]);
    for (const suggestion of providerSuggestions) {
      const key = suggestion.toLowerCase();
      if (!suggestion || seen.has(key)) continue;
      seen.add(key);
      results.push({
        kind: 'search',
        title: suggestion,
        query: suggestion,
        providerId: searchProviderId,
        providerLabel: searchProviderLabel,
        exact: false,
      });
    }
    return results;
  }

  /** Keep six rows total. A confident local match retains the established
   * Quick-Switcher top slot; otherwise exact search leads, followed by engine
   * completions and then the weaker local guesses. */
  function blendedResults(query) {
    const local = switcherResults(query.toLowerCase());
    const search = searchResults(query);
    if (local[0]?.score >= STRONG_MATCH_SCORE) {
      return [
        ...local.slice(0, 3),
        ...search.slice(0, 3),
        // Provider suggestions are optional. Let additional local matches fill
        // any of their unused slots instead of leaving the six-row list short.
        ...local.slice(3),
        ...search.slice(3),
      ].slice(0, 6);
    }
    return [
      ...search.slice(0, 4),
      ...local.slice(0, 2),
      // Private/pasted/disabled/offline autocomplete normally leaves only the
      // exact-search row, so backfill the remainder from the local switcher.
      ...local.slice(2),
      ...search.slice(4),
    ].slice(0, 6);
  }

  function resultKey(result) {
    if (!result) return '';
    if (result.kind === 'group') return `group:${result.group.id}`;
    if (result.kind === 'tab') return `tab:${result.tab.id}`;
    if (result.kind === 'search') return `search:${result.query.toLowerCase()}`;
    return `${result.kind}:${result.url}`;
  }

  function pickResult(result) {
    if (result.kind === 'group') window.browserAPI.focusGroup(result.group.id);
    else if (result.kind === 'tab') window.browserAPI.switchTab(result.tab.id);
    else if (result.kind === 'remote') window.browserAPI.createTab(result.url, { focusAddress: false });
    else if (result.kind === 'search' && state.activeTabId) {
      window.browserAPI.search(state.activeTabId, result.query, result.providerId);
    }
    else if (state.activeTabId) window.browserAPI.navigate(state.activeTabId, result.url);
    window.browserAPI.closeOverlay();
  }

  // isActive follows either explicit arrow selection or the bare-Enter target.
  // isEnterTarget controls the ↵ glyph separately so it always tells the truth.
  function resultRow(result, isActive, isEnterTarget) {
    const row = document.createElement('div');
    row.className = 'island-row' + (isActive ? ' active' : '');

    // Groups lead with the same caret as section headers (no mini-dot cluster);
    // search completions use a magnifier; every page-like result keeps the
    // shared favicon treatment.
    let leading;
    if (result.kind === 'group') {
      leading = document.createElement('span');
      leading.className = 'row-group-mark';
      leading.innerHTML = CARET;
      leading.setAttribute('aria-hidden', 'true');
    } else if (result.kind === 'search') {
      leading = document.createElement('span');
      leading.className = 'row-search-icon';
      leading.innerHTML = ICONS.search;
    } else {
      leading = document.createElement('span');
      setFavicon(leading, result.tab ?? null);
    }

    const title = document.createElement('span');
    title.className = 'row-title';
    title.textContent = result.title || result.url || '';

    const sub = document.createElement('span');
    sub.className = 'row-sub';
    sub.textContent = result.sub || '';

    const tag = document.createElement('span');
    tag.className = 'row-tag';
    tag.textContent = result.kind === 'search' ? result.providerLabel : result.kind;

    row.append(leading, title, sub, tag);
    if (isEnterTarget) row.append(enterGlyph());
    row.addEventListener('click', () => pickResult(result));
    return row;
  }

  // --- List area: tabs at rest, commands on "/", switcher while typing ---

  // A tab-row action (pin, mute, close, or a context-menu item) triggers a
  // tabs:updated → replaceChildren that destroys the focused button, dropping
  // keyboard focus to <body>. Remember the focused row + which control, and
  // restore it on the rebuilt row so Tab order and AT focus survive the
  // action — this is the keyboard path grouping now relies on (Shift+F10 /
  // menu key / VoiceOver open the row menu from the focused row).
  function focusedRowAnchor() {
    const el = document.activeElement;
    const row = el && el.closest && el.closest('.island-row[data-tab-id]');
    if (!row || !islandList.contains(row)) return null;
    const control = ['row-primary', 'row-pin', 'row-mute', 'row-glance', 'row-close']
      .find((c) => el.classList?.contains(c)) ?? 'row-primary';
    return { tabId: row.dataset.tabId, control };
  }
  function restoreRowFocus(anchor) {
    if (!anchor) return;
    const row = islandList.querySelector(
      `.island-row[data-tab-id="${CSS.escape(anchor.tabId)}"]`);
    (row?.querySelector(`.${anchor.control}`) ?? row?.querySelector('.row-primary'))?.focus();
  }

  // Applied at the tail of renderList / paintWorkspaceSwitcher, after the
  // target input is in the document AND focusable. It deliberately runs last
  // so an inline editor outranks restoreRowFocus. focus() on a detached or
  // visibility:hidden node is a silent no-op — leave the intent pending in
  // the hidden case so a later call (after visibility is restored) can land.
  function focusPendingEditor() {
    const pending = pendingEditorFocus;
    if (!pending) return;
    const inList = islandList.contains(pending.input);
    const inSwitcher = workspaceSwitcher.contains(pending.input);
    if (!inList && !inSwitcher) {
      pendingEditorFocus = null;
      return;
    }
    if (
      inSwitcher
      && (workspaceSwitcher.hidden || workspaceSwitcher.style.visibility === 'hidden')
    ) {
      return;
    }
    pendingEditorFocus = null;
    pending.input.focus();
    if (pending.caret != null) pending.input.setSelectionRange(pending.caret, pending.caret);
    else if (pending.select) pending.input.select();
  }

  function renderList() {
    if (pointerHeld) {
      renderQueued = true;
      return;
    }
    const rowAnchor = focusedRowAnchor();
    const value = addressInput.value;
    const selectedKey = selectedResultIndex >= 0
      ? resultKey(visibleResults[selectedResultIndex])
      : '';
    visibleCommands = [];
    visibleResults = [];

    if (inputTouched && value.startsWith('/')) {
      selectedResultIndex = -1;
      const slashWord = value.trim().split(/\s+/)[0];
      visibleCommands = COMMANDS.filter((c) => c.cmd.startsWith(slashWord) || slashWord === '/');
      islandList.replaceChildren(
        ...(visibleCommands.length
          ? visibleCommands.map((c, i) => commandRow(c, i === 0))
          : [emptyRow('no matching command')])
      );
    } else if (inputTouched && value.trim()) {
      const query = value.trim();
      // When the input is itself an address, Enter navigates (see the keydown
      // handler), and no provider request/result should see it.
      const enterNavigates = looksLikeAddress(value);
      visibleResults = enterNavigates
        ? switcherResults(query.toLowerCase())
        : blendedResults(query);

      if (selectedKey) {
        selectedResultIndex = visibleResults.findIndex((result) => resultKey(result) === selectedKey);
      } else if (selectedResultIndex >= visibleResults.length) {
        selectedResultIndex = -1;
      }
      const defaultEnterIndex = !enterNavigates
        && visibleResults.length
        && (visibleResults[0].kind === 'search' || visibleResults[0].score >= STRONG_MATCH_SCORE)
        ? 0
        : -1;
      // An address has no implicit result target: leave every row neutral until
      // the user presses an arrow. Search text and strong local matches retain
      // their truthful bare-Enter highlight.
      const activeIndex = selectedResultIndex >= 0 ? selectedResultIndex : defaultEnterIndex;
      const enterIndex = selectedResultIndex >= 0 ? selectedResultIndex : defaultEnterIndex;
      islandList.replaceChildren(
        ...(visibleResults.length
          ? visibleResults.map((r, i) => resultRow(r, i === activeIndex, i === enterIndex))
          : [emptyRow('no matches — ↵ opens as address or search')])
      );
    } else {
      selectedResultIndex = -1;
      const pinned = state.tabs.filter((t) => t.pinned && !t.groupId);
      const rows = [];
      // Scratch guard takes the same top-of-list slot commandNotice uses —
      // the two never coexist (see runWorkspaceMutation's onUnsavedScratch,
      // which intercepts 'unsaved-scratch' before it ever becomes a plain
      // commandNotice string).
      if (pendingScratchGuard) rows.push(scratchGuardRow());
      else if (commandNotice) rows.push(commandNoticeRow(commandNotice));
      if (pinned.length) {
        rows.push(pinnedHeaderRow(pinned.length));
        rows.push(...pinned.map(tabRow));
      }

      const clusters = clusterTabs();
      const shortcutOffset = pinned.length ? 1 : 0;
      for (const [clusterIndex, { group, tabs: gtabs }] of clusters.entries()) {
        if (group) {
          const bandNodes = [groupHeaderRow(group, gtabs.length, clusterIndex + shortcutOffset)];
          // Collapsed: header alone. Open: indent membership under the group.
          if (!group.collapsed) {
            for (const t of gtabs) {
              const row = tabRow(t);
              row.classList.add('in-group');
              bandNodes.push(row);
            }
          }
          rows.push(groupBand(bandNodes));
        } else {
          rows.push(...gtabs.map(tabRow));
        }
      }

      const furniture = [];
      for (const device of remoteDevices) {
        furniture.push(remoteHeaderRow(device));
        if (unfoldedDevices.has(device.deviceId)) {
          furniture.push(...clusterRemoteTabs(device).map((t) => remoteTabRow(t, device)));
        }
      }
      const closed = (state.closed ?? []).slice(-4).reverse(); // newest first
      if (closed.length) {
        furniture.push(closedHeaderRow(closed.length));
        if (closedSectionOpen) furniture.push(...closed.map(closedRow));
      }
      if (furniture.length) {
        const wrap = document.createElement('div');
        wrap.className = 'island-furniture';
        wrap.append(...furniture);
        rows.push(wrap);
      }
      islandList.replaceChildren(...rows);
      // Only the resting tab list preserves row focus; the "/" command and
      // switcher branches drive focus from the input, not the rows.
      restoreRowFocus(rowAnchor);
    }

    focusPendingEditor();

    islandHint.textContent = activeTab()?.private
      ? 'private · nothing here is saved to history'
      : state.groups.length
        ? `/group moves this tab · ${modKey}1–9 jumps between sections`
        : `${modKey}L summons · / for commands`;
  }

  function renderPanel() {
    // The private theme scope follows the active tab.
    if (activeTab()?.private) document.documentElement.dataset.theme = 'private';
    else delete document.documentElement.dataset.theme;
    renderPanelChrome();
    renderList();
  }

  function resetSearchSuggestions() {
    if (suggestionDebounce) clearTimeout(suggestionDebounce);
    suggestionDebounce = null;
    suggestionRequestGeneration += 1;
    providerSuggestions = [];
    providerSuggestionQuery = '';
    searchProviderId = null;
    searchProviderLabel = 'search';
  }

  function scheduleSearchSuggestions() {
    resetSearchSuggestions();
    const query = addressInput.value.trim();
    // Provider autocomplete is intentionally off in private tabs: typed
    // prefixes stay local until the user explicitly submits a search.
    if (
      !inputTouched
      || query.length < 2
      || query.startsWith('/')
      || looksLikeAddress(query)
      || activeTab()?.private
      || addressInputComposing
      || suppressProviderSuggestions
    ) return;

    const generation = suggestionRequestGeneration;
    suggestionDebounce = setTimeout(async () => {
      suggestionDebounce = null;
      let response;
      try {
        response = await window.browserAPI.searchSuggestions(query);
      } catch {
        return;
      }
      if (
        generation !== suggestionRequestGeneration
        || (mode !== 'panel' && mode !== 'palette')
        || addressInput.value.trim() !== query
        || activeTab()?.private
      ) return;
      searchProviderId = typeof response?.engine === 'string' ? response.engine : null;
      searchProviderLabel = typeof response?.label === 'string' && response.label
        ? response.label
        : 'search';
      providerSuggestionQuery = query;
      providerSuggestions = Array.isArray(response?.suggestions)
        ? response.suggestions.filter((item) => typeof item === 'string')
        : [];
      renderList();
    }, 200);
  }

  // --- Mode switching (driven by main via overlay:show / overlay:hide) ---

  function applyMode(next, prefill, purpose) {
    const reshow = mode === next;
    // A press the overlay never saw released (dismissed mid-click) must not
    // leave the list frozen behind a stale hold.
    pointerHeld = false;
    renderQueued = false;
    mode = next;
    glancePickerPurpose = next === 'glance' ? purpose : null;
    document.body.dataset.mode = next ?? '';
    document.body.dataset.glancePurpose = glancePickerPurpose ?? '';
    if (next !== 'panel' && next !== 'palette') closeWorkspaceSwitcher();
    backdrop.hidden = next !== 'panel' && next !== 'palette';
    panelAnchor.hidden = next !== 'panel' && next !== 'palette';
    findBar.hidden = next !== 'find';
    shieldPop.hidden = next !== 'shield';
    capturePop.hidden = next !== 'capture';
    glancePickerEl.hidden = next !== 'glance';

    if (next === 'panel' || next === 'palette') {
      if (!reshow) {
        pendingGroupTabId = null;
        clearWorkspacePopoverEditors();
        pendingScratchGuard = null;
        closeWorkspaceSwitcher();
        addressInputComposing = false;
        suppressProviderSuggestions = false;
        commandResultGeneration += 1;
        commandNotice = '';
      }
      if (!reshow) resetSearchSuggestions();
      // A menu-triggered "New Group…" carries its target tab inside the
      // atomic overlay:show payload (and so survives the did-finish-load
      // replay after a slow first load or renderer crash — a separate
      // message would be lost and Enter would silently group the ACTIVE
      // tab). Glance's string purposes fall through harmlessly.
      if (purpose && typeof purpose === 'object' && purpose.beginGroupTabId != null) {
        pendingGroupTabId = purpose.beginGroupTabId;
      }
      // A workspace row's context menu (main process) has no other channel
      // back into an already-open panel — same atomic-payload reasoning as
      // New Group… above. Unconditional (not just !reshow): the panel is
      // always already open when a row's menu fires, so this only ever runs
      // as a reshow, and each purpose always targets the CURRENT edit/
      // confirm state, replacing whatever the last one was. Editors open
      // inside the footer popover.
      if (purpose && typeof purpose === 'object' && purpose.renameWorkspaceId != null) {
        pendingCreateWorkspace = false;
        createWorkspaceValue = '';
        pendingSaveAsWorkspace = false;
        saveAsWorkspaceValue = '';
        pendingRenameWorkspaceId = purpose.renameWorkspaceId;
        pendingDeleteWorkspaceId = null;
        workspaceEditValue = wsWorkspaces.find((w) => w.id === pendingRenameWorkspaceId)?.name ?? '';
        claimEditorFocus = true;
      }
      if (purpose && typeof purpose === 'object' && purpose.deleteWorkspaceId != null) {
        pendingCreateWorkspace = false;
        createWorkspaceValue = '';
        pendingSaveAsWorkspace = false;
        saveAsWorkspaceValue = '';
        pendingDeleteWorkspaceId = purpose.deleteWorkspaceId;
        pendingRenameWorkspaceId = null;
        workspaceEditValue = '';
      }
      if (prefill) {
        // A menu-triggered command (e.g. "New Group…") arrives pre-typed —
        // land the cursor at the end, ready to type the rest, rather than
        // selecting the whole string the way a fresh open does below.
        inputTouched = true;
        addressInput.value = prefill;
      } else if (!reshow || !inputTouched) {
        // A reassert (main re-focusing the same open panel) must not
        // clobber what the user already typed.
        inputTouched = false;
        addressInput.value = addressDisplayValue(activeTab());
      }
      refreshSwitcherData();
      renderPanel();
      if (workspacePopoverEditing()) {
        openWorkspaceSwitcher();
      } else {
        // A pending workspace edit/confirm already claimed focus on its own
        // inline control — the address input must not steal it back.
        addressInput.focus();
        if (prefill) addressInput.setSelectionRange(prefill.length, prefill.length);
        else addressInput.select();
      }
    } else if (next === 'find') {
      findInput.focus();
      findInput.select();
    } else if (next === 'glance') {
      if (!reshow) {
        glancePickerInput.value = '';
        glancePickerSelectedId = null;
        glancePickerError = '';
        glancePickerBusy = false;
      }
      renderGlancePicker({ announce: !reshow });
      glancePickerInput.focus();
    } else if (next === 'shield') {
      renderShieldPop();
      (shieldPopToggle.hidden ? shieldPopSettings : shieldPopToggle).focus();
    } else if (next === 'capture') {
      renderCapturePop();
      capturePopRows.querySelector('.capture-pop-stop')?.focus();
    }
  }

  // Static glyph geometry, built via the namespace API — never innerHTML, so
  // row data (host names are site-controlled text) can't ever ride into
  // markup by a later edit.
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const MIC_SHAPES = [
    ['rect', { x: '6', y: '2.2', width: '4', height: '7', rx: '2' }],
    ['path', { d: 'M3.8 8.2a4.2 4.2 0 0 0 8.4 0M8 12.4v1.8' }],
  ];
  const CAM_SHAPES = [
    ['rect', { x: '2.2', y: '4.6', width: '8.2', height: '6.8', rx: '1.6' }],
    ['path', { d: 'M10.4 7.2l3.4-1.8v5.2l-3.4-1.8z' }],
  ];
  function captureGlyph(shapes) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('aria-hidden', 'true');
    for (const [tag, attrs] of shapes) {
      const el = document.createElementNS(SVG_NS, tag);
      for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value);
      svg.append(el);
    }
    return svg;
  }

  // Renders from the last tabs:updated broadcast, exactly like the shield —
  // rows appear/disappear live while the popover is open (main closes it
  // itself when the list empties).
  function renderCapturePop() {
    const rows = state.capturePopover?.rows ?? [];
    capturePopRows.replaceChildren(...rows.map((row) => {
      // Two REAL sibling buttons in a plain list item — a role=button row
      // wrapping the Stop button would be an invalid accessibility tree
      // (no interactive content inside a button), and native buttons get
      // Enter/Space handling for free.
      const li = document.createElement('li');
      li.className = 'capture-pop-row';
      const scopeLabel = row.audio && row.video ? 'camera & microphone in use'
        : row.video ? 'camera in use' : 'microphone in use';
      const hostLabel = row.host || 'popup window';
      const go = document.createElement('button');
      go.className = 'capture-pop-go';
      go.setAttribute('aria-label', `${hostLabel} — ${scopeLabel}; go to it`);
      const glyphs = document.createElement('span');
      glyphs.className = 'capture-pop-glyphs';
      if (row.audio) glyphs.append(captureGlyph(MIC_SHAPES));
      if (row.video) glyphs.append(captureGlyph(CAM_SHAPES));
      const host = document.createElement('span');
      host.className = 'host';
      host.textContent = hostLabel;
      go.append(glyphs, host);
      go.addEventListener('click', () => window.browserAPI.captureFocus(row.surfaceId));
      const stop = document.createElement('button');
      stop.className = 'capture-pop-stop';
      stop.textContent = 'stop';
      stop.setAttribute('aria-label', `stop — ${hostLabel} ${scopeLabel}`);
      stop.addEventListener('click', () => window.browserAPI.captureStop(row.surfaceId));
      li.append(go, stop);
      return li;
    }));
  }

  // Renders from the last tabs:updated broadcast — main recomputes
  // state.shieldPopover on every broadcast, so a toggle flip or a load's
  // climbing block count re-renders live while the popover is open.
  function renderShieldPop() {
    const v = state.shieldPopover;
    if (!v) { window.browserAPI.closeOverlay(); return; }
    shieldPopHost.textContent = v.host;
    shieldPopOnOff.textContent = v.on ? 'on' : 'off';
    shieldPopToggle.hidden = v.variant !== 'site';
    shieldPopToggle.classList.toggle('on', v.on);
    shieldPopToggle.setAttribute('aria-checked', String(v.on));
    // Scheme-level label. "Uses HTTPS", never "Encrypted connection" — the
    // scheme proves the address, not a negotiated and verified session. A null
    // connection (loading, or a url with no claim to make) hides the row
    // rather than leaving a stale statement on screen.
    const connectionLabel = CONNECTION_LABEL[v.connection] ?? null;
    shieldPopConnection.textContent = connectionLabel ?? '';
    shieldPopConnection.hidden = !connectionLabel;
    shieldPopConnection.classList.toggle('insecure', v.connection === 'http');
    shieldPopCount.textContent = v.countLine;
    shieldPopNote.hidden = v.variant !== 'site';
  }

  shieldPopToggle.addEventListener('click', () => {
    // on → allow ads here; off (excepted) → re-block here. The popover only
    // shows this switch in the 'site' variant, so toggleAdblock can never
    // reach its global branch from the pill.
    if (state.shieldPopover?.on) window.browserAPI.allowAdsOnActiveSite();
    else window.browserAPI.toggleAdblock();
  });
  shieldPopSettings.addEventListener('click', () => {
    window.browserAPI.closeOverlay();
    window.browserAPI.openPage('settings', 'blocking');
  });

  function resetFind() {
    findInput.value = '';
    findCount.textContent = '';
    if (findLastQuery && state.activeTabId) window.browserAPI.stopFindInPage(state.activeTabId);
    findLastQuery = null;
  }

  // ⌘L pressed while the island is already open. Anything the user typed is
  // theirs: re-select it the way a browser address bar does rather than
  // discarding it. Only an untouched island — still showing the current page's
  // address — has nothing to lose and can be dismissed. Length, not a trimmed
  // test: whitespace someone typed or pasted is still their input, and only a
  // genuinely emptied field counts as nothing.
  window.browserAPI.onOverlayToggle(() => {
    if (inputTouched && addressInput.value.length > 0) {
      addressInput.focus();
      addressInput.select();
      return;
    }
    window.browserAPI.closeOverlay();
  });
  /* The panel grows out of the resting pill. They are separate views, so the
   * pill's box arrives from main; we start the panel matching it — same width,
   * same top, capsule corners — and let one frame later carry it to full size.
   *
   * Scale rather than width/height: animating the box would reflow the list on
   * every frame. The contents are held invisible until the growth is underway,
   * so the squash a uniform scale puts on them is never on screen. */
  const MORPH_MS = 320;   // long enough for the contents' 190ms delay + fade
  const RETRACT_MS = 200; // keep in step with OVERLAY_RETRACT_MS in main.js
  let lastPillRect = null;
  let morphTimer = null;
  let morphGeneration = 0;

  function morphPanelFromPill(pillRect) {
    if (!pillRect || !pillRect.width) return;          // no box reported yet
    if (prefersReducedMotion()) return;                 // decorative; skip entirely
    const panelBox = islandPanel.getBoundingClientRect();
    if (!panelBox.width || !panelBox.height) return;

    // Animate the panel's actual SIZE, not a transform scale.
    //
    // Scaling warps the corners: a round corner under a non-uniform scale
    // renders as an ellipse, and no amount of pre-compensating the radius
    // holds it steady, because the radius interpolates linearly while the
    // scale does not. The panel's resting corner (18px) and the pill's
    // (half its height, ~19px) are nearly the same, so the corner should
    // barely move at all — and with real width and height it doesn't.
    //
    // It also means the contents are revealed rather than squashed, so they
    // never rubber out on the way in.
    lastPillRect = pillRect;
    const naturalWidth = panelBox.width;
    const naturalHeight = panelBox.height;
    const pillCentre = pillRect.x + pillRect.width / 2;
    const panelCentre = panelBox.left + panelBox.width / 2;

    clearTimeout(morphTimer);
    const generation = ++morphGeneration;
    islandPanel.classList.add('morph-start');
    islandPanel.style.width = `${pillRect.width.toFixed(1)}px`;
    islandPanel.style.height = `${pillRect.height.toFixed(1)}px`;
    islandPanel.style.borderRadius = `${(pillRect.height / 2).toFixed(1)}px`;
    islandPanel.style.setProperty('--morph-x', `${(pillCentre - panelCentre).toFixed(2)}px`);
    islandPanel.style.setProperty('--morph-y', `${(pillRect.y - panelBox.top).toFixed(2)}px`);

    // Two frames: one for the start state to be painted, one to leave it. A
    // single frame lands both in the same style recalculation and the panel
    // simply appears at full size.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (generation !== morphGeneration) return;
      islandPanel.classList.remove('morph-start');
      islandPanel.classList.add('morph-run');
      islandPanel.style.width = `${naturalWidth.toFixed(1)}px`;
      islandPanel.style.height = `${naturalHeight.toFixed(1)}px`;
      islandPanel.style.borderRadius = '';
      islandPanel.style.removeProperty('--morph-x');
      islandPanel.style.removeProperty('--morph-y');
      morphTimer = setTimeout(() => {
        if (generation !== morphGeneration) return;
        // Hand the box back to layout, so the panel resizes normally again
        // when tabs open and close underneath it.
        islandPanel.classList.remove('morph-run');
        islandPanel.style.width = '';
        islandPanel.style.height = '';
      }, MORPH_MS + 60);
    }));
  }

  const prefersReducedMotion = () =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  window.browserAPI.onOverlayShow(({ mode: next, prefill, purpose, pillRect }) => {
    const wasOpen = mode === next;
    // A quick close/reopen can arrive while the old retract timer is still
    // holding `pointer-events: none` on the panel. Cancel that stale exit
    // before constructing the new opening state, or the fresh panel renders
    // but cannot be clicked and is hidden when the old timer fires.
    if (!wasOpen && (next === 'panel' || next === 'palette')) clearMorphStyles();
    applyMode(next, prefill, purpose);
    if (!wasOpen && (next === 'panel' || next === 'palette')) morphPanelFromPill(pillRect);
  });
  // Main's overlay before-input owns Escape; when the workspace popover is
  // open it forwards here instead of hideOverlay so editors dismiss first.
  window.browserAPI.onOverlayEscape(() => {
    if (!handleWorkspaceEscape()) window.browserAPI.closeOverlay();
  });
  /* Closing: the panel shrinks back into the pill. Main holds the overlay view
   * on screen for RETRACT_MS so there is something left to draw, and hands
   * focus back immediately — only the pixels linger. */
  function retractPanelIntoPill() {
    const pill = lastPillRect;
    if (!pill || !pill.width || prefersReducedMotion()) return false;
    const box = islandPanel.getBoundingClientRect();
    if (!box.width) return false;

    clearTimeout(morphTimer);
    const generation = ++morphGeneration;
    // Pin the current size first, or transitioning from `auto` does nothing.
    islandPanel.classList.add('morph-run', 'retracting');
    islandPanel.style.width = `${box.width.toFixed(1)}px`;
    islandPanel.style.height = `${box.height.toFixed(1)}px`;

    requestAnimationFrame(() => {
      if (generation !== morphGeneration) return;
      const centreShift = (pill.x + pill.width / 2) - (box.left + box.width / 2);
      islandPanel.style.width = `${pill.width.toFixed(1)}px`;
      islandPanel.style.height = `${pill.height.toFixed(1)}px`;
      islandPanel.style.borderRadius = `${(pill.height / 2).toFixed(1)}px`;
      islandPanel.style.setProperty('--morph-x', `${centreShift.toFixed(2)}px`);
      islandPanel.style.setProperty('--morph-y', `${(pill.y - box.top).toFixed(2)}px`);
    });
    return true;
  }

  /** Put the panel back to its resting styles once it is off screen. */
  function clearMorphStyles() {
    clearTimeout(morphTimer);
    morphGeneration += 1;
    islandPanel.classList.remove('morph-start', 'morph-run', 'retracting');
    islandPanel.style.width = '';
    islandPanel.style.height = '';
    islandPanel.style.borderRadius = '';
    islandPanel.style.removeProperty('--morph-x');
    islandPanel.style.removeProperty('--morph-y');
  }

  window.browserAPI.onOverlayHide((payload) => {
    const retracting = payload?.retract && (mode === 'panel' || mode === 'palette')
      && retractPanelIntoPill();
    if (mode === 'find') resetFind();
    mode = null;
    glancePickerPurpose = null;
    glancePickerSelectedId = null;
    glancePickerError = '';
    glancePickerBusy = false;
    document.body.dataset.mode = '';
    document.body.dataset.glancePurpose = '';
    backdrop.hidden = true;
    if (retracting) {
      // The anchor stays up until the panel has shrunk away. pointer-events
      // are dropped in CSS so the page underneath is clickable straight away.
      morphTimer = setTimeout(() => { panelAnchor.hidden = true; clearMorphStyles(); }, RETRACT_MS);
    } else {
      panelAnchor.hidden = true;
      clearMorphStyles();
    }
    findBar.hidden = true;
    shieldPop.hidden = true;
    glancePickerEl.hidden = true;
    inputTouched = false;
    commandResultGeneration += 1;
    commandNotice = '';
    addressInputComposing = false;
    suppressProviderSuggestions = false;
    pendingGroupTabId = null;
    clearWorkspacePopoverEditors();
    pendingScratchGuard = null;
    closeWorkspaceSwitcher();
    selectedResultIndex = -1;
    resetSearchSuggestions();
  });

  document.addEventListener('pointerdown', () => { pointerHeld = true; }, true);
  // rAF, not the pointerup itself: mouseup and click are still dispatched from
  // this same input task, and re-rendering before them would drop the click
  // exactly as an untimed broadcast would.
  document.addEventListener('pointerup', () => requestAnimationFrame(releasePointerHold), true);
  document.addEventListener('pointercancel', releasePointerHold, true);
  // A press that ends outside the view never delivers pointerup here.
  window.addEventListener('blur', releasePointerHold);

  // Click on the backdrop (anywhere outside the panel) dismisses.
  backdrop.addEventListener('mousedown', () => window.browserAPI.closeOverlay());
  document.addEventListener('mousedown', (event) => {
    if (mode === 'glance' && !event.target.closest('#glancePicker')) {
      window.browserAPI.closeOverlay('cancel');
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    // Prefer the IPC path (overlay:escape from main) — main's before-input
    // consumes Escape before this listener would see it. Kept as a fallback
    // for harnesses that inject keydown into the document directly.
    if (handleWorkspaceEscape()) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    window.browserAPI.closeOverlay();
  });

  /** Layered Esc for the footer workspace popover. Returns true if handled
   * (editor cancel or popover close) so main must not hide the whole island. */
  function handleWorkspaceEscape() {
    if (pendingCreateWorkspace) { cancelCreateWorkspace(); return true; }
    if (pendingSaveAsWorkspace) { cancelSaveAsWorkspace(); return true; }
    if (pendingRenameWorkspaceId != null) { cancelWorkspaceEdit(); return true; }
    if (pendingDeleteWorkspaceId != null) { cancelWorkspaceDelete(); return true; }
    if (workspaceSwitcherOpen) { closeWorkspaceSwitcher(); return true; }
    return false;
  }

  // --- Panel wiring ---

  dismissBtn.addEventListener('click', () => window.browserAPI.closeOverlay());
  backBtn.addEventListener('click', () => state.activeTabId && window.browserAPI.goBack(state.activeTabId));
  fwdBtn.addEventListener('click', () => state.activeTabId && window.browserAPI.goForward(state.activeTabId));
  reloadBtn.addEventListener('click', () => {
    if (!state.activeTabId) return;
    activeTab()?.isLoading
      ? window.browserAPI.stop(state.activeTabId)
      : window.browserAPI.reload(state.activeTabId);
  });
  heartBtn.addEventListener('click', () => window.browserAPI.toggleBookmark());

  // --- Footer action bar (static: new tab / private launchers + quick pages) ---
  // These moved out of the scrollable list so they stay put while it shows
  // slash commands or Quick-Switcher results. Platform-correct shortcut hints.
  document.getElementById('footerNewTabKbd').textContent = `${modKey}T`;
  document.getElementById('footerNewPrivateKbd').textContent = `${modShiftKey}N`;
  footerNewTab.title = `New tab (${modKey}T)`;
  footerNewPrivate.title = `New private tab (${modShiftKey}N)`;

  // focusAddress:false keeps the panel closed and lands the user on the fresh
  // tab, rather than main re-summoning the launchpad (its default for ⌘T).
  footerNewTab.addEventListener('click', () => {
    window.browserAPI.closeOverlay();
    window.browserAPI.createTab(null, { focusAddress: false });
  });
  footerNewPrivate.addEventListener('click', () => {
    window.browserAPI.closeOverlay();
    window.browserAPI.createTab(null, { private: true, focusAddress: false });
  });
  // Each shortcut opens its internal page; close first so main can re-show
  // the overlay cleanly where needed (mirrors runCommand for /favorites etc).
  const openPageFromFooter = (name) => {
    window.browserAPI.closeOverlay();
    window.browserAPI.openPage(name);
  };
  footerWorkspace.addEventListener('mousedown', (e) => {
    // Mouse activation must not leave a focus ring on the control (same
    // preventDefault pattern as the resting pill's affordance buttons).
    if (e.button === 0) e.preventDefault();
  });
  footerWorkspace.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleWorkspaceSwitcher();
  });
  wsSwitcherNew.addEventListener('click', () => beginCreateWorkspace());
  wsSwitcherSaveAs.addEventListener('click', () => beginSaveWorkspace());
  // Click outside the popover (and outside its trigger) dismisses it without
  // collapsing the island — backdrop/list clicks still reach their handlers.
  document.addEventListener('mousedown', (e) => {
    if (!workspaceSwitcherOpen) return;
    if (e.target.closest('#workspaceSwitcher') || e.target.closest('#footerWorkspace')) return;
    closeWorkspaceSwitcher();
  });
  footerFavorites.addEventListener('click', () => openPageFromFooter('bookmarks'));
  footerHistory.addEventListener('click', () => openPageFromFooter('history'));
  footerDownloads.addEventListener('click', () => openPageFromFooter('downloads'));
  footerTabLayout.addEventListener('click', () => {
    const nextLayout = state.tabLayout === 'vertical' ? 'island' : 'vertical';
    window.browserAPI.setTabLayout(nextLayout);
  });
  footerSettings.addEventListener('click', () => openPageFromFooter('settings'));

  addressInput.addEventListener('compositionstart', () => {
    addressInputComposing = true;
    if (activeTab()?.private) suppressProviderSuggestions = true;
    selectedResultIndex = -1;
    resetSearchSuggestions();
    renderList();
  });
  addressInput.addEventListener('compositionend', () => {
    addressInputComposing = false;
    inputTouched = true;
    selectedResultIndex = -1;
    scheduleSearchSuggestions();
    renderList();
  });
  addressInput.addEventListener('input', (e) => {
    inputTouched = true;
    commandResultGeneration += 1;
    commandNotice = '';
    selectedResultIndex = -1;
    // Editing the command away from /group abandons a menu-initiated
    // "New Group…" — a stale target must never hijack a later hand-typed
    // /group meant for the active tab.
    if (pendingGroupTabId != null && !addressInput.value.startsWith('/group')) {
      pendingGroupTabId = null;
    }
    // Same idea for a scratch guard's "save first": editing the address away
    // from a leftover /workspace hand-off (slash command path) clears only
    // awaitingSave so the confirm row remains.
    if (pendingScratchGuard?.awaitingSave && !addressInput.value.startsWith('/workspace')) {
      clearScratchGuardAwaitingSave();
    }
    if (!addressInput.value.trim()) {
      // Do not clear a paste/drop taint here. Delete followed by Undo restores
      // the original private text with historyUndo, so provider autocomplete
      // must stay off until this overlay edit session ends.
      resetSearchSuggestions();
    } else if (
      activeTab()?.private
      || e.inputType === 'insertFromPaste'
      || e.inputType === 'insertFromDrop'
    ) {
      suppressProviderSuggestions = true;
      resetSearchSuggestions();
    } else if (!e.isComposing && !addressInputComposing) {
      scheduleSearchSuggestions();
    }
    renderList();
  });
  addressInput.addEventListener('keydown', (e) => {
    if (e.isComposing) return;
    const unmodifiedArrow = !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey;
    if (
      unmodifiedArrow
      && (e.key === 'ArrowDown' || e.key === 'ArrowUp')
      && visibleResults.length
    ) {
      e.preventDefault();
      if (selectedResultIndex < 0) {
        selectedResultIndex = e.key === 'ArrowDown'
          // Search text already highlights its bare-Enter target, so Down moves
          // past it. Address-shaped input has no such target and starts at row 0.
          ? (looksLikeAddress(addressInput.value) ? 0 : Math.min(1, visibleResults.length - 1))
          : visibleResults.length - 1;
      } else {
        const delta = e.key === 'ArrowDown' ? 1 : -1;
        selectedResultIndex = (selectedResultIndex + delta + visibleResults.length) % visibleResults.length;
      }
      renderList();
      return;
    }
    if (e.key !== 'Enter' || e.isComposing) return;
    if (visibleCommands.length) {
      runCommand(visibleCommands[0]);
    } else if (selectedResultIndex >= 0 && visibleResults[selectedResultIndex]) {
      // Arrow navigation is an explicit choice, so it may select a completion,
      // weak local match, or local result while address-shaped text is typed.
      pickResult(visibleResults[selectedResultIndex]);
    } else if (
      visibleResults.length
      && !looksLikeAddress(addressInput.value)
      && (visibleResults[0].kind === 'search' || visibleResults[0].score >= STRONG_MATCH_SCORE)
    ) {
      // A strong switcher match claims Enter — UNLESS what was typed is itself
      // an address (getbowser.com), in which case navigation wins over a tab
      // that merely mentions it. With no strong local match, the exact-query
      // search row leads and preserves normal typed-search behavior.
      pickResult(visibleResults[0]);
    } else if (inputTouched && addressInput.value.startsWith('/')) {
      // "no matching command" — do nothing rather than search for "/typo"
    } else if (state.activeTabId) {
      const value = addressInput.value.trim();
      if (value) window.browserAPI.navigate(state.activeTabId, value);
      window.browserAPI.closeOverlay();
    }
  });

  // --- Find in page ---

  function runFind(options) {
    const query = findInput.value;
    if (!state.activeTabId || !query) {
      findCount.textContent = '';
      return;
    }
    window.browserAPI.findInPage(state.activeTabId, query, options);
    findLastQuery = query;
  }

  // Electron's findNext means "start a NEW find session", not "move to the
  // next result". A fresh input value must therefore use true; Enter and the
  // arrow controls continue that session with false.
  // Search live as the user types; Enter/Shift+Enter step through matches.
  findInput.addEventListener('input', () => {
    if (!findInput.value) {
      findCount.textContent = '';
      findLastQuery = null;
      if (state.activeTabId) window.browserAPI.stopFindInPage(state.activeTabId);
      return;
    }
    runFind({ forward: true, findNext: true });
  });
  findInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      runFind({ forward: !e.shiftKey, findNext: findInput.value !== findLastQuery });
    }
  });
  findPrevBtn.addEventListener('click', () => runFind({ forward: false, findNext: false }));
  findNextBtn.addEventListener('click', () => runFind({ forward: true, findNext: false }));
  findCloseBtn.addEventListener('click', () => window.browserAPI.closeOverlay());

  window.browserAPI.onFindResult(({ activeMatchOrdinal, matches }) => {
    findCount.textContent = matches > 0 && findInput.value ? `${activeMatchOrdinal}/${matches}` : '';
  });

  // --- State sync ---

  async function refreshSwitcherData() {
    const [favoritesList, historyList, remoteList, workspacesPayload] = await Promise.all([
      window.browserAPI.listFavorites(),
      window.browserAPI.listHistory({ limit: 300 }),
      window.browserAPI.listRemoteTabs(),
      window.browserAPI.listWorkspaces(),
    ]);
    favorites = favoritesList;
    historyEntries = historyList;
    remoteDevices = remoteList;
    applyWorkspacesPayload(workspacesPayload);
    // Data lands after the panel already rendered — refresh it.
    if (mode === 'panel' || mode === 'palette') renderList();
  }

  window.browserAPI.onTabsUpdated((payload) => {
    const activeTabChanged = payload.activeTabId !== state.activeTabId;
    state = payload;
    if (mode === 'panel' || mode === 'palette') {
      if (!inputTouched) addressInput.value = addressDisplayValue(activeTab());
      if (activeTabChanged) {
        selectedResultIndex = -1;
        closeWorkspaceSwitcher();
        scheduleSearchSuggestions();
      }
      renderPanel();
    }
    if (mode === 'glance') renderGlancePicker();
    if (mode === 'shield') renderShieldPop();
    if (mode === 'capture') renderCapturePop();
  });
  // Cached-first: the panel renders the cache instantly, and this repaints
  // when the panel-open refresh's pull lands (tab sync).
  window.browserAPI.onRemoteTabsUpdated((devices) => {
    remoteDevices = devices;
    if (mode === 'panel' || mode === 'palette') renderList();
  });
  // Freshness for the workspaces section: a switch/rename/delete anywhere
  // (another window, or this one) must not leave a pull-once list showing a
  // stale "active" row or a name that no longer matches.
  window.browserAPI.onWorkspacesUpdated((payload) => {
    applyWorkspacesPayload(payload);
    if (mode === 'panel' || mode === 'palette') renderList();
  });
  window.browserAPI.getAllTabs().then((payload) => {
    state = payload;
    if (mode === 'glance') renderGlancePicker();
  });

  // Only the address input (src/main/address-menu.js) and real tab rows
  // (src/main/tab-context-menu.js) get context menus. Cancelling the DOM event
  // here stops Chromium from ever dispatching the browser-side context-menu
  // event for everything else — find bar, panel chrome, and rows without a
  // data-tab-id (remote/synced, folded-group stand-ins, group headers), which
  // stay inert by design.
  document.addEventListener('contextmenu', (e) => {
    // Record the row the user actually clicked BEFORE the hold release below
    // can flush a deferred re-render. Main reads (and clears) this id instead
    // of hit-testing the click coordinates — a flushed tabs:updated can shift
    // rows under the stale point and elementFromPoint would target a
    // neighbouring tab. e.target is snapshotted at dispatch, so it names the
    // visually clicked row regardless of any re-render, and it also works for
    // keyboard-invoked menus (menu key, VoiceOver), which have no useful
    // coordinates at all. The overlay is trusted chrome — browserAPI can
    // already act on any tab id, so a renderer-recorded id adds no privilege.
    const tabRowEl = e.target.closest('.island-row[data-tab-id]');
    // Workspace rows get their own separate menu (main's
    // workspace-context-menu.js — deliberately not tab-context-menu.js, see
    // that file's header) but share this same recording scheme: at most one
    // of the two ids is ever set per right-click, since a row is either a
    // tab row or a workspace row, never both.
    const workspaceRowEl = tabRowEl ? null : e.target.closest('.workspace-row[data-workspace-id]');
    window.__blancCtxRowTabId = tabRowEl?.dataset.tabId ?? null;
    window.__blancCtxWorkspaceId = workspaceRowEl?.dataset.workspaceId ?? null;
    // A context-menu press never completes as a click, and a native menu
    // swallows its pointerup — macOS menus even keep key-window status, so
    // the blur fallback never fires either. Without this release, the
    // pointerdown that opened the menu leaves pointerHeld stuck and every
    // tabs:updated re-render (e.g. the menu's own Remove-from-Group) queues
    // invisibly until the panel is reopened.
    releasePointerHold();
    if (
      !e.target.closest('#addressInput')
      && window.__blancCtxRowTabId == null
      && window.__blancCtxWorkspaceId == null
    ) {
      e.preventDefault();
    }
  });
})();
