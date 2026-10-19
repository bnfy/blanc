// Renderer for the overlay WebContentsView — the island's expanded states,
// floating over web content: the command bar ('panel', anchored where the
// pill sits), the summoned palette ('palette', centered over a scrim), and
// the find-in-page capsule ('find', tight bounds set by main).
(() => {
  const { platform } = window.browserAPI;
  const isMac = platform === 'darwin';
  // Lowercase key words in the mono voice; Windows/Linux names come from the
  // catalog (German keyboards print Strg).
  const keyWord = (key) => key.toLocaleLowerCase(blancI18n.formatLocale());
  const modKey = isMac ? '⌘' : `${keyWord(blancI18n.t('key.ctrl'))}+`;
  const modShiftKey = isMac ? '⌘⇧' : `${keyWord(blancI18n.t('key.ctrl'))}+${keyWord(blancI18n.t('key.shift'))}+`;

  const backdrop = document.getElementById('backdrop');
  const panelAnchor = document.getElementById('panelAnchor');
  const islandPanel = document.getElementById('islandPanel');
  const addressInput = document.getElementById('addressInput');
  const panelSiteInfo = document.getElementById('panelSiteInfo');
  const islandList = document.getElementById('islandList');
  const islandHint = document.getElementById('islandHint');
  const backBtn = document.getElementById('backBtn');
  const fwdBtn = document.getElementById('fwdBtn');
  const reloadBtn = document.getElementById('reloadBtn');
  const heartBtn = document.getElementById('heartBtn');
  const dismissBtn = document.getElementById('dismissBtn');
  const findBar = document.getElementById('findBar');
  const shieldPop = document.getElementById('shieldPop');
  const shieldPopPointer = document.getElementById('shieldPopPointer');
  let shieldConnected = false;
  const shieldPopHost = document.getElementById('shieldPopHost');
  const shieldPopOnOff = document.getElementById('shieldPopOnOff');
  const shieldPopToggle = document.getElementById('shieldPopToggle');
  const shieldPopConnection = document.getElementById('shieldPopConnection');
  const shieldPopCount = document.getElementById('shieldPopCount');
  const shieldPopNote = document.getElementById('shieldPopNote');
  const shieldPopDark = document.getElementById('shieldPopDark');
  const shieldPopDarkToggle = document.getElementById('shieldPopDarkToggle');
  const shieldPopSettings = document.getElementById('shieldPopSettings');
  const shieldPopLabel = document.getElementById('shieldPopLabel');
  const shieldPopProvider = document.getElementById('shieldPopProvider');
  const shieldPopProviderStatus = document.getElementById('shieldPopProviderStatus');
  const shieldPopProviderScope = document.getElementById('shieldPopProviderScope');
  const shieldPopAvailability = document.getElementById('shieldPopAvailability');
  const shieldPopUblock = document.getElementById('shieldPopUblock');
  const shieldPopTitle = document.getElementById('shieldPopTitle');
  const shieldPopSummary = document.getElementById('shieldPopSummary');
  const shieldPopChooser = document.getElementById('shieldPopChooser');
  const shieldPopBack = document.getElementById('shieldPopBack');
  const shieldPopChangeProvider = document.getElementById('shieldPopChangeProvider');
  const shieldPopApply = document.getElementById('shieldPopApply');
  const shieldPopChooserError = document.getElementById('shieldPopChooserError');
  let shieldChoosing = false;
  let shieldDraft = null;
  let shieldSaving = false;
  let shieldSaveGeneration = 0;
  const capturePop = document.getElementById('capturePop');
  const capturePopHead = document.getElementById('capturePopHead');
  const capturePopRows = document.getElementById('capturePopRows');
  const displayShareBackdrop = document.getElementById('displayShareBackdrop');
  const displaySharePicker = document.getElementById('displaySharePicker');
  const displayShareOrigin = document.getElementById('displayShareOrigin');
  const displayShareStatus = document.getElementById('displayShareStatus');
  const displayShareSources = document.getElementById('displayShareSources');
  const displayShareAudioLabel = document.getElementById('displayShareAudioLabel');
  const displayShareAudio = document.getElementById('displayShareAudio');
  const displayShareCancel = document.getElementById('displayShareCancel');
  const displayShareAllow = document.getElementById('displayShareAllow');
  let displayShareModel = null;
  let displayShareSelection = null;
  const CONNECTION_LABEL = {
    https: blancI18n.t('connection.https'),
    http: blancI18n.t('connection.http'),
    local: blancI18n.t('connection.local'),
  };
  const findInput = document.getElementById('findInput');
  const findCount = document.getElementById('findCount');
  const findPrevBtn = document.getElementById('findPrevBtn');
  const findNextBtn = document.getElementById('findNextBtn');
  const findCloseBtn = document.getElementById('findCloseBtn');
  const footerNewTab = document.getElementById('footerNewTab');
  const footerNewPrivate = document.getElementById('footerNewPrivate');
  const footerDevices = document.getElementById('footerDevices');
  const footerDevicesCount = document.getElementById('footerDevicesCount');
  const islandDrawer = document.getElementById('islandDrawer');
  const footerWorkspace = document.getElementById('footerWorkspace');
  const workspaceSwitcher = document.getElementById('workspaceSwitcher');
  const workspaceSwitcherList = document.getElementById('workspaceSwitcherList');
  const wsSwitcherSep = document.getElementById('wsSwitcherSep');
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
  /** @type {null | 'panel' | 'palette' | 'glance' | 'find' | 'shield' | 'capture' | 'spaces' | 'group-menu'} */
  let mode = null;
  let glancePickerPurpose = null;
  /** The tab the find capsule searches (overlay:show purpose). */
  let findTabId = null;
  // Advances on every fresh picker open and on hide, so a choice awaited
  // across a dismissal never paints its outcome onto a later picker.
  let glancePickerSession = 0;
  let glancePickerSelectedId = null;
  let glancePickerError = '';
  let glancePickerBusy = false;
  /** The tab a context-menu "New Group…" is naming via the /group command
   * (arrives in overlay:show's purpose payload; cleared once used, dismissed,
   * or the command is edited away from /group). */
  let pendingGroupTabId = null;
  // F46: the tab a menu-initiated "Rename Tab…" targets, like pendingGroupTabId.
  let pendingRenameTabId = null;
  // F46: the exact text a rename prompt was opened with. Enter on it unedited
  // changes nothing, even if the page has retitled itself since.
  let renamePrefill = null;
  // A name prompt (spec 2026-10-16-island-lower-section §9.3): the address
  // field edits a name instead of navigating. { kind: 'group', id, prefill,
  // notice } — Rename Group… today, Rename Device… with Part 4.
  let namePrompt = null;
  /** A click only reaches a row's handler when mousedown and mouseup land on
   * the same element. tabs:updated broadcasts arrive in bursts while any page
   * loads, and a replaceChildren between the two destroys the pressed row —
   * the browser then retargets the click to <body> and the row's handler never
   * runs, silently dropping the interaction. Hold list re-renders while a
   * pointer is down and flush one frame after release, so the click has
   * already been dispatched against the row the user actually pressed. */
  let pointerHeld = false;
  let renderQueued = false;
  let pendingWorkspacesPayload = null;

  function releasePointerHold() {
    pointerHeld = false;
    if (pendingWorkspacesPayload) {
      const payload = pendingWorkspacesPayload;
      pendingWorkspacesPayload = null;
      commitWorkspacesPayload(payload);
    }
    // An active drag's own end flushes the queued render.
    if (!renderQueued || islandDrag.isActive()) return;
    renderQueued = false;
    renderList();
  }
  // The address input's value is only ours to overwrite while untouched;
  // once the user types, incoming tab updates must not clobber it.
  let inputTouched = false;
  let siteInfoOpen = false;
  let findLastQuery = null;
  // Quick Switcher corpora, refreshed each time the panel opens.
  let favorites = [];
  let historyEntries = [];
  // F52: the profile's archived tabs (projected rows; never private).
  let archivedEntries = [];
  // Other devices' tab snapshots (tab sync). Renderer-local fold state —
  // devices start folded so the panel stays quiet (spec §2).
  let remoteDevices = [];
  const unfoldedDevices = new Set();
  // Recently closed starts folded — one line like a synced device; unfold to
  // see the reopen rows (Claude island declutter iteration).
  let closedSectionOpen = false;
  // The Other devices drawer; closed on every fresh open of the panel.
  let devicesDrawerOpen = false;
  // Bangs (`!yt lofi`): the settings main projects (switch, the person's own
  // bangs, recents) and which picker sections are unfolded, for this window.
  let bangsState = { enabled: true, custom: [], recent: [] };
  const bangSectionsOpen = { recent: true, popular: true, all: true };
  // Site icons for bang rows, by lowercased host: what main answered or
  // pushed (icons from the person's visits, or from Blanc's icon server).
  // Main decides what may be fetched; this only draws.
  const bangIconCache = new Map();
  // Rows must stay on screen this long before their icons are asked for
  // (BANG icons policy VISIBLE_DELAY_MS in src/main/bang-icons-policy.js).
  const BANG_ICON_VISIBLE_MS = 300;
  const bangIconRequester = createBangIconRequester({
    delayMs: BANG_ICON_VISIBLE_MS,
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (timer) => clearTimeout(timer),
    send: (hosts) => {
      window.browserAPI.bangIcons(hosts)
        .then((answers) => { for (const answer of answers || []) applyBangIconChange(answer); })
        .catch(() => {});
    },
  });
  // Bang icon cells on screen, by host: several codes can share one site,
  // and its wait ends only when none of its rows is on screen.
  const bangIconVisibleCells = new Map();
  // Whether the active tab was private when the rows last asked: main
  // decides per ask, so a switch lets them ask again.
  let bangIconsPrivate = false;
  // The document's viewport, not the list: a row scrolled out of the panel is
  // clipped by its scrolling ancestor and so counts as off screen.
  const bangIconObserver = new IntersectionObserver((entries) => bangIconVisibility(entries));
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
  // The search engine's name, once a suggestions response supplies it; null
  // means the row shows the catalog's generic "search" tag.
  let searchProviderLabel = null;
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
  // Workspaces (Blanc Spaces). Populated from listWorkspaces() when the
  // panel opens (refreshSwitcherData) and kept fresh via onWorkspacesUpdated —
  // a pull-once list would keep showing a stale "active" row after a switch
  // that happened elsewhere (another window, or this window's own command).
  let wsWorkspaces = [];
  let workspaceSwitcherOpen = false;
  let pendingPostImportWorkspacePrompt = false;
  // The theme space colours are drawn for: the private chrome is its own surface.
  function spaceTheme() {
    if (document.documentElement.dataset.theme === 'private') return 'private';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  const workspaceUI = WorkspaceUI.create({
    document, window, api: window.browserAPI,
    popup: workspaceSwitcher, list: workspaceSwitcherList,
    commands: document.getElementById('workspaceSwitcherCommands'),
    trigger: footerWorkspace,
    feedback: document.getElementById('workspaceFeedback'),
    theme: spaceTheme,
    placement: () => (mode === 'spaces' ? 'view' : 'anchored'),
    onOpenChange(open) {
      workspaceSwitcherOpen = open; window.browserAPI.setWorkspaceSwitcherOpen(open);
      // Opened from the Island's space mark the menu is the whole overlay, so
      // closing it closes the overlay and focus returns to the mark.
      if (!open && mode === 'spaces') window.browserAPI.closeOverlay('cancel');
    },
  });

  // --- Drag to reorder (tab-drag.js; spec 2026-10-07) ---
  const dragApi = window.blancTabDrag;
  const islandDragLive = document.getElementById('islandDragLive');
  function announceIsland(message) {
    islandDragLive.textContent = '';
    requestAnimationFrame(() => { islandDragLive.textContent = message; });
  }
  /** The resting list (pinned, groups, loose): the only list mode that can be dragged. */
  function restingList() {
    if (mode !== 'panel' && mode !== 'palette') return false;
    if (siteInfoOpen || commandNotice) return false;
    const value = addressInput.value;
    return !(inputTouched && (value.startsWith('/') || value.trim()));
  }
  async function islandMove(intent) {
    const message = dragApi.describeMove(state, intent);
    let ok = false;
    try {
      if (intent.kind === 'group' && intent.id === dragApi.constants.CLOSED_SECTION_ID) {
        ok = await window.browserAPI.moveClosedSection(intent.beforeGroupId);
      } else {
        ok = intent.kind === 'group'
          ? await window.browserAPI.reorderGroup(intent.id, intent.beforeGroupId)
          : await window.browserAPI.moveTab(intent.id, { groupId: intent.groupId, beforeId: intent.beforeId });
      }
    } catch (error) {
      console.error('Island: move failed', error);
    }
    if (ok === true) announceIsland(message);
    return ok === true;
  }
  const islandDrag = dragApi.attach({
    list: islandList,
    document,
    window,
    enabled: restingList,
    onDrop: islandMove,
    announce: announceIsland,
    onActiveChange(active) {
      window.browserAPI.setOverlayDragState(active);
      if (!active && renderQueued && !pointerHeld) {
        renderQueued = false;
        renderList();
      }
    },
  });
  islandList.addEventListener('keydown', (event) => {
    if (!event.altKey || !event.shiftKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
    if (!restingList()) return;
    const direction = event.key === 'ArrowUp' ? 'up' : 'down';
    const header = event.target.closest?.('[data-drag-header]');
    const row = event.target.closest?.('.island-row[data-tab-id]');
    const result = header
      ? dragApi.keyboardGroupMove(state, header.dataset.groupId, direction, { withClosed: true })
      : row ? dragApi.keyboardTabMove(state, row.dataset.tabId, direction, { withClosed: true }) : null;
    if (!result) return;
    event.preventDefault();
    event.stopPropagation();
    if (result.stop) {
      announceIsland(result.stop === 'top' ? blancI18n.t('rail.move.top') : blancI18n.t('rail.move.bottom'));
      return;
    }
    islandMove(result.intent);
  });

  const ICONS = {
    reload: '<svg viewBox="0 0 16 16"><path d="M12.42 10.35a5 5 0 1 1-4.42-7.35c1.4 0 2.74.56 3.74 1.53L13 5.78"/><path d="M13 3v2.78h-2.78"/></svg>',
    // Ring + square, not an ✕ — the same drawing as the pill's stop
    // (renderer.js PILL_ICONS.stop). Here too the ✕ belongs to `close`, which
    // every row in the list carries.
    stop: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="5"/><rect class="stop-mark" x="6.05" y="6.05" width="3.9" height="3.9" rx="0.8"/></svg>',
    close: '<svg viewBox="0 0 16 16"><path d="M4.75 4.75l6.5 6.5M11.25 4.75l-6.5 6.5"/></svg>',
    // The group header's ⋮ (tab group colors spec §6).
    more: '<svg viewBox="0 0 16 16"><circle cx="8" cy="3.75" r="1.1"/><circle cx="8" cy="8" r="1.1"/><circle cx="8" cy="12.25" r="1.1"/></svg>',
    pin: '<svg viewBox="0 0 16 16"><path d="M5 3h6l-1 5 2 2v1H4v-1l2-2z"/><path d="M8 11v3"/></svg>',
    mute: '<svg viewBox="0 0 16 16"><path d="M2.75 6.25h2.5L9 3.25v9.5l-3.75-3H2.75z" stroke-linejoin="round"/><path d="M11.25 6.5l3 3M14.25 6.5l-3 3"/></svg>',
    search: '<svg viewBox="0 0 16 16"><circle cx="7" cy="7" r="4.25"/><path d="m10.25 10.25 3 3"/></svg>',
    secure: '<svg viewBox="0 0 16 16"><rect x="3.25" y="7.25" width="9.5" height="6" rx="1.75"/><path d="M5.5 7.25V4.9a2.5 2.5 0 0 1 5 0v2.35"/></svg>',
    insecure: '<svg viewBox="0 0 16 16"><rect x="3.25" y="7.25" width="9.5" height="6" rx="1.75"/><path d="M5.5 7.25V4.9a2.6 2.6 0 0 1 5.1-.72"/></svg>',
    local: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="5.25"/><circle cx="8" cy="8" r="1.5"/></svg>',
    // Reopen: a leftward return arrow — drawn, not the Unicode ↶, which sits
    // baseline-low and renders unevenly across platforms.
    reopen: '<svg viewBox="0 0 16 16"><path d="M3.5 6.75h6a3 3 0 0 1 0 6h-3"/><path d="M6.25 4 3.5 6.75l2.75 2.75"/></svg>',
    // Glance: a window split down the middle with the far half filled, "this
    // tab goes in the other half". The earlier page-and-sliver glyph read as a
    // video camera. The filled half keeps it apart from the footer's sidebar
    // glyph (the tab-layout toggle), whose divider sits off-centre.
    glance: '<svg viewBox="0 0 16 16"><rect x="2" y="3" width="12" height="10" rx="1.75"/><path d="M8 3v10"/><rect class="glance-mark" x="9.6" y="4.6" width="2.8" height="6.8" rx="0.6"/></svg>',
  };
  reloadBtn.innerHTML = ICONS.reload;

  function activeTab() {
    return state.tabs.find((t) => t.id === state.activeTabId) || null;
  }

  const groupById = (id) => state.groups.find((g) => g.id === id) || null;

  /** Cluster order: groups and runs of ungrouped tabs, in tab order
   * (tab-sections.js, shared with main and the rail). Pins lead their named
   * group; only ungrouped pins use the standalone shelf. */
  function clusterTabs() {
    const byId = new Map(state.tabs.map((t) => [t.id, t]));
    const clusters = [];
    for (const section of TabSections.sectionsOf(state.tabs)) {
      const group = section.groupId ? groupById(section.groupId) : null;
      if (section.groupId && !group) continue;
      clusters.push({ group, tabs: section.tabIds.map((id) => byId.get(id)) });
    }
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
      el.classList.add('fallback');
      el.textContent = faviconFallbackLabel(tab);
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
      return [tab.title, tab.pageTitle, tabDomain(tab), groupName]
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
    if (tab.asleep) glancePickerLive.textContent = blancI18n.t('glance.picker.opening');
    const session = glancePickerSession;
    let selected = false;
    try {
      selected = await window.browserAPI.setGlanceTab(tab.id);
    } catch {
      selected = false;
    }
    // A picker dismissed and re-opened while this choice awaited is a fresh
    // picker: this outcome belongs to the one that is gone.
    if (mode !== 'glance' || session !== glancePickerSession) return;
    glancePickerBusy = false;
    if (selected) {
      glancePickerLive.textContent = tab.title
        ? blancI18n.t('glance.opened', { title: tab.title })
        : blancI18n.t('glance.openedUntitled');
      window.browserAPI.closeOverlay('selected');
      return;
    }
    glancePickerError = blancI18n.t('glance.openFailed');
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
      title.textContent = tab.title || (tab.isLoading ? blancI18n.t('tab.loading') : blancI18n.t('tab.new'));
      if (tab.title) title.dataset.i18nIgnore = ''; // a page title is data
      // The ⌘L panel's vocabulary: a quiet tab is dimmed (the word stays in
      // the accessible name only), a private tab carries the chip, and the
      // secondary line is the host and group.
      const metadata = [tabDomain(tab), groupById(tab.groupId)?.name].filter(Boolean);
      // Only a quiet tab has anything to wait for; an awake one attaches at once.
      const opening = glancePickerBusy && tab.id === glancePickerSelectedId && !!tab.asleep;
      const sub = document.createElement('span');
      sub.className = 'glance-picker-option-sub';
      sub.textContent = opening
        ? blancI18n.t('glance.picker.opening')
        : metadata.join(' · ') || blancI18n.t('glance.picker.openTab');
      // Host and group name are data; the state words are translated.
      if (!opening && metadata.length) sub.dataset.i18nIgnore = '';
      const identity = document.createElement('span');
      identity.className = 'glance-picker-option-identity';
      identity.append(title);
      if (tab.private) {
        const chip = document.createElement('span');
        chip.className = 'row-private';
        chip.textContent = blancI18n.t('rail.state.private');
        identity.append(chip);
      }
      copy.append(identity, sub);
      row.append(favicon, copy);
      row.classList.toggle('quiet', !!tab.asleep);
      if (opening) row.dataset.opening = 'true';
      row.title = [title.textContent, tabDomain(tab)].filter(Boolean).join(' — ');
      const details = [
        ...metadata,
        tab.private ? blancI18n.t('rail.state.private') : '',
        tab.asleep ? blancI18n.t('rail.state.quiet') : '',
      ].filter(Boolean).join(', ') || blancI18n.t('glance.picker.openTab');
      row.setAttribute('aria-label', blancI18n.t('glance.picker.optionLabel', { title: title.textContent, details }));
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
      ? blancI18n.t('glance.picker.noMatches')
      : blancI18n.t('glance.picker.noTabs');
    const message = glancePickerError || (!results.length ? emptyMessage : '');
    glancePickerState.hidden = !message;
    glancePickerState.textContent = message;
    glancePickerState.classList.toggle('error', !!glancePickerError);

    if (announce) {
      glancePickerLive.textContent = glancePickerError || (
        results.length
          ? blancI18n.t('glance.picker.available', { count: results.length })
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
    // Home and End stay the text field's own (the caret); the list's ends
    // are reached with the arrows. Moving the highlight announces nothing:
    // the active descendant speaks for itself, and only typing re-counts.
    if (event.key === 'ArrowDown') next = (current + 1) % results.length;
    else if (event.key === 'ArrowUp') next = (current - 1 + results.length) % results.length;
    else return;
    event.preventDefault();
    selectGlanceResult(results[next].id);
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
      reloadBtn.dataset.tooltip = wantStop ? blancI18n.t('pill.stop') : blancI18n.t('pill.reload');
      reloadBtn.setAttribute('aria-label', reloadBtn.dataset.tooltip);
    }
    heartBtn.disabled = !tab || !isFavoritable(tab.url);
    heartBtn.classList.toggle('favorited', !!tab?.bookmarked);
    heartBtn.dataset.tooltip = tab?.bookmarked ? blancI18n.t('pill.unfavorite') : blancI18n.t('panel.favoriteShortcut');
    heartBtn.setAttribute('aria-label', heartBtn.dataset.tooltip);
    const siteInfo = tab?.siteInfo;
    const visible = !!siteInfo && !tab?.isLoading && !['internal', 'neutral'].includes(siteInfo.state);
    panelSiteInfo.hidden = !visible;
    panelSiteInfo.className = `site-info-button ${siteInfo?.state ?? ''}`;
    panelSiteInfo.innerHTML = ['insecure', 'certificate-error', 'certificate-exception'].includes(siteInfo?.state)
      ? ICONS.insecure
      : siteInfo?.state === 'local' ? ICONS.local : ICONS.secure;
    panelSiteInfo.dataset.tooltip = siteInfo?.title ?? blancI18n.t('panel.siteInfo');
    panelSiteInfo.setAttribute('aria-label', siteInfo?.title ?? blancI18n.t('panel.siteInfo'));
    panelSiteInfo.setAttribute('aria-expanded', String(visible && siteInfoOpen));
    if (!visible) siteInfoOpen = false;

    const verticalTabsActive = state.tabLayout === 'vertical';
    footerTabLayout.dataset.tooltip = verticalTabsActive
      ? blancI18n.t('rail.islandLayout')
      : blancI18n.t('footer.tabLayoutOn');
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
    row.dataset.dragTab = '';
    row.dataset.pinned = String(!!tab.pinned);
    row.dataset.groupId = tab.groupId ?? '';
    row.dataset.dragTitle = tab.title || blancI18n.t('tab.untitled');
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

    // A renamed tab keeps its name while it loads (F46); only a page title,
    // which is about to change, gives way to "Loading…".
    const showLoading = tab.isLoading && tab.pageTitle == null;
    const label = showLoading ? blancI18n.t('tab.loading') : tab.title || blancI18n.t('tab.untitled');
    const title = document.createElement('span');
    title.className = 'row-title';
    title.textContent = label;
    // A renamed row's tooltip is the page's own title (F46).
    if (tab.pageTitle || tab.title) title.title = tab.pageTitle || tab.title;
    if (tab.title && !showLoading) title.dataset.i18nIgnore = ''; // a page title is data
    row.setAttribute('aria-label', label);
    if (tab.title && !showLoading) row.dataset.i18nIgnore = 'aria-label'; // the page title again

    const primary = document.createElement('button');
    primary.type = 'button';
    primary.className = 'row-primary';
    // tabDomain() is '' for a blank new tab; filter rather than emit ", ,".
    // The word a person hears is quiet; the field name stays internal.
    const parts = [
      label,
      tabDomain(tab),
      tab.asleep ? blancI18n.t('rail.state.quiet') : '',
      tab.private ? blancI18n.t('rail.state.private') : '',
    ].filter(Boolean);
    primary.setAttribute('aria-label', blancI18n.t('dot.switchTo', { title: parts.join(', ') }));
    if (tab.title) primary.dataset.i18nIgnore = 'aria-label'; // carries the page title
    primary.append(faviconWrap, title);
    primary.addEventListener('click', () => {
      window.browserAPI.switchTab(tab.id);
      window.browserAPI.closeOverlay();
    });
    row.append(primary);

    // Quiet is dim-only (the row's `quiet` class + the aria word above); no
    // per-row marker — see docs/superpowers/specs/2026-08-18-quiet-marker-
    // dim-only-design.md before reintroducing one.

    const pin = document.createElement('button');
    pin.className = 'row-pin' + (tab.pinned ? ' on' : '');
    pin.dataset.noDrag = '';
    pin.dataset.tooltip = tab.pinned ? blancI18n.t('row.unpin') : blancI18n.t('row.pin');
    pin.setAttribute('aria-label', pin.dataset.tooltip);
    pin.innerHTML = ICONS.pin;
    pin.addEventListener('click', (e) => {
      e.stopPropagation();
      window.browserAPI.toggleTabPinned(tab.id);
    });
    row.append(pin);

    if (tab.audible || tab.muted) {
      const mute = document.createElement('button');
      mute.className = 'row-mute' + (tab.muted ? ' on' : '');
      mute.dataset.noDrag = '';
      mute.dataset.tooltip = tab.muted ? blancI18n.t('row.unmute') : blancI18n.t('row.mute');
      mute.setAttribute('aria-label', mute.dataset.tooltip);
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
      glance.dataset.noDrag = '';
      glance.innerHTML = ICONS.glance;
      glance.dataset.tooltip = isGlance ? blancI18n.t('glance.close') : blancI18n.t('row.glanceOpen');
      glance.setAttribute('aria-label', blancI18n.t('row.actionLabel', { action: glance.dataset.tooltip, title: label }));
      if (tab.title) glance.dataset.i18nIgnore = 'aria-label'; // carries the page title
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

    // The private tag sits beside ✕ (always present) so it holds one column
    // across rows; ahead of the hover-only actions it would shift with them.
    if (tab.private) {
      const tag = document.createElement('span');
      tag.className = 'row-private';
      tag.textContent = blancI18n.t('rail.private.marker');
      tag.setAttribute('aria-hidden', 'true');
      row.append(tag);
    }

    const close = document.createElement('button');
    close.className = 'row-close';
    close.dataset.noDrag = '';
    close.dataset.tooltip = blancI18n.t('pill.closeTab');
    close.setAttribute('aria-label', close.dataset.tooltip);
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
  // Lowercase kind tags on Quick Switcher results (search rows show the
  // provider name instead).
  const RESULT_TAGS = {
    tab: blancI18n.t('result.tag.tab'),
    favorite: blancI18n.t('result.tag.favorite'),
    history: blancI18n.t('result.tag.history'),
    group: blancI18n.t('result.tag.group'),
    remote: blancI18n.t('result.tag.remote'),
    space: blancI18n.t('result.tag.space'),
  };

  /** Named-group band: present --surface tint behind header + member tabs.
   * Only named groups get this — pinned / loose / furniture stay flat. */
  function groupBand(group, nodes, firstTabId) {
    const band = document.createElement('div');
    band.className = 'island-group-band';
    band.dataset.dragSection = 'group';
    band.dataset.groupId = group.id;
    // The gap above a group names its first tab (tab-drag.js).
    band.dataset.firstTabId = firstTabId;
    TabSections.paintGroup(band, group, 'group-colored');
    band.dataset.collapsed = String(!!group.collapsed);
    band.append(...nodes);
    return band;
  }

  /** A drag section wrapper for the standalone pinned and loose rows, so the
   * shared drag controller can measure them like group bands. */
  function dragSection(kind, nodes) {
    const section = document.createElement('div');
    section.className = 'island-drag-section';
    section.dataset.dragSection = kind;
    section.append(...nodes);
    return section;
  }

  /** Empty pinned/loose drop target; takes no space until a drag reveals it. */
  function dragEmptyZone(kind) {
    const zone = document.createElement('div');
    zone.className = 'drag-empty-zone';
    zone.dataset.dragSection = kind;
    zone.setAttribute('aria-hidden', 'true');
    return zone;
  }

  /** "pinned" section header for pins without a named group. */
  function pinnedHeaderRow(count) {
    const row = document.createElement('div');
    row.className = 'island-ghead static';
    const name = document.createElement('span');
    name.className = 'ghead-name';
    name.textContent = blancI18n.t('rail.section.pinned');
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
    if (group.color) {
      // The color dot before the name; the band carries --group-color.
      const dot = document.createElement('span');
      dot.className = 'group-color-dot';
      dot.setAttribute('aria-hidden', 'true');
      row.querySelector('.ghead-name').before(dot);
    }
    row.querySelector('.ghead-name').textContent = group.name;
    row.querySelector('.ghead-name').dataset.i18nIgnore = ''; // a user-chosen group name
    row.querySelector('.ghead-n').textContent = String(count);
    row.title = group.collapsed ? blancI18n.t('group.unfold') : blancI18n.t('group.fold');
    row.dataset.dragHeader = '';
    row.dataset.groupId = group.id;
    row.dataset.dragTitle = group.name;
    // Focusable so ⌥⇧↑/↓ can move the group from the keyboard.
    row.tabIndex = 0;
    row.setAttribute('role', 'button');
    row.setAttribute('aria-expanded', String(!group.collapsed));
    row.addEventListener('click', () => window.browserAPI.toggleGroupCollapsed(group.id));
    row.addEventListener('keydown', (event) => {
      if (event.target !== row) return;
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        window.browserAPI.toggleGroupCollapsed(group.id);
      }
    });
    // The group menu: this ⋮ or a right-click on the header (spec §6).
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'ghead-more';
    more.dataset.noDrag = '';
    more.innerHTML = ICONS.more;
    more.setAttribute('aria-label', blancI18n.t('groupMenu.options'));
    more.setAttribute('aria-haspopup', 'dialog');
    more.addEventListener('click', (event) => {
      event.stopPropagation();
      toggleGroupMenu(group.id, row);
    });
    more.addEventListener('keydown', (event) => event.stopPropagation());
    row.querySelector('.ghead-kbd').before(more);
    if (groupMenu?.groupId === group.id) row.classList.add('menu-open');
    return row;
  }

  // --- Group menu (tab group colors spec §6) ---
  // One menu per group: its name, its color and its actions. In the panel it
  // floats in this document beside the header; from the side list main opens
  // the 'group-menu' mode, a transparent layer over the window, and this
  // document shows only the menu at the header main passed.
  const groupMenuEl = document.getElementById('groupMenu');
  /** @type {null | { groupId: string, host: 'panel' | 'mode', cancelled: boolean }} */
  let groupMenu = null;
  const GROUP_MENU_GAP = 4;
  const GROUP_MENU_MARGIN = 8;
  const GROUP_MENU_KEBAB = 30; // the ⋮ button and its inset

  function toggleGroupMenu(groupId, header) {
    if (groupMenu?.groupId === groupId && groupMenu.host === 'panel') { closeGroupMenu(); return; }
    const r = header.getBoundingClientRect();
    openGroupMenu(groupId, { right: r.right, top: r.top, bottom: r.bottom }, 'panel');
  }

  function openGroupMenu(groupId, anchor, host) {
    const group = groupById(groupId);
    if (!group) return;
    if (groupMenu) closeGroupMenu();
    groupMenu = { groupId, host, cancelled: false };
    // Escape reaches this document while the menu is open in the panel.
    if (host === 'panel') window.browserAPI.setWorkspaceSwitcherOpen(true);
    buildGroupMenu(group);
    groupMenuEl.hidden = false;
    placeGroupMenu(anchor, host);
    document.querySelector(`#islandList .island-ghead[data-group-id="${CSS.escape(groupId)}"]`)?.classList.add('menu-open');
    const input = groupMenuEl.querySelector('.group-menu-name');
    input.focus();
    input.select();
  }

  /** Below the header (above it when there is no room). In the panel its
   * right edge meets the header's; from the side list it starts at the ⋮
   * and opens toward the page, as Helium's does. */
  function placeGroupMenu(anchor, host) {
    const width = groupMenuEl.offsetWidth;
    const height = groupMenuEl.offsetHeight;
    const wanted = host === 'mode' ? anchor.right - GROUP_MENU_KEBAB : anchor.right - width;
    const left = Math.max(GROUP_MENU_MARGIN, Math.min(wanted, window.innerWidth - width - GROUP_MENU_MARGIN));
    const below = anchor.bottom + GROUP_MENU_GAP;
    const top = below + height <= window.innerHeight - GROUP_MENU_MARGIN
      ? below
      : Math.max(GROUP_MENU_MARGIN, anchor.top - GROUP_MENU_GAP - height);
    groupMenuEl.style.setProperty('--group-menu-left', `${Math.round(left)}px`);
    groupMenuEl.style.setProperty('--group-menu-top', `${Math.round(top)}px`);
  }

  function buildGroupMenu(group) {
    groupMenuEl.replaceChildren();
    groupMenuEl.setAttribute('aria-label', blancI18n.t('groupMenu.options'));
    const name = document.createElement('input');
    name.type = 'text';
    name.className = 'group-menu-name';
    name.value = group.name;
    name.spellcheck = false;
    name.setAttribute('aria-label', blancI18n.t('groupMenu.nameLabel'));
    name.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        commitGroupName({ close: true });
      }
    });
    const notice = document.createElement('div');
    notice.className = 'group-menu-notice';
    notice.setAttribute('role', 'status');
    notice.hidden = true;

    const colors = document.createElement('div');
    colors.className = 'group-menu-colors';
    colors.setAttribute('role', 'radiogroup');
    colors.setAttribute('aria-label', blancI18n.t('groupMenu.colorLabel'));
    const swatch = (hex, label) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = hex ? 'ws-swatch' : 'ws-swatch none';
      button.dataset.color = hex ?? '';
      button.setAttribute('role', 'radio');
      button.setAttribute('aria-label', label);
      button.setAttribute('aria-checked', String((group.color ?? null) === hex));
      if (hex) button.style.setProperty('--swatch', hex);
      button.addEventListener('click', async () => {
        for (const other of colors.children) other.setAttribute('aria-checked', String(other === button));
        await window.browserAPI.setGroupColor(group.id, hex);
      });
      return button;
    };
    colors.append(swatch(null, blancI18n.t('groupMenu.colorNone')));
    for (const preset of SpaceIdentity.PRESETS) colors.append(swatch(preset.hex, blancI18n.t(`spaces.color.${preset.id}`)));
    colors.addEventListener('keydown', (event) => {
      const items = [...colors.children];
      const at = items.indexOf(document.activeElement);
      const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
      if (!step || at === -1) return;
      event.preventDefault();
      items[(at + step + items.length) % items.length].focus();
    });

    const holdsEveryTab = state.tabs.length > 0 && state.tabs.every((tab) => tab.groupId === group.id);
    const action = (label, run, { disabled = false } = {}) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'ws-cmd group-menu-action';
      button.textContent = label;
      button.disabled = disabled;
      button.addEventListener('click', async () => {
        // A refused name keeps the menu open with its notice; nothing runs.
        if (!(await commitGroupName({ close: false }))) return;
        closeGroupMenu({ commit: false, closeOverlay: true });
        run();
      });
      return button;
    };
    const actions = document.createElement('div');
    actions.className = 'group-menu-actions';
    actions.append(
      action(blancI18n.t('groupMenu.newTab'), () => window.browserAPI.newTabInGroup(group.id)),
      action(blancI18n.t('groupMenu.moveToNewWindow'), () => window.browserAPI.moveGroupToNewWindow(group.id), { disabled: holdsEveryTab }),
      action(blancI18n.t('groupMenu.ungroup'), () => window.browserAPI.ungroupGroup(group.id)),
      action(blancI18n.t('groupMenu.close'), () => window.browserAPI.closeGroup(group.id)),
    );
    groupMenuEl.append(name, notice, colors, actions);
  }

  /** Save the typed name if it changed. A name another group has keeps the
   * menu open with the refusal; resolves false then. */
  async function commitGroupName({ close }) {
    if (!groupMenu) return true;
    const group = groupById(groupMenu.groupId);
    const input = groupMenuEl.querySelector('.group-menu-name');
    const value = input?.value ?? '';
    if (group && value.trim() && value !== group.name) {
      const result = await window.browserAPI.renameGroup(group.id, value);
      if (result && result.ok === false && result.error === 'duplicate') {
        const notice = groupMenuEl.querySelector('.group-menu-notice');
        if (notice && groupMenu) {
          notice.textContent = blancI18n.t('groupMenu.duplicate', { name: value.trim() });
          notice.hidden = false;
          input.focus();
        }
        return false;
      }
    }
    // Enter is a keyboard close: focus goes back to the header's ⋮.
    if (close) closeGroupMenu({ commit: false, closeOverlay: true, reason: 'cancel' });
    return true;
  }

  /** `commit` saves a changed name first; Escape passes false. */
  function closeGroupMenu({ commit = true, closeOverlay = false, reason = null } = {}) {
    if (!groupMenu) return;
    const { host, groupId } = groupMenu;
    if (commit) commitGroupName({ close: false });
    groupMenu = null;
    groupMenuEl.hidden = true;
    groupMenuEl.replaceChildren();
    document.querySelectorAll('#islandList .island-ghead.menu-open').forEach((el) => el.classList.remove('menu-open'));
    if (host === 'panel') {
      if (!workspaceSwitcherOpen) window.browserAPI.setWorkspaceSwitcherOpen(false);
      document.querySelector(`#islandList .island-ghead[data-group-id="${CSS.escape(groupId)}"] .ghead-more`)?.focus();
    } else if (closeOverlay && mode === 'group-menu') {
      window.browserAPI.closeOverlay(reason ?? undefined);
    }
  }

  document.addEventListener('mousedown', (event) => {
    if (!groupMenu || event.target.closest('#groupMenu')) return;
    if (groupMenu.host === 'panel' && event.target.closest('.ghead-more')) return; // its own toggle
    const fromMode = groupMenu.host === 'mode';
    closeGroupMenu({ commit: true });
    if (fromMode) window.browserAPI.closeOverlay('cancel');
  }, true);

  // --- Workspaces (Blanc Spaces) ---
  //
  // Identity, switching, and every name/confirm editor live in the island
  // footer popover. The tab list never hosts workspace chrome — only the
  // scratch-guard confirm (about this window) still appears there.

  function commitWorkspacesPayload(payload) {
    wsWorkspaces = Array.isArray(payload?.items) ? payload.items : [];
    workspaceUI.apply({ ...payload, items: wsWorkspaces });
  }
  function applyWorkspacesPayload(payload) {
    // A workspace status/autosave push can land between pointerdown and click.
    // Replacing the pressed row in that interval drops the click, so share the
    // tab list's pointer hold and apply only the newest queued projection.
    if (pointerHeld) {
      pendingWorkspacesPayload = payload;
      renderQueued = true;
      return false;
    }
    commitWorkspacesPayload(payload);
    return true;
  }
  function boundWorkspace() { return wsWorkspaces.find((w) => w.active) ?? null; }
  function clearWorkspacePopoverEditors() { workspaceUI.reset(); }
  function workspacePopoverEditing() { return workspaceUI.editing; }
  function closeWorkspaceSwitcher() { return workspaceUI.close(); }
  function layoutWorkspaceSwitcher() { workspaceUI.layout(); }
  // From ⌘L the menu hangs from the panel's bottom edge (spec D18); keep it
  // there as the panel reshapes under it (typing, results, a folded group).
  new ResizeObserver(() => { if (workspaceSwitcherOpen) layoutWorkspaceSwitcher(); }).observe(islandPanel);
  function paintWorkspaceSwitcher() { workspaceUI.render(); }
  function openWorkspaceSwitcher() { workspaceUI.open(); }
  function toggleWorkspaceSwitcher() { workspaceUI.toggle(); }
  function switchToWorkspace(workspace) { workspaceUI.switchTo(workspace); }

  // --- Remote devices (tab sync) ---

  const hostOfUrl = (url) => {
    try { return new URL(url).host.replace(/^www\./, ''); } catch { return url; }
  };

  // Narrow relative time in the interface formatting locale: "5m ago" in
  // English, "vor 5 m" in German.
  const relativeTime = new Intl.RelativeTimeFormat(blancI18n.formatLocale(), { style: 'narrow', numeric: 'always' });
  function timeAgo(ts) {
    const mins = Math.max(1, Math.round((Date.now() - ts) / 60000));
    if (mins < 60) return relativeTime.format(-mins, 'minute');
    const hours = Math.round(mins / 60);
    if (hours < 24) return relativeTime.format(-hours, 'hour');
    return relativeTime.format(-Math.round(hours / 24), 'day');
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
    row.querySelector('.ghead-name').dataset.i18nIgnore = ''; // a device name
    const ns = row.querySelectorAll('.ghead-n');
    ns[0].textContent = String(device.tabs.length);
    ns[1].textContent = timeAgo(device.updatedAt);
    ns[1].classList.add('ghead-ago');
    ns[1].dataset.i18nIgnore = ''; // Intl-formatted in the interface locale, not catalog text
    row.title = open ? blancI18n.t('device.fold') : blancI18n.t('device.unfold');
    row.dataset.deviceId = device.deviceId;
    row.tabIndex = 0;
    row.setAttribute('role', 'button');
    row.setAttribute('aria-expanded', String(open));
    const flip = () => {
      if (open) unfoldedDevices.delete(device.deviceId);
      else unfoldedDevices.add(device.deviceId);
      renderList();
    };
    row.addEventListener('click', flip);
    row.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      flip();
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

  /** A command's argument: whatever follows the command word as it was
   * typed. The list runs a command for any prefix of its name or alias
   * ("/gr" runs /group, "/work" runs /space), so stripping the full name would
   * fold the typed word into the argument — a group called "/gr work". */
  function commandArgument(input) {
    return (input ?? '').replace(/^\/\S*\s*/, '').trim();
  }

  function runWorkspaceCommand(input) {
    const name = commandArgument(input);
    if (!name) openWorkspaceSwitcher();
    else workspaceUI.command(name);
  }

  /** A shortened or bare /rename ("/ren", or the row clicked from "/") has
   * no name to apply: it asks for one, as Rename Tab… does, rather than
   * naming the tab after the command text or quietly resetting it. */
  function renameNeedsName(input) {
    return !commandArgument(input) && (input ?? '').trim() !== '/rename';
  }

  /** Leave the panel open with a command typed and the cursor after it,
   * ready for its argument. */
  function promptCommand(text) {
    inputTouched = true;
    addressInput.value = text;
    renderList();
    addressInput.focus();
    addressInput.setSelectionRange(text.length, text.length);
  }

  function promptRename() {
    const target = state.tabs.find((t) => t.id === (pendingRenameTabId ?? state.activeTabId));
    if (!target) return;
    const prefill = `/rename ${target.title || ''}`;
    promptCommand(prefill);
    renamePrefill = prefill;
    addressInput.setSelectionRange('/rename '.length, prefill.length);
  }

  const COMMANDS = [
    // Also listed on blanc://shortcuts/ — update SLASH_COMMANDS in
    // pages/shortcuts.js when adding or changing a command here.
    { cmd: '/favorites', hint: blancI18n.t('slash.favorites.hint'), run: () => window.browserAPI.openPage('bookmarks') },
    { cmd: '/bring-tabs', hint: blancI18n.t('slash.bringTabs.hint'), run: () => window.browserAPI.openPage('tab-import') },
    { cmd: '/save', hint: blancI18n.t('slash.save.hint'), run: (input) => {
      const folder = commandArgument(input);
      window.browserAPI.saveFavorite(folder || null);
    } },
    { cmd: '/history', hint: blancI18n.t('slash.history.hint'), run: () => window.browserAPI.openPage('history') },
    { cmd: '/downloads', hint: blancI18n.t('slash.downloads.hint'), run: () => window.browserAPI.openPage('downloads') },
    { cmd: '/settings', hint: blancI18n.t('slash.settings.hint'), run: () => window.browserAPI.openPage('settings') },
    { cmd: '/sync', hint: blancI18n.t('slash.sync.hint'), run: () => window.browserAPI.openPage('settings', 'sync') },
    { cmd: '/clear', hint: blancI18n.t('slash.clear.hint'), run: () => window.browserAPI.clearHistory() },
    { cmd: '/new', hint: blancI18n.t('slash.new.hint'), run: () => window.browserAPI.createTab(null, { focusAddress: false }) },
    { cmd: '/private', hint: blancI18n.t('slash.private.hint'), run: () => window.browserAPI.createTab(null, { private: true, focusAddress: false }) },
    { cmd: '/close', hint: blancI18n.t('slash.close.hint'), run: () => state.activeTabId && window.browserAPI.closeTab(state.activeTabId) },
    { cmd: '/reopen', hint: blancI18n.t('slash.reopen.hint'), run: () => window.browserAPI.reopenClosedTab() },
    { cmd: '/pin', hint: blancI18n.t('slash.pin.hint'), run: () => state.activeTabId && window.browserAPI.toggleTabPinned(state.activeTabId) },
    { cmd: '/mute', hint: blancI18n.t('slash.mute.hint'), run: () => state.activeTabId && window.browserAPI.toggleTabMuted(state.activeTabId) },
    { cmd: '/sleep', hint: blancI18n.t('slash.sleep.hint'), run: () => window.browserAPI.sleepBackgroundTabs(), keepOverlay: true, clearInput: true, resultNotice: (quieted) => Array.isArray(quieted) && quieted.length === 0 ? blancI18n.t('slash.sleep.none') : '' },
    { cmd: '/rename', hint: blancI18n.t('slash.rename.hint'), keepOverlay: renameNeedsName, run: (input) => {
      if (renameNeedsName(input)) { promptRename(); return; }
      const name = commandArgument(input);
      // "Rename Tab…" targets the right-clicked tab, even if it closed in the
      // meantime (main then does nothing) — never silently the active tab.
      // An empty name hands the tab back its page title.
      const target = pendingRenameTabId ?? state.activeTabId;
      if (target && input !== renamePrefill) window.browserAPI.renameTab(target, name);
      pendingRenameTabId = null;
      renamePrefill = null;
    } },
    { cmd: '/group', hint: blancI18n.t('slash.group.hint'), keepOverlay: (input) => !commandArgument(input), run: (input) => {
      const name = commandArgument(input);
      // No name yet ("/gr", or the row clicked from "/"): ask for one in
      // place instead of closing on nothing. A New Group… target stays bound.
      if (!name) { promptCommand('/group '); return; }
      // A context-menu "New Group…" targets the right-clicked tab, not the
      // active one (overlay:show's purpose payload sets the pending target).
      const target = pendingGroupTabId ?? state.activeTabId;
      if (name && target) window.browserAPI.groupTabByName(target, name);
      pendingGroupTabId = null;
    } },
    { cmd: '/ungroup', hint: blancI18n.t('slash.ungroup.hint'), run: () => state.activeTabId && window.browserAPI.setTabGroup(state.activeTabId, null) },
    { cmd: '/close-group', hint: blancI18n.t('slash.closeGroup.hint'), run: () => {
      const groupId = activeTab()?.groupId;
      if (groupId) window.browserAPI.closeGroup(groupId);
    } },
    { cmd: '/find', hint: blancI18n.t('slash.find.hint'), run: () => window.browserAPI.openFindBar(), keepOverlay: true },
    { cmd: '/block-ads', hint: blancI18n.t('slash.blockAds.hint'), run: () => window.browserAPI.toggleAdblock() },
    { cmd: '/allow-ads', hint: blancI18n.t('slash.allowAds.hint'), run: () => window.browserAPI.allowAdsOnActiveSite() },
    { cmd: '/dark-site', hint: blancI18n.t('slash.darkSite.hint'), run: () => window.browserAPI.toggleDarkSiteOnActiveSite() },
    { cmd: '/1password', hint: blancI18n.t('slash.1password.hint'),
      available: typeof window.browserAPI.fillLoginFromOnePassword === 'function',
      run: () => window.browserAPI.fillLoginFromOnePassword() },
    { cmd: '/theme', hint: blancI18n.t('slash.theme.hint'), run: (input) => {
      const requested = commandArgument(input);
      window.browserAPI.cycleTheme(requested || null);
    } },
    { cmd: '/patron', hint: blancI18n.t('slash.patron.hint'), run: () => window.browserAPI.openPage('settings', 'patron') },
    // /workspace was the command before the Blanc Spaces rename; it still works.
    { cmd: '/space', hint: blancI18n.t('slash.space.hint'), aliases: ['/workspace'], keepOverlay: true, clearInput: true, run: runWorkspaceCommand },
    { cmd: '/glance', hint: blancI18n.t('slash.glance.hint'), keepOverlay: true, run: (input) => window.browserAPI.openGlancePicker(commandArgument(input)) },
    { cmd: '/invite', hint: blancI18n.t('slash.invite.hint'), run: () => window.browserAPI.inviteFriend(), keepOverlay: true, clearInput: true, resultNotice: (result) => result === 'copied' ? blancI18n.t('slash.invite.copied') : '' },
  ];

  function runCommand(command) {
    // Commands like "/group work" read their argument from the typed input.
    const input = addressInput.value;
    const resultGeneration = ++commandResultGeneration;
    commandNotice = '';
    // Close first: commands that open something (a page, a fresh tab) rely
    // on main re-showing the overlay in a clean state where needed.
    const keepOverlay = typeof command.keepOverlay === 'function'
      ? command.keepOverlay(input)
      : command.keepOverlay;
    if (!keepOverlay) window.browserAPI.closeOverlay();
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
        islandDrag.cancel();
        commandNotice = command.resultNotice(value);
        renderList();
      }, () => {
        if (resultGeneration !== commandResultGeneration) return;
        islandDrag.cancel();
        commandNotice = blancI18n.t('slash.sleep.failed');
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

  /** The Recently closed band (spec 2026-10-16 §4): a named group's band
   * and header, placed among the groups where the user dragged it. It starts
   * folded on every open, takes no ⌘ number, and holds no tabs. */
  function closedBand(entries) {
    const band = document.createElement('div');
    band.className = 'island-group-band closed-band';
    band.dataset.dragSection = 'closed';
    band.dataset.groupId = dragApi.constants.CLOSED_SECTION_ID;
    band.dataset.collapsed = String(!closedSectionOpen);
    band.append(closedHeaderRow(entries.length));
    if (closedSectionOpen) band.append(...entries.map(closedRow));
    return band;
  }

  /** "› Recently closed 12": folds like a group header and drags like one.
   * Clear all stays reachable when unfolded. */
  function closedHeaderRow(count) {
    const row = document.createElement('div');
    row.className = 'island-ghead';
    row.title = closedSectionOpen ? blancI18n.t('closed.fold') : blancI18n.t('closed.unfold');
    row.dataset.dragHeader = '';
    row.dataset.groupId = dragApi.constants.CLOSED_SECTION_ID;
    row.dataset.dragTitle = blancI18n.t('closed.header');
    // The row also holds Clear all, and a button's content is presentational
    // to assistive tech, so the fold control is an inner button. Focusable so
    // it folds from the keyboard and ⌥⇧↑/↓ can move the band.
    const toggle = document.createElement('span');
    toggle.className = 'ghead-toggle';
    toggle.innerHTML = `${CARET}<span class="ghead-name"></span><span class="ghead-n"></span>`;
    toggle.querySelector('.ghead-name').textContent = blancI18n.t('closed.header');
    toggle.querySelector('.caret').classList.toggle('open', closedSectionOpen);
    toggle.querySelector('.ghead-n').textContent = String(count);
    toggle.tabIndex = 0;
    toggle.setAttribute('role', 'button');
    toggle.setAttribute('aria-expanded', String(closedSectionOpen));
    row.append(toggle);
    const flip = () => {
      closedSectionOpen = !closedSectionOpen;
      renderList();
    };
    row.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      flip();
    });
    toggle.addEventListener('keydown', (event) => {
      if (event.target !== toggle || (event.key !== 'Enter' && event.key !== ' ')) return;
      event.preventDefault();
      flip();
    });
    if (closedSectionOpen) {
      const clear = document.createElement('button');
      clear.type = 'button';
      clear.className = 'closed-clear';
      clear.dataset.noDrag = '';
      clear.textContent = blancI18n.t('closed.clear');
      clear.dataset.tooltip = blancI18n.t('closed.clearAll');
      clear.setAttribute('aria-label', clear.dataset.tooltip);
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
    row.className = 'island-row closed-row in-group';
    row.setAttribute('role', 'button');
    row.tabIndex = 0;
    row.title = blancI18n.t('closed.reopen');
    const glyph = document.createElement('span');
    glyph.className = 'closed-glyph';
    glyph.innerHTML = ICONS.reopen;
    const title = document.createElement('span');
    title.className = 'row-title';
    title.textContent = entry.tabCount > 1
      ? blancI18n.t('closed.groupTitle', { title: entry.title, count: entry.tabCount })
      : entry.title;
    title.dataset.i18nIgnore = ''; // a closed page or group title is data
    const forget = document.createElement('button');
    forget.type = 'button';
    forget.className = 'row-close closed-forget';
    forget.dataset.tooltip = blancI18n.t('closed.forget');
    forget.setAttribute('aria-label', blancI18n.t('row.actionLabel', { action: forget.dataset.tooltip, title: title.textContent }));
    forget.dataset.i18nIgnore = 'aria-label'; // carries the closed page title
    forget.innerHTML = ICONS.close;
    forget.addEventListener('click', (event) => {
      event.stopPropagation();
      window.browserAPI.forgetClosedEntry(entry.id);
    });
    row.append(glyph, title, forget);
    const reopen = () => {
      window.browserAPI.closeOverlay();
      window.browserAPI.reopenClosedEntry(entry.id);
    };
    row.addEventListener('click', reopen);
    row.addEventListener('keydown', (event) => {
      if (event.target !== row || (event.key !== 'Enter' && event.key !== ' ')) return;
      event.preventDefault();
      reopen();
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
   * and the typed external-link policy (external-protocols.js). When it's an
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
    // Spaces rank with groups: typing a space's name switches to it. The
    // current space is already here, so it never appears.
    for (const w of wsWorkspaces) {
      if (w.active) continue;
      const s = matchScore(query, w.name);
      if (s) results.push({ kind: 'space', title: w.name, sub: blancI18n.t('result.groupCount', { count: w.tabCount }), workspace: w, score: s + 0.3 });
    }
    // Group names rank above their member tabs — "wor" jumps to the whole
    // work cluster, not one tab in it.
    for (const g of state.groups) {
      const count = state.tabs.filter((t) => t.groupId === g.id).length;
      if (!count) continue;
      const s = matchScore(query, g.name);
      if (s) results.push({ kind: 'group', title: g.name, sub: blancI18n.t('result.groupCount', { count }), group: g, count, score: s + 0.3 });
    }
    for (const t of state.tabs) {
      const s = matchScore(query, matchableText([t.title, t.pageTitle].filter(Boolean).join(' '), t.url));
      // Quiet is not shown here: it lives only on the row-level dim (panel row
      // and rail). The switcher sub is just the tab's domain.
      const sub = tabDomain(t);
      if (s) results.push({ kind: 'tab', title: t.title || blancI18n.t('tab.untitled'), sub, tab: t, score: s + 0.2 });
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
    // Archived tabs rank below remote tabs (+0.05) and above history (+0);
    // the url-keyed dedup below keeps the archived row over a history row.
    // A private tab's switcher never shows the Archive (F52).
    const activePrivate = state.tabs.find((t) => t.id === state.activeTabId)?.private;
    if (!activePrivate) {
      for (const a of archivedEntries) {
        const s = matchScore(query, matchableText(a.title, a.url));
        if (s) results.push({ kind: 'archived', title: a.title || a.url, sub: `${stripUrl(a.url)} · ${blancI18n.t('result.archived')}`, url: a.url, tab: { url: a.url, favicon: a.favicon }, entryId: a.id, score: s + 0.02 });
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
        const key = r.kind === 'tab' ? `tab:${r.tab.id}` : r.kind === 'group' ? `group:${r.group.id}` : r.kind === 'space' ? `space:${r.workspace.id}` : r.url;
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
    if (result.kind === 'space') return `space:${result.workspace.id}`;
    if (result.kind === 'tab') return `tab:${result.tab.id}`;
    if (result.kind === 'search') return `search:${result.query.toLowerCase()}`;
    if (result.kind === 'bang') return `bang:${result.code}:${result.query}`;
    if (result.kind === 'bangPick') return `bangPick:${result.code}`;
    return `${result.kind}:${result.url}`;
  }

  function pickResult(result) {
    // The Spaces menu closes the overlay itself after a switch, and keeps it
    // open when switching must first ask about this window's tabs.
    if (result.kind === 'space') { workspaceUI.switchTo(result.workspace); return; }
    // A picker row fills the input and keeps the panel open; the hint row
    // sends the typed text, not the URL, so main resolves the bang itself.
    if (result.kind === 'bangPick') { fillBang(result.code); return; }
    if (result.kind === 'bang') {
      if (state.activeTabId) window.browserAPI.navigate(state.activeTabId, result.text);
      window.browserAPI.closeOverlay();
      return;
    }
    if (result.kind === 'group') window.browserAPI.focusGroup(result.group.id);
    else if (result.kind === 'tab') window.browserAPI.switchTab(result.tab.id);
    else if (result.kind === 'remote') window.browserAPI.createTab(result.url, { focusAddress: false });
    else if (result.kind === 'archived') window.browserAPI.archiveRestore(result.entryId);
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
    if (result.kind === 'space') {
      leading = WorkspaceUI.makeTile(document, result.workspace, spaceTheme(), 'ws-tile row-space-tile');
    } else if (result.kind === 'group') {
      leading = document.createElement('span');
      leading.className = 'row-group-mark';
      leading.innerHTML = CARET;
      TabSections.paintGroup(leading, result.group, 'group-colored-mark');
      leading.setAttribute('aria-hidden', 'true');
    } else if (result.kind === 'search') {
      leading = document.createElement('span');
      leading.className = 'row-search-icon';
      leading.innerHTML = ICONS.search;
    } else {
      leading = document.createElement('span');
      // History entries do not carry a full tab record. Preserve the shared
      // favicon path with a URL-shaped fallback so they receive a domain
      // initial instead of reverting to the anonymous gray slot.
      setFavicon(leading, result.tab ?? { url: result.url || '' });
    }

    const title = document.createElement('span');
    title.className = 'row-title';
    title.textContent = result.title || result.url || '';
    // Page, group and search titles are data; an untitled tab's label is not.
    if (!(result.kind === 'tab' && !result.tab.title)) title.dataset.i18nIgnore = '';

    const sub = document.createElement('span');
    sub.className = 'row-sub';
    sub.textContent = result.sub || '';
    // Domains, URLs and device names are data; a group's tab count is not.
    if (result.kind !== 'group' && result.kind !== 'space') sub.dataset.i18nIgnore = '';

    const tag = document.createElement('span');
    tag.className = 'row-tag';
    tag.textContent = result.kind === 'search'
      ? result.providerLabel ?? blancI18n.t('result.tag.search')
      : RESULT_TAGS[result.kind];
    // A search engine's name from the suggestions response is data; the
    // generic tag is interface text.
    if (result.kind === 'search' && result.providerLabel) tag.dataset.i18nIgnore = '';

    row.append(leading, title, sub, tag);
    if (isEnterTarget) row.append(enterGlyph());
    row.addEventListener('click', () => pickResult(result));
    return row;
  }

  // --- Bangs: the hint row and the `!` picker ---

  /** What the list shows for bang-shaped input, or null to fall through to
   * the normal list: the hint row for a known code (with the Quick Switcher
   * matches for the words under it), and, for a bare `!` or a bare code, the
   * picker's sections and rows. Folded sections keep their header and
   * count; only unfolded rows are drawn or selectable. */
  function bangResults(value) {
    if (!bangsState.enabled) return null;
    const text = value.trim();
    const parsed = Bangs.parseBang(text);
    if (!parsed && text !== '!') return null;
    const resolved = parsed ? Bangs.resolveBang(text, BangsCatalog, bangsState.custom) : null;
    const record = resolved ? Bangs.findBang(resolved.code, BangsCatalog, bangsState.custom) : null;
    const hint = resolved
      ? {
        kind: 'bang',
        code: resolved.code,
        name: resolved.name,
        domain: record?.domain ?? '',
        custom: record?.custom === true,
        query: resolved.query,
        url: resolved.url,
        text,
        title: resolved.query
          ? blancI18n.t('bang.search', { site: resolved.name, query: resolved.query })
          : blancI18n.t('bang.open', { site: resolved.name }),
      }
      : null;
    // The picker lists while only a code (or nothing) follows the `!`.
    const prefix = !parsed ? '' : parsed.query || parsed.position === 'end' ? null : parsed.code;
    if (!hint && prefix === null) return null;
    const sections = [];
    const picks = [];
    if (prefix !== null) {
      const rows = Bangs.matchBangs(prefix, BangsCatalog, bangsState.custom, bangsState.recent, BangsCatalog.popular);
      for (const section of ['recent', 'popular', 'all']) {
        const inSection = rows.filter((row) => row.section === section);
        if (!inSection.length) continue;
        const open = bangSectionsOpen[section] !== false;
        sections.push({ section, count: inSection.length, open });
        if (open) picks.push(...inSection.map((row) => ({ kind: 'bangPick', ...row })));
      }
    }
    const local = parsed && parsed.query ? switcherResults(parsed.query.toLowerCase()) : [];
    return { hint, sections, picks, local };
  }

  /** Where the first Arrow Down lands: past row 0 when that row is already
   * the bare-Enter target (search text, a strong local match, a bang hint),
   * on row 0 when nothing is (address-shaped text, a picker). */
  function arrowStartIndex() {
    const first = visibleResults[0];
    if (!first) return 0;
    if (first.kind === 'bangPick') return 0;
    if (first.kind !== 'bang' && looksLikeAddress(addressInput.value)) return 0;
    return Math.min(1, visibleResults.length - 1);
  }

  /** A picker row was chosen: the code goes into the input, the words come next. */
  function fillBang(code) {
    addressInput.value = `!${code} `;
    inputTouched = true;
    selectedResultIndex = -1;
    addressInput.focus();
    addressInput.setSelectionRange(addressInput.value.length, addressInput.value.length);
    scheduleSearchSuggestions();
    renderList();
  }

  function bangIconHost(domain) {
    return typeof domain === 'string' ? domain.toLowerCase() : '';
  }

  /** A bang row's leading site icon: the cached icon, else the site's letter
   * (the same slot as Quick Switcher favicons). Decorative; the row's text
   * names the site. */
  function bangIconCell(domain) {
    const host = bangIconHost(domain);
    const cell = document.createElement('span');
    cell.setAttribute('aria-hidden', 'true');
    if (host) cell.dataset.bangHost = host;
    setFavicon(cell, { url: `https://${host}/`, favicon: bangIconCache.get(host) || null });
    return cell;
  }

  /** An icon arrived (or, with icon null, was withdrawn): repaint that host's
   * rows in place, without redrawing the list. */
  function applyBangIconChange(change) {
    const host = bangIconHost(change?.host);
    if (!host) return;
    if (typeof change.icon === 'string' && change.icon) {
      bangIconCache.set(host, change.icon);
    } else {
      bangIconCache.delete(host);
      // Withdrawn (a history clear, or the server dropped it): a row on
      // screen asks again, so an icon from Favorites or an open tab returns.
      bangIconRequester.forget(host);
      if (bangIconVisibleCells.has(host)) bangIconRequester.visible(host);
    }
    for (const cell of islandList.querySelectorAll(`[data-bang-host="${CSS.escape(host)}"]`)) {
      setFavicon(cell, { url: `https://${host}/`, favicon: bangIconCache.get(host) || null });
    }
  }

  /** Asks main for the icons of bang rows that stay on screen `delayMs`:
   * rows typed or scrolled past sooner ask for nothing, and the rows that
   * stayed go out as one batch. Each host is sent once per overlay open
   * (main refreshes a stale copy on that ask). */
  function createBangIconRequester({ delayMs, setTimer, clearTimer, send }) {
    const waiting = new Map();
    const sent = new Set();
    let batch = [];
    let flushTimer = null;
    const flush = () => {
      flushTimer = null;
      const hosts = batch;
      batch = [];
      if (hosts.length) send(hosts);
    };
    return {
      visible(host) {
        if (!host || sent.has(host) || waiting.has(host)) return;
        waiting.set(host, setTimer(() => {
          waiting.delete(host);
          sent.add(host);
          batch.push(host);
          if (flushTimer === null) flushTimer = setTimer(flush, 0);
        }, delayMs));
      },
      hidden(host) {
        if (!waiting.has(host)) return;
        clearTimer(waiting.get(host));
        waiting.delete(host);
      },
      /** The host may be asked for again this open. */
      forget(host) {
        sent.delete(host);
      },
      /** After a redraw: rows whose host is still listed keep their wait. */
      retain(hosts) {
        for (const host of [...waiting.keys()]) if (!hosts.has(host)) this.hidden(host);
      },
      reset() {
        for (const timer of waiting.values()) clearTimer(timer);
        waiting.clear();
        sent.clear();
        batch = [];
      },
    };
  }

  function bangIconVisibility(entries) {
    for (const entry of entries) {
      const host = entry.target.dataset.bangHost;
      if (!host) continue;
      const cells = bangIconVisibleCells.get(host) ?? new Set();
      if (entry.isIntersecting) cells.add(entry.target);
      else cells.delete(entry.target);
      if (cells.size) {
        bangIconVisibleCells.set(host, cells);
        bangIconRequester.visible(host);
      } else {
        bangIconVisibleCells.delete(host);
        bangIconRequester.hidden(host);
      }
    }
  }

  /** The active tab switched between private and normal: rows already asked
   * for may ask again, and main answers by the new tab. */
  function noteBangIconPrivacy() {
    const isPrivate = activeTab()?.private === true;
    if (isPrivate === bangIconsPrivate) return;
    bangIconsPrivate = isPrivate;
    bangIconRequester.reset();
    observeBangIconRows();
  }

  /** After every list draw: watch the bang rows now listed. A host still
   * listed keeps its wait; one that left cancels it. */
  function observeBangIconRows() {
    bangIconObserver.disconnect();
    // The observer reports every watched cell afresh.
    bangIconVisibleCells.clear();
    const cells = [...islandList.querySelectorAll('[data-bang-host]')];
    bangIconRequester.retain(new Set(cells.map((cell) => cell.dataset.bangHost)));
    for (const cell of cells) bangIconObserver.observe(cell);
  }

  /** The hint row, drawn like a slash command: the code in accent ink, then
   * a plain sentence. */
  function bangRow(result, isActive, isEnterTarget) {
    const row = document.createElement('div');
    row.className = 'island-row' + (isActive ? ' active' : '');
    const code = document.createElement('span');
    code.className = 'row-cmd';
    code.textContent = `!${result.code}`;
    code.dataset.i18nIgnore = '';
    const hint = document.createElement('span');
    hint.className = 'row-hint';
    hint.textContent = result.title;
    row.append(bangIconCell(result.domain), code, hint);
    if (isEnterTarget) row.append(enterGlyph());
    row.addEventListener('click', () => pickResult(result));
    return row;
  }

  function bangPickRow(result, isActive) {
    const row = document.createElement('div');
    row.className = 'island-row' + (isActive ? ' active' : '');
    const code = document.createElement('span');
    code.className = 'row-cmd';
    code.textContent = `!${result.code}`;
    code.dataset.i18nIgnore = '';
    const name = document.createElement('span');
    name.className = 'row-hint';
    name.textContent = result.name;
    name.dataset.i18nIgnore = '';
    const sub = document.createElement('span');
    sub.className = 'row-sub';
    sub.textContent = result.custom ? blancI18n.t('bang.yours') : result.domain;
    if (!result.custom) sub.dataset.i18nIgnore = '';
    row.append(bangIconCell(result.domain), code, name, sub);
    row.addEventListener('click', () => pickResult(result));
    return row;
  }

  /** A picker section header: the group-header look, folded or not, bound
   * to this window's bangSectionsOpen rather than to a tab group. */
  function bangHeaderRow(section, count) {
    const row = document.createElement('div');
    row.className = 'island-ghead';
    row.innerHTML = `${CARET}<span class="ghead-name dim"></span><span class="ghead-n"></span>`;
    const label = section === 'recent'
      ? blancI18n.t('bang.section.recent')
      : section === 'popular' ? blancI18n.t('bang.section.popular') : blancI18n.t('bang.section.all');
    row.querySelector('.ghead-name').textContent = label;
    row.querySelector('.caret').classList.toggle('open', bangSectionsOpen[section] !== false);
    row.querySelector('.ghead-n').textContent = String(count);
    row.title = bangSectionsOpen[section] !== false ? blancI18n.t('bang.fold') : blancI18n.t('bang.unfold');
    row.addEventListener('click', () => {
      bangSectionsOpen[section] = bangSectionsOpen[section] === false;
      renderList();
    });
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
    // A synced device's header in the Other devices drawer.
    const device = el?.closest?.('[data-device-id]');
    if (device && islandDrawer.contains(device)) return { deviceId: device.dataset.deviceId };
    const header = el?.closest?.('[data-drag-header]');
    if (header && islandList.contains(header)) return { groupId: header.dataset.groupId };
    const row = el && el.closest && el.closest('.island-row[data-tab-id]');
    if (!row || !islandList.contains(row)) return null;
    const control = ['row-primary', 'row-pin', 'row-mute', 'row-glance', 'row-close']
      .find((c) => el.classList?.contains(c)) ?? 'row-primary';
    return { tabId: row.dataset.tabId, control };
  }
  function restoreRowFocus(anchor) {
    if (!anchor) return;
    if (anchor.groupId) {
      const header = islandList.querySelector(`[data-drag-header][data-group-id="${CSS.escape(anchor.groupId)}"]`);
      // The Recently closed header's focus target is its inner toggle.
      (header && header.tabIndex >= 0 ? header : header?.querySelector('[role="button"]'))?.focus();
      return;
    }
    const row = islandList.querySelector(
      `.island-row[data-tab-id="${CSS.escape(anchor.tabId)}"]`);
    (row?.querySelector(`.${anchor.control}`) ?? row?.querySelector('.row-primary'))?.focus();
  }

  // Applied at the tail of renderList / paintWorkspaceSwitcher, after the
  // target input is in the document AND focusable. It deliberately runs last
  // so an inline editor outranks restoreRowFocus. focus() on a detached or
  // visibility:hidden node is a silent no-op — leave the intent pending in
  // the hidden case so a later call (after visibility is restored) can land.


  function renderSiteInfo() {
    const info = activeTab()?.siteInfo;
    if (!info || ['internal', 'neutral'].includes(info.state)) {
      siteInfoOpen = false;
      return renderList();
    }
    const card = document.createElement('section');
    card.className = `site-info-card ${info.state}`;
    card.setAttribute('aria-label', blancI18n.t('panel.siteInfo'));
    const head = document.createElement('div');
    head.className = 'site-info-head';
    const stateDot = document.createElement('span');
    stateDot.className = 'site-info-state';
    stateDot.setAttribute('aria-hidden', 'true');
    const copy = document.createElement('div');
    const title = document.createElement('div');
    title.className = 'site-info-title';
    title.textContent = info.title;
    const origin = document.createElement('div');
    origin.className = 'site-info-origin';
    origin.textContent = info.origin || info.host || blancI18n.t('siteInfo.localPage');
    if (info.origin || info.host) origin.dataset.i18nIgnore = ''; // an origin is data
    copy.append(title, origin);
    head.append(stateDot, copy);
    const summary = document.createElement('p');
    summary.className = 'site-info-summary';
    summary.textContent = info.summary;
    card.append(head, summary);

    if (info.certificate) {
      const details = document.createElement('dl');
      details.className = 'site-info-details';
      const add = (label, value) => {
        if (!value) return;
        const row = document.createElement('div');
        const dt = document.createElement('dt');
        const dd = document.createElement('dd');
        dt.textContent = label;
        dd.textContent = value;
        dd.dataset.i18nIgnore = ''; // certificate values are data
        row.append(dt, dd);
        details.append(row);
      };
      add(blancI18n.t('siteInfo.cert.subject'), info.certificate.subject);
      add(blancI18n.t('siteInfo.cert.issuer'), info.certificate.issuer);
      add(blancI18n.t('siteInfo.cert.validFrom'), info.certificate.validFrom ? new Date(info.certificate.validFrom).toLocaleDateString(blancI18n.formatLocale()) : null);
      add(blancI18n.t('siteInfo.cert.validUntil'), info.certificate.validTo ? new Date(info.certificate.validTo).toLocaleDateString(blancI18n.formatLocale()) : null);
      add(blancI18n.t('siteInfo.cert.fingerprint'), info.certificate.fingerprint);
      if (details.children.length) card.append(details);
    }

    const footer = document.createElement('div');
    footer.className = 'site-info-actions';
    const blocked = Number(info.blockedCount) || 0;
    const protection = document.createElement('span');
    protection.className = 'site-info-protection';
    protection.textContent = blocked
      ? blancI18n.t('siteInfo.blocked', { count: blocked })
      : blancI18n.t('siteInfo.noneBlocked');
    const settingsButton = document.createElement('button');
    settingsButton.type = 'button';
    settingsButton.className = 'site-info-settings';
    settingsButton.textContent = blancI18n.t('siteInfo.privacySettings');
    settingsButton.addEventListener('click', () => {
      window.browserAPI.closeOverlay();
      window.browserAPI.openPage('settings');
    });
    const footerActions = [protection];
    if (info.state === 'certificate-exception') {
      const stopButton = document.createElement('button');
      stopButton.type = 'button';
      stopButton.className = 'site-info-settings site-info-stop-allowing';
      stopButton.textContent = blancI18n.t('siteInfo.stopAllowing');
      stopButton.addEventListener('click', () => {
        window.browserAPI.closeOverlay();
        window.browserAPI.siteInfoForgetCertificateException();
      });
      footerActions.push(stopButton);
    }
    footerActions.push(settingsButton);
    footer.append(...footerActions);
    card.append(footer);
    islandList.replaceChildren(card);
    islandHint.textContent = info.state === 'certificate-error'
      ? blancI18n.t('siteInfo.hint.certError')
      : info.state === 'certificate-exception'
        ? blancI18n.t('siteInfo.hint.certException')
        : blancI18n.t('siteInfo.hint.chromium');
  }

  // Tooltips for the Island's buttons: the panel's actions, its footer and the
  // tab rows' icons (pin, mute, Glance, close). They carry data-tooltip rather
  // than a native title: the panel is rebuilt on every tab broadcast (a page
  // loading, a title changing), which restarts the OS hover timer, so a native
  // tooltip here came late or never, and it couldn't match the Island's look. This one waits
  // a short beat on hover, shows at once on keyboard focus, and follows the
  // rebuilt button under a still pointer. It is visual only; each button's
  // aria-label or aria-description already says the same thing.
  const islandTip = document.createElement('div');
  islandTip.className = 'island-tip';
  islandTip.setAttribute('aria-hidden', 'true');
  document.body.append(islandTip);
  const ISLAND_TIP_DELAY_MS = 350;
  let islandTipTarget = null;
  let islandTipTimer = 0;
  let islandTipPointer = null;

  function placeIslandTip(el) {
    islandTip.textContent = el.dataset.tooltip;
    const box = el.getBoundingClientRect();
    const tip = islandTip.getBoundingClientRect();
    const gap = 6;
    let top = box.top - tip.height - gap;
    if (top < 4) top = box.bottom + gap;
    const left = Math.max(4, Math.min(window.innerWidth - tip.width - 4,
      box.left + box.width / 2 - tip.width / 2));
    islandTip.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
    islandTip.classList.add('show');
  }

  function hideIslandTip() {
    clearTimeout(islandTipTimer);
    islandTipTarget = null;
    islandTip.classList.remove('show');
  }

  function aimIslandTip(el, delay) {
    if (el === islandTipTarget) return;
    hideIslandTip();
    if (!el || !el.dataset.tooltip) return;
    islandTipTarget = el;
    if (delay) islandTipTimer = setTimeout(() => placeIslandTip(el), delay);
    else placeIslandTip(el);
  }

  // After a rebuild the hovered button is a new element: carry the tip over
  // to whatever button now sits under the pointer, or drop it.
  function refreshIslandTip() {
    if (!islandTipTarget || islandTipTarget.isConnected) return;
    const shown = islandTip.classList.contains('show');
    const under = islandTipPointer
      && document.elementFromPoint(islandTipPointer.x, islandTipPointer.y)?.closest('[data-tooltip]');
    hideIslandTip();
    if (under) aimIslandTip(under, shown ? 0 : ISLAND_TIP_DELAY_MS);
  }

  document.addEventListener('pointermove', (e) => {
    islandTipPointer = { x: e.clientX, y: e.clientY };
    aimIslandTip(e.target.closest?.('[data-tooltip]') || null, ISLAND_TIP_DELAY_MS);
  });
  document.documentElement.addEventListener('pointerleave', () => {
    islandTipPointer = null;
    hideIslandTip();
  });
  document.addEventListener('pointerdown', hideIslandTip, true);
  document.addEventListener('scroll', hideIslandTip, true);
  document.addEventListener('focusin', (e) => {
    const el = e.target.closest?.('[data-tooltip]');
    if (el && el.matches(':focus-visible')) aimIslandTip(el, 0);
  });
  document.addEventListener('focusout', (e) => {
    if (e.target === islandTipTarget) hideIslandTip();
  });

  function renderList() {
    if (pointerHeld || islandDrag.isActive()) {
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
    const bang = !siteInfoOpen && inputTouched && !value.startsWith('/') ? bangResults(value) : null;

    // A name prompt owns the panel: one line saying what Enter does (or why
    // a name was refused), and no switcher results for the name being typed.
    if (namePrompt) {
      const cue = namePrompt.kind === 'device' ? blancI18n.t('prompt.renameDevice') : blancI18n.t('prompt.renameGroup');
      const row = emptyRow(namePrompt.notice || cue);
      row.classList.add('command-notice', 'name-prompt');
      islandList.replaceChildren(row);
      renderDevicesDrawer(false);
      islandHint.textContent = '';
      observeBangIconRows();
      refreshIslandTip();
      return;
    }

    if (siteInfoOpen) {
      renderSiteInfo();
    } else if (bang) {
      visibleResults = [...(bang.hint ? [bang.hint] : []), ...bang.picks, ...bang.local];
      if (selectedKey) {
        selectedResultIndex = visibleResults.findIndex((result) => resultKey(result) === selectedKey);
      } else if (selectedResultIndex >= visibleResults.length) {
        selectedResultIndex = -1;
      }
      // The hint row is the bare-Enter target; a picker has none until an
      // arrow chooses a row.
      const activeIndex = selectedResultIndex >= 0 ? selectedResultIndex : bang.hint ? 0 : -1;
      const nodes = [];
      let i = 0;
      if (bang.hint) { nodes.push(bangRow(bang.hint, activeIndex === 0, activeIndex === 0)); i = 1; }
      for (const { section, count, open } of bang.sections) {
        nodes.push(bangHeaderRow(section, count));
        if (!open) continue;
        for (const pick of bang.picks.filter((p) => p.section === section)) {
          nodes.push(bangPickRow(pick, i === activeIndex));
          i += 1;
        }
      }
      for (const result of bang.local) {
        nodes.push(resultRow(result, i === activeIndex, i === activeIndex));
        i += 1;
      }
      islandList.replaceChildren(...(nodes.length ? nodes : [emptyRow(blancI18n.t('list.noMatches'))]));
      // The uncapped picker can outgrow the panel; an arrowed row must be
      // where the person can see it, as the Glance picker already does.
      islandList.querySelector('.island-row.active')?.scrollIntoView({ block: 'nearest' });
    } else if (inputTouched && value.startsWith('/')) {
      selectedResultIndex = -1;
      const slashWord = value.trim().split(/\s+/)[0];
      visibleCommands = COMMANDS.filter((c) =>
        c.available !== false && (slashWord === '/'
          || [c.cmd, ...(c.aliases ?? [])].some((name) => name.startsWith(slashWord))));
      islandList.replaceChildren(
        ...(visibleCommands.length
          ? visibleCommands.map((c, i) => commandRow(c, i === 0))
          : [emptyRow(blancI18n.t('list.noCommand'))])
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
          : [emptyRow(blancI18n.t('list.noMatches'))])
      );
    } else {
      selectedResultIndex = -1;
      const pinned = state.tabs.filter((t) => t.pinned && !t.groupId);
      const rows = [];
      // Scratch guard takes the same top-of-list slot commandNotice uses —
      // the two never coexist (see runWorkspaceMutation's onUnsavedScratch,
      // which intercepts 'unsaved-scratch' before it ever becomes a plain
      // commandNotice string).
      if (commandNotice) rows.push(commandNoticeRow(commandNotice));
      rows.push(pinned.length
        ? dragSection('pinned', [pinnedHeaderRow(pinned.length), ...pinned.map(tabRow)])
        : dragEmptyZone('pinned'));

      const clusters = clusterTabs();
      const shortcutOffset = pinned.length ? 1 : 0;
      // Recently closed sits at its slot (main's closedSlot): the number of
      // groups and ungrouped tabs above it, so it can split a run. Newest
      // first; every entry Blanc keeps.
      const closed = (state.closed ?? []).slice().reverse();
      const closedSlot = dragApi.closedSlotIndex(state);
      let closedPlaced = !closed.length;
      let itemIndex = 0;
      const placeClosed = () => {
        if (closedPlaced) return;
        rows.push(closedBand(closed));
        closedPlaced = true;
      };
      const due = () => !closedPlaced && itemIndex >= closedSlot;
      for (const [clusterIndex, { group, tabs: gtabs }] of clusters.entries()) {
        if (due()) placeClosed();
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
          rows.push(groupBand(group, bandNodes, gtabs[0].id));
          itemIndex += 1;
        } else {
          let chunk = [];
          for (const t of gtabs) {
            if (due()) {
              if (chunk.length) rows.push(dragSection('loose', chunk));
              chunk = [];
              placeClosed();
            }
            chunk.push(tabRow(t));
            itemIndex += 1;
          }
          if (chunk.length) rows.push(dragSection('loose', chunk));
        }
      }
      placeClosed();
      // Below a last group there is still a place for an ungrouped tab: the
      // empty zone a drag reveals.
      if (!clusters.length || clusters[clusters.length - 1].group) rows.push(dragEmptyZone('loose'));

      islandList.replaceChildren(...rows);
      // Only the resting tab list preserves row focus; the "/" command and
      // switcher branches drive focus from the input, not the rows.
      restoreRowFocus(rowAnchor);
    }

    // The drawer shows only beside the resting list: typing a query or a
    // command steps it aside until the field is clear again.
    renderDevicesDrawer(!siteInfoOpen && !(inputTouched && (value.startsWith('/') || value.trim())), rowAnchor);

    // The hint line keeps only the bang hint while a bang is typed and the
    // private-tab note (and the site-info notes, written by renderSiteInfo);
    // the address field and the Shortcuts sheet already teach "/" and ⌘1–9.
    if (!siteInfoOpen) {
      islandHint.textContent = bang
        ? blancI18n.t('hint.bang')
        : activeTab()?.private ? blancI18n.t('hint.private') : '';
    }
    observeBangIconRows();
    refreshIslandTip();
  }

  /** Other devices (spec 2026-10-16 §6): the footer toggle, hidden with no
   * other device to show, and the drawer between the list and the footer. */
  function renderDevicesDrawer(resting, anchor = null) {
    footerDevices.hidden = !remoteDevices.length;
    footerDevicesCount.textContent = String(remoteDevices.length);
    const show = resting && devicesDrawerOpen && remoteDevices.length > 0;
    footerDevices.setAttribute('aria-expanded', String(show));
    islandDrawer.hidden = !show;
    if (!show) {
      islandDrawer.replaceChildren();
      return;
    }
    const rows = [];
    for (const device of remoteDevices) {
      rows.push(remoteHeaderRow(device));
      if (unfoldedDevices.has(device.deviceId)) {
        rows.push(...clusterRemoteTabs(device).map((t) => remoteTabRow(t, device)));
      }
    }
    islandDrawer.replaceChildren(...rows);
    // Unfolding a device, or any re-render while the drawer is open, keeps
    // keyboard focus on the device header it was on.
    if (anchor?.deviceId) islandDrawer.querySelector(`[data-device-id="${CSS.escape(anchor.deviceId)}"]`)?.focus();
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
    searchProviderLabel = null;
  }

  /** Whether typed text may go to the suggestion service. Provider
   * autocomplete is intentionally off in private tabs: typed prefixes stay
   * local until the user explicitly submits a search. Bang-shaped text
   * (known or not, bangs on or off) never goes: the words beside a bang are
   * meant for one site. Main refuses the same text at its boundary. A name
   * prompt (Rename Group…) is not a search at all. */
  function suggestionsAllowed(query) {
    return !namePrompt
      && inputTouched
      && query.length >= 2
      && !query.startsWith('/')
      && !looksLikeAddress(query)
      && !activeTab()?.private
      && !addressInputComposing
      && !suppressProviderSuggestions
      && Bangs.parseBang(query) === null;
  }

  function scheduleSearchSuggestions() {
    resetSearchSuggestions();
    const query = addressInput.value.trim();
    if (!suggestionsAllowed(query)) return;

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
        : null;
      providerSuggestionQuery = query;
      providerSuggestions = Array.isArray(response?.suggestions)
        ? response.suggestions.filter((item) => typeof item === 'string')
        : [];
      renderList();
    }, 200);
  }

  function renderDisplayShare(model) {
    const fresh = displayShareModel?.requestId !== model?.requestId;
    displayShareModel = model;
    if (fresh) { displayShareSelection = null; displayShareAudio.checked = false; }
    displayShareOrigin.textContent = model.origin;
    displayShareAudioLabel.hidden = !model.audioRequested;
    displayShareAudio.disabled = model.loading;
    displayShareStatus.textContent = model.loading
      ? (model.portal ? blancI18n.t('share.status.portalLoading') : blancI18n.t('share.status.loading'))
      : model.portal ? blancI18n.t('share.status.portal')
        : blancI18n.t('share.status.choose');
    displayShareAllow.textContent = model.portal ? blancI18n.t('share.picker.continue') : blancI18n.t('share.picker.share');
    displayShareAllow.disabled = model.loading || (!model.portal && !displayShareSelection);
    displayShareSources.replaceChildren(...model.sources.map((source) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'display-share-source';
      button.setAttribute('aria-pressed', String(source.id === displayShareSelection));
      if (source.thumbnailDataURL.startsWith('data:image/png;base64,')) {
        const thumbnail = document.createElement('img');
        thumbnail.src = source.thumbnailDataURL;
        thumbnail.alt = '';
        button.append(thumbnail);
      }
      const name = document.createElement('span');
      name.textContent = source.name;
      name.dataset.i18nIgnore = ''; // a window or screen name
      button.append(name);
      button.addEventListener('click', () => {
        displayShareSelection = source.id;
        for (const item of displayShareSources.children) item.setAttribute('aria-pressed', String(item === button));
        displayShareAllow.disabled = false;
      });
      return button;
    }));
    if (fresh) displayShareCancel.focus();
  }
  displayShareCancel.addEventListener('click', () => window.browserAPI.closeOverlay('cancel'));
  displayShareBackdrop.addEventListener('mousedown', (event) => {
    if (event.target === displayShareBackdrop) window.browserAPI.closeOverlay('cancel');
  });
  displayShareAllow.addEventListener('click', () => {
    if (!displayShareModel || displayShareAllow.disabled) return;
    displayShareAllow.disabled = true;
    window.browserAPI.resolveDisplayPicker({
      requestId: displayShareModel.requestId,
      sourceId: displayShareSelection,
      computerAudioApproved: displayShareModel.audioRequested && displayShareAudio.checked,
    });
  });
  displaySharePicker.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    const controls = [...displaySharePicker.querySelectorAll('button:not(:disabled), input:not(:disabled)')]
      .filter((item) => item.getClientRects().length > 0);
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault(); last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first?.focus();
    }
  });

  // --- Mode switching (driven by main via overlay:show / overlay:hide) ---

  function applyMode(next, prefill, purpose) {
    const reshow = mode === next;
    // A press the overlay never saw released (dismissed mid-click) must not
    // leave the list frozen behind a stale hold.
    pointerHeld = false;
    if (pendingWorkspacesPayload) {
      const payload = pendingWorkspacesPayload;
      pendingWorkspacesPayload = null;
      commitWorkspacesPayload(payload);
    }
    renderQueued = false;
    mode = next;
    glancePickerPurpose = next === 'glance' ? purpose : null;
    if (next === 'find') findTabId = purpose?.findTabId ?? state.activeTabId;
    document.body.dataset.mode = next ?? '';
    document.body.dataset.glancePurpose = glancePickerPurpose ?? '';
    if (next !== 'panel' && next !== 'palette' && next !== 'spaces') closeWorkspaceSwitcher();
    // A group menu belongs to the surface that opened it: the panel's goes
    // when the panel does, the side list's when any other mode replaces it.
    if (groupMenu && (groupMenu.host === 'mode' ? next !== 'group-menu' : next !== 'panel' && next !== 'palette')) {
      closeGroupMenu({ commit: true });
    }
    backdrop.hidden = next !== 'panel' && next !== 'palette';
    panelAnchor.hidden = next !== 'panel' && next !== 'palette';
    findBar.hidden = next !== 'find';
    if (next !== 'shield' || !reshow) resetShieldChoice();
    shieldPop.hidden = next !== 'shield';
    shieldPopPointer.hidden = next !== 'shield' || !shieldConnected;
    capturePop.hidden = next !== 'capture';
    displayShareBackdrop.hidden = next !== 'display-share';
    if (next !== 'display-share') displayShareModel = null;
    glancePickerEl.hidden = next !== 'glance';

    if (next === 'panel' || next === 'palette') {
      if (!reshow) {
        siteInfoOpen = false;
        closedSectionOpen = false;
        devicesDrawerOpen = false;
        pendingGroupTabId = null;
        pendingRenameTabId = null;
        renamePrefill = null;
        namePrompt = null;
        clearWorkspacePopoverEditors();
        closeWorkspaceSwitcher();
        addressInputComposing = false;
        suppressProviderSuggestions = false;
        commandResultGeneration += 1;
        commandNotice = '';
        pendingPostImportWorkspacePrompt = false;
      }
      if (!reshow) resetSearchSuggestions();
      // A menu-triggered "New Group…" carries its target tab inside the
      // atomic overlay:show payload (and so survives the did-finish-load
      // replay after a slow first load or renderer crash — a separate
      // message would be lost and Enter would silently group the ACTIVE
      // tab). Glance's string purposes fall through harmlessly.
      if (purpose && typeof purpose === 'object' && purpose.beginGroupTabId != null) {
        pendingGroupTabId = purpose.beginGroupTabId;
        pendingRenameTabId = null;
      }
      // "Rename Tab…" (F46): same atomic payload as New Group… above.
      if (purpose && typeof purpose === 'object' && purpose.renameTabId != null) {
        pendingRenameTabId = purpose.renameTabId;
        pendingGroupTabId = null;
        renamePrefill = prefill ?? null;
      }
      // "Rename Group…": the same atomic payload makes the field a name prompt.
      if (purpose && typeof purpose === 'object' && purpose.renameGroupId != null) {
        namePrompt = { kind: 'group', id: purpose.renameGroupId, prefill: prefill ?? '', notice: '' };
        pendingGroupTabId = null;
        pendingRenameTabId = null;
      }
      // "Rename Device…" from the Other devices drawer: the same prompt.
      if (purpose && typeof purpose === 'object' && purpose.renameDeviceId != null) {
        namePrompt = { kind: 'device', id: purpose.renameDeviceId, prefill: prefill ?? '', notice: '' };
        pendingGroupTabId = null;
        pendingRenameTabId = null;
      }
      // A workspace row's context menu (main process) has no other channel
      // back into an already-open panel — same atomic-payload reasoning as
      // New Group… above. Unconditional (not just !reshow): the panel is
      // always already open when a row's menu fires, so this only ever runs
      // as a reshow, and each purpose always targets the CURRENT edit/
      // confirm state, replacing whatever the last one was. Editors open
      // inside the footer popover.
      if (purpose && typeof purpose === 'object') {
        if (purpose.postImportWorkspace) { pendingPostImportWorkspacePrompt = true; workspaceUI.begin('new', null, { start: 'window' }); }
        if (purpose.openSpaces) openWorkspaceSwitcher();
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
      if (workspacePopoverEditing() || pendingPostImportWorkspacePrompt) {
        openWorkspaceSwitcher();
      } else {
        // A pending workspace edit/confirm already claimed focus on its own
        // inline control — the address input must not steal it back.
        addressInput.focus();
        if (prefill) {
          // "Rename Tab…" selects only the current name, so typing replaces
          // it and the arrow keys edit it; other prefills park the cursor.
          // A name prompt selects the whole name, so typing replaces it.
          const from = namePrompt
            ? 0
            : pendingRenameTabId != null && prefill.startsWith('/rename ')
              ? '/rename '.length
              : prefill.length;
          addressInput.setSelectionRange(from, prefill.length);
        }
        else if (!reshow || !inputTouched) addressInput.select();
      }
    } else if (next === 'find') {
      findInput.focus();
      findInput.select();
    } else if (next === 'glance') {
      if (!reshow) {
        glancePickerSession += 1;
        // /glance <text> opens the picker already filtered.
        glancePickerInput.value = typeof prefill === 'string' ? prefill : '';
        glancePickerSelectedId = null;
        glancePickerError = '';
        glancePickerBusy = false;
      }
      renderGlancePicker({ announce: !reshow });
      glancePickerInput.focus();
    } else if (next === 'group-menu') {
      // The side list's group menu: the whole overlay is this one menu.
      if (purpose?.groupId && purpose.anchor) openGroupMenu(purpose.groupId, purpose.anchor, 'mode');
    } else if (next === 'spaces') {
      // The menu is the whole overlay here; data refreshes behind the first paint.
      refreshSwitcherData();
      if (!reshow) openWorkspaceSwitcher();
    } else if (next === 'shield') {
      renderShieldPop();
      (shieldChoosing ? shieldPopProvider.querySelector('input:checked:not(:disabled)') || shieldPopBack : shieldPopToggle.hidden ? shieldPopChangeProvider.disabled ? shieldPopSettings : shieldPopChangeProvider : shieldPopToggle).focus();
    } else if (next === 'display-share') {
      renderDisplayShare(purpose);
    } else if (next === 'capture') {
      renderCapturePop();
      capturePopRows.querySelector('.capture-pop-stop, .display-share-stop')?.focus();
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
    const shares = state.displayShares ?? [];
    capturePopHead.textContent = rows.length === 0 && shares.length > 0
      ? blancI18n.t('capture.pop.sharing')
      : blancI18n.t('capture.pop.inUse');
    const micItems = rows.map((row) => {
      // Two REAL sibling buttons in a plain list item — a role=button row
      // wrapping the Stop button would be an invalid accessibility tree
      // (no interactive content inside a button), and native buttons get
      // Enter/Space handling for free.
      const li = document.createElement('li');
      li.className = 'capture-pop-row';
      const hostLabel = row.host || blancI18n.t('capture.popupWindow');
      const go = document.createElement('button');
      go.className = 'capture-pop-go';
      go.setAttribute('aria-label', row.audio && row.video ? blancI18n.t('capture.row.goBoth', { host: hostLabel })
        : row.video ? blancI18n.t('capture.row.goCamera', { host: hostLabel })
          : blancI18n.t('capture.row.goMicrophone', { host: hostLabel }));
      go.dataset.i18nIgnore = 'aria-label'; // carries the host
      const glyphs = document.createElement('span');
      glyphs.className = 'capture-pop-glyphs';
      if (row.audio) glyphs.append(captureGlyph(MIC_SHAPES));
      if (row.video) glyphs.append(captureGlyph(CAM_SHAPES));
      const host = document.createElement('span');
      host.className = 'host';
      host.textContent = hostLabel;
      if (row.host) host.dataset.i18nIgnore = ''; // a host name
      go.append(glyphs, host);
      go.addEventListener('click', () => window.browserAPI.captureFocus(row.surfaceId));
      const stop = document.createElement('button');
      stop.className = 'capture-pop-stop';
      stop.textContent = blancI18n.t('capture.stop');
      stop.setAttribute('aria-label', row.audio && row.video ? blancI18n.t('capture.row.stopBoth', { host: hostLabel })
        : row.video ? blancI18n.t('capture.row.stopCamera', { host: hostLabel })
          : blancI18n.t('capture.row.stopMicrophone', { host: hostLabel }));
      stop.dataset.i18nIgnore = 'aria-label'; // carries the host
      stop.addEventListener('click', () => window.browserAPI.captureStop(row.surfaceId));
      li.append(go, stop);
      return li;
    });
    const shareItems = shares.map((row) => {
      const li = document.createElement('li');
      li.className = 'display-share-row';
      const titleText = row.pending ? blancI18n.t('share.row.pending')
        : row.surfaceLabel ? blancI18n.t('share.row.sharing', { surface: row.surfaceLabel })
          : blancI18n.t('share.row.sharingScreen');
      const audioText = row.computerAudio ? blancI18n.t('share.audioOn') : blancI18n.t('share.audioOff');
      const go = document.createElement('button');
      go.type = 'button';
      go.className = 'display-share-go';
      go.setAttribute('aria-label', blancI18n.t('share.row.label', { title: titleText, audio: audioText }));
      const title = document.createElement('span');
      title.className = 'display-share-title';
      title.textContent = titleText;
      const audio = document.createElement('span');
      audio.className = 'display-share-audio';
      audio.textContent = audioText;
      go.append(title, audio);
      go.addEventListener('click', () => {
        if (row.tabId) window.browserAPI.switchTab(row.tabId);
      });
      const stop = document.createElement('button');
      stop.type = 'button';
      stop.className = 'display-share-stop';
      stop.textContent = blancI18n.t('share.stop');
      stop.setAttribute('aria-label', row.surfaceLabel
        ? blancI18n.t('share.stopLabel', { surface: row.surfaceLabel })
        : blancI18n.t('share.stopLabelScreen'));
      stop.addEventListener('click', () => window.browserAPI.stopDisplayShare(row.shareId));
      li.append(go, stop);
      return li;
    });
    capturePopRows.replaceChildren(...micItems, ...shareItems);
  }

  // Renders from the last tabs:updated broadcast — main recomputes
  // state.shieldPopover on every broadcast, so a toggle flip or a load's
  // climbing block count re-renders live while the popover is open.
  function renderShieldPop() {
    const v = state.shieldPopover;
    if (!v) { window.browserAPI.closeOverlay(); return; }
    if (activeTab()?.private) document.documentElement.dataset.theme = 'private';
    else delete document.documentElement.dataset.theme;
    shieldPopHost.textContent = shieldChoosing ? blancI18n.t('shield.scopeRegular') : v.host;
    shieldPopHost.toggleAttribute('data-i18n-ignore', !shieldChoosing); // a host name
    shieldPopTitle.textContent = shieldChoosing ? blancI18n.t('shield.chooseBlocker') : blancI18n.t('shield.title');
    shieldPopSummary.hidden = shieldChoosing;
    shieldPopChooser.hidden = !shieldChoosing;
    shieldPopBack.hidden = !shieldChoosing;
    shieldPop.dataset.step = shieldChoosing ? 'chooser' : 'summary';
    document.getElementById('shieldPopSiteControl').hidden = v.variant === 'ublock';
    shieldPopLabel.textContent = blancI18n.t('shield.adBlocking');
    shieldPopOnOff.textContent = v.variant === 'ublock' ? '' : v.on ? blancI18n.t('shield.on') : blancI18n.t('shield.off');
    const controls = v.controls;
    shieldPop.dataset.restartPending = String(controls.restartPending);
    for (const input of shieldPopProvider.querySelectorAll('input')) input.checked = input.value === (shieldChoosing ? shieldDraft : controls.choice);
    shieldPopProvider.disabled = controls.disabled || shieldSaving;
    shieldPopChangeProvider.hidden = controls.hidden === true;
    shieldPopChangeProvider.disabled = controls.disabled;
    document.getElementById('shieldPopCurrentProvider').textContent = providerName(controls.active);
    for (const badge of shieldPopProvider.querySelectorAll('.shield-provider-active')) {
      badge.hidden = badge.dataset.provider !== controls.active;
      badge.textContent = controls.activeLabel;
    }
    const needsRestart = shieldDraft !== controls.active;
    shieldPopApply.disabled = shieldSaving || controls.disabled || (needsRestart && shieldDraft === 'ublock-origin' && !controls.ublockAvailable);
    shieldPopApply.textContent = shieldSaving
      ? (needsRestart ? blancI18n.t('shield.restarting') : blancI18n.t('shield.saving'))
      : needsRestart ? blancI18n.t('shield.restart') : blancI18n.t('shield.done');
    document.getElementById('shieldPopRestartNote').textContent = needsRestart
      ? blancI18n.t('shield.restartNeeded') : blancI18n.t('shield.restartNote');
    shieldPopProvider.querySelector('[value="ublock-origin"]').disabled = !controls.ublockAvailable;
    if (shieldPopProviderStatus.textContent !== controls.detail) shieldPopProviderStatus.textContent = controls.detail;
    shieldPopProviderScope.textContent = controls.scope;
    shieldPopProviderScope.hidden = !controls.scope;
    shieldPopAvailability.textContent = controls.availability;
    shieldPopAvailability.hidden = !controls.availability;
    shieldPopUblock.hidden = !controls.canOpenUblock;
    shieldPopToggle.hidden = v.variant !== 'site';
    shieldPopToggle.classList.toggle('on', v.on);
    shieldPopToggle.setAttribute('aria-checked', String(v.on));
    // Scheme-level label. "Uses HTTPS", never "Encrypted connection" — the
    // scheme proves the address, not a negotiated and verified session. A null
    // connection (loading, or a url with no claim to make) hides the row
    // rather than leaving a stale statement on screen.
    const connectionLabel = CONNECTION_LABEL[v.connection] ?? null;
    document.getElementById('shieldPopConnectionValue').textContent = connectionLabel ?? '';
    shieldPopConnection.hidden = !connectionLabel;
    shieldPopConnection.classList.toggle('insecure', v.connection === 'http');
    shieldPopCount.textContent = v.countLine;
    shieldPopNote.hidden = v.variant !== 'site';
    // Dark websites (F42): the same flip as /dark-site. `on` describes the
    // site while Blanc is dark, so the switch keeps meaning while it's light.
    const dark = v.darkSite;
    shieldPopDark.hidden = !dark;
    if (dark) {
      document.getElementById('shieldPopDarkOnOff').textContent = dark.on ? blancI18n.t('shield.on') : blancI18n.t('shield.off');
      shieldPopDarkToggle.classList.toggle('on', dark.on);
      shieldPopDarkToggle.setAttribute('aria-checked', String(dark.on));
      document.getElementById('shieldPopDarkNote').hidden = dark.appliesNow;
    }
  }

  shieldPopToggle.addEventListener('click', () => {
    // on → allow ads here; off (excepted) → re-block here. The popover only
    // shows this switch in the 'site' variant, so toggleAdblock can never
    // reach its global branch from the pill.
    if (state.shieldPopover?.on) window.browserAPI.allowAdsOnActiveSite();
    else window.browserAPI.toggleAdblock();
  });
  shieldPopDarkToggle.addEventListener('click', () => {
    window.browserAPI.toggleDarkSiteOnActiveSite();
  });
  function providerName(provider) { return provider === 'ublock-origin' ? 'uBlock Origin' : 'Blanc Blocker'; }

  function resetShieldChoice() {
    shieldSaveGeneration += 1;
    shieldChoosing = false;
    shieldDraft = null;
    shieldSaving = false;
    shieldPopChooserError.textContent = '';
    shieldPopChooserError.hidden = true;
  }

  function cancelShieldChoice() {
    resetShieldChoice();
    renderShieldPop();
    (shieldPopChangeProvider.disabled ? shieldPopSettings : shieldPopChangeProvider).focus();
  }

  shieldPopChangeProvider.addEventListener('click', () => {
    const controls = state.shieldPopover?.controls;
    if (!controls || controls.disabled) return;
    resetShieldChoice();
    shieldChoosing = true;
    shieldDraft = controls.choice;
    renderShieldPop();
    (shieldPopProvider.querySelector('input:checked:not(:disabled)') || shieldPopProvider.querySelector('input:not(:disabled)') || shieldPopBack).focus();
  });
  shieldPopBack.addEventListener('click', cancelShieldChoice);
  shieldPopProvider.addEventListener('change', (event) => {
    if (!shieldChoosing || shieldSaving || !['blanc', 'ublock-origin'].includes(event.target.value)) return;
    shieldDraft = event.target.value;
    shieldPopChooserError.hidden = true;
    renderShieldPop();
  });
  shieldPopApply.addEventListener('click', async () => {
    if (!shieldChoosing || shieldPopApply.disabled) return;
    const generation = ++shieldSaveGeneration;
    shieldSaving = true;
    renderShieldPop();
    try {
      const needsRestart = shieldDraft !== state.shieldPopover.controls.active;
      const accepted = await window.browserAPI.selectBlockingProvider(shieldDraft, needsRestart);
      if (generation !== shieldSaveGeneration || mode !== 'shield') return;
      if (!accepted) throw new Error('unavailable');
      window.browserAPI.closeOverlay('escape');
    } catch {
      if (generation !== shieldSaveGeneration || mode !== 'shield') return;
      shieldSaving = false;
      renderShieldPop();
      shieldPopChooserError.textContent = blancI18n.t('shield.error');
      shieldPopChooserError.hidden = false;
    }
  });
  shieldPop.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const controls = [...shieldPop.querySelectorAll('button:not(:disabled), input:not(:disabled)')].filter(item => item.getClientRects().length);
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  });
  shieldPopUblock.addEventListener('click', () => {
    window.browserAPI.openBlockingPopup().catch(() => {});
  });
  document.getElementById('shieldPopClose').addEventListener('click', () => window.browserAPI.closeOverlay('escape'));
  shieldPopSettings.addEventListener('click', () => {
    window.browserAPI.closeOverlay();
    window.browserAPI.openPage('settings', 'blocking');
  });

  function resetFind() {
    findInput.value = '';
    findCount.textContent = '';
    if (findLastQuery && findTabId) window.browserAPI.stopFindInPage(findTabId);
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
   * same top, capsule corners — and carry it to full size frame by frame.
   *
   * Size, not a transform scale (see morphPanelFromPill), and stepped here
   * rather than by a CSS transition: a transition runs on the wall clock, so
   * when the overlay is starved of frames for a moment (100–550 ms has been
   * measured mid-expand) the panel froze and then jumped most of the way at
   * once. Capping how far one frame may advance turns a stall into a pause. */
  const MORPH_MS = 320;          // the contents' 60 ms delay + 160 ms fade in styles.css finish inside this
  const MORPH_MAX_STEP_MS = 50;  // a longer gap between frames is a stall, not time to make up
  const RETRACT_MS = 200; // keep in step with OVERLAY_RETRACT_MS in main.js
  let lastPillRect = null;
  let morphTimer = null;
  // Closing, the Spaces menu fades back into the Island's mark from where it
  // hung; body[data-closing] keeps that placement while main holds the view.
  // The Glance picker shrinks back the same way, keeping its purpose's
  // placement until main lets the view go.
  let overlayExitTimer = null;
  function endOverlayExit() {
    clearTimeout(overlayExitTimer);
    overlayExitTimer = null;
    document.body.dataset.closing = '';
    if (mode !== 'glance') document.body.dataset.glancePurpose = '';
  }
  let morphFrame = 0;
  let morphGeneration = 0;
  let drawnGeneration = 0;

  /** cubic-bezier(0.4, 0, 0.2, 1) at progress x, 0..1: the curve the CSS
   * transition used. Bisection finds the curve parameter whose x matches. */
  function morphEase(x) {
    const at = (p1, p2, t) => 3 * (1 - t) * (1 - t) * t * p1 + 3 * (1 - t) * t * t * p2 + t * t * t;
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 24; i += 1) {
      const mid = (lo + hi) / 2;
      if (at(0.4, 0.2, mid) < x) lo = mid;
      else hi = mid;
    }
    return at(0, 1, (lo + hi) / 2);
  }

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
    // scale does not. The panel moves from the resting island's canonical
    // 17px corner to its own 18px corner, so the corner barely moves at all —
    // and with real width and height it doesn't.
    //
    // It also means the contents are revealed rather than squashed, so they
    // never rubber out on the way in.
    lastPillRect = pillRect;
    const from = {
      width: pillRect.width,
      height: pillRect.height,
      x: (pillRect.x + pillRect.width / 2) - (panelBox.left + panelBox.width / 2),
      y: pillRect.y - panelBox.top,
    };
    const to = { width: panelBox.width, height: panelBox.height };
    const paint = (p) => {
      islandPanel.style.width = `${(from.width + (to.width - from.width) * p).toFixed(1)}px`;
      islandPanel.style.height = `${(from.height + (to.height - from.height) * p).toFixed(1)}px`;
      islandPanel.style.borderRadius =
        `calc(var(--island-resting-radius) * ${(1 - p).toFixed(4)} + var(--island-panel-radius) * ${p.toFixed(4)})`;
      islandPanel.style.setProperty('--morph-x', `${(from.x * (1 - p)).toFixed(2)}px`);
      islandPanel.style.setProperty('--morph-y', `${(from.y * (1 - p)).toFixed(2)}px`);
    };

    clearTimeout(morphTimer);
    cancelAnimationFrame(morphFrame);
    const generation = ++morphGeneration;
    islandPanel.classList.add('morph-start');
    paint(0);

    // Two frames: one for the start state to be painted, one to leave it. A
    // single frame lands both in the same style recalculation and the panel
    // simply appears at full size.
    requestAnimationFrame(() => requestAnimationFrame((start) => {
      if (generation !== morphGeneration) return;
      islandPanel.classList.remove('morph-start');
      islandPanel.classList.add('morph-run');
      let elapsed = 0;
      let last = start;
      const step = (now) => {
        if (generation !== morphGeneration) return;
        elapsed += Math.min(Math.max(0, now - last), MORPH_MAX_STEP_MS);
        last = now;
        const t = Math.min(1, elapsed / MORPH_MS);
        paint(morphEase(t));
        if (t < 1) {
          morphFrame = requestAnimationFrame(step);
          return;
        }
        // Hand the box back to layout, so the panel resizes normally again
        // when tabs open and close underneath it.
        morphFrame = 0;
        clearMorphStyles();
      };
      morphFrame = requestAnimationFrame(step);
    }));
  }

  /** Tell main once the panel's first frame has been produced (the same
   * two-frame wait as the morph): over the pill's own box when it morphs, at
   * full size when it doesn't. Main then lets the strip hide the pill under it.
   * The palette keeps its pill, so only the panel reports. */
  function reportPanelDrawn() {
    const generation = ++drawnGeneration;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (generation === drawnGeneration && mode === 'panel') window.browserAPI.reportPanelDrawn();
    }));
  }

  const prefersReducedMotion = () =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  window.browserAPI.onShieldAnchor(({ x, connected }) => {
    shieldConnected = connected === true;
    shieldPopPointer.hidden = mode !== 'shield' || !shieldConnected;
    if (Number.isFinite(x)) shieldPopPointer.style.left = `${x}px`;
  });
  window.browserAPI.onOverlayShow(({ mode: next, prefill, purpose, pillRect }) => {
    const wasOpen = mode === next;
    endOverlayExit();
    // A quick close/reopen can arrive while the old retract timer is still
    // holding `pointer-events: none` on the panel. Cancel that stale exit
    // before constructing the new opening state, or the fresh panel renders
    // but cannot be clicked and is hidden when the old timer fires.
    if (!wasOpen && (next === 'panel' || next === 'palette')) clearMorphStyles();
    applyMode(next, prefill, purpose);
    if (!wasOpen && (next === 'panel' || next === 'palette')) {
      morphPanelFromPill(pillRect);
      reportPanelDrawn();
    }
  });
  // Main's overlay before-input owns Escape; when the workspace popover is
  // open it forwards here instead of hideOverlay so editors dismiss first.
  window.browserAPI.onOverlayEscape(() => {
    if (groupMenu) {
      const fromMode = groupMenu.host === 'mode';
      closeGroupMenu({ commit: false });
      if (fromMode) window.browserAPI.closeOverlay('escape');
      return;
    }
    if (mode === 'shield') {
      if (shieldChoosing) cancelShieldChoice();
      else window.browserAPI.closeOverlay('escape');
      return;
    }
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
    cancelAnimationFrame(morphFrame);
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
      islandPanel.style.borderRadius = 'var(--island-resting-radius)';
      islandPanel.style.setProperty('--morph-x', `${centreShift.toFixed(2)}px`);
      islandPanel.style.setProperty('--morph-y', `${(pill.y - box.top).toFixed(2)}px`);
    });
    return true;
  }

  /** Put the panel back to its resting styles once it is off screen. */
  function clearMorphStyles() {
    clearTimeout(morphTimer);
    cancelAnimationFrame(morphFrame);
    morphFrame = 0;
    morphGeneration += 1;
    islandPanel.classList.remove('morph-start', 'morph-run', 'retracting');
    islandPanel.style.width = '';
    islandPanel.style.height = '';
    islandPanel.style.borderRadius = '';
    islandPanel.style.removeProperty('--morph-x');
    islandPanel.style.removeProperty('--morph-y');
  }

  window.browserAPI.onOverlayHide((payload) => {
    islandDrag.cancel();
    hideIslandTip();
    // Closing the overlay any other way than Escape keeps a typed name.
    closeGroupMenu({ commit: true });
    // The next open may ask again (main refreshes stale copies on an ask).
    bangIconRequester.reset();
    drawnGeneration += 1;
    const retracting = payload?.retract && (mode === 'panel' || mode === 'palette')
      && retractPanelIntoPill();
    if (mode === 'find') resetFind();
    const leaving = mode === 'spaces' || mode === 'glance' ? mode : null;
    if (leaving) {
      endOverlayExit();
      document.body.dataset.closing = leaving;
      overlayExitTimer = setTimeout(endOverlayExit, RETRACT_MS);
    }
    mode = null;
    glancePickerPurpose = null;
    glancePickerSession += 1;
    glancePickerSelectedId = null;
    glancePickerError = '';
    glancePickerBusy = false;
    document.body.dataset.mode = '';
    // The leaving picker keeps its purpose's placement until the exit ends.
    if (leaving !== 'glance') document.body.dataset.glancePurpose = '';
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
    resetShieldChoice();
    shieldPop.hidden = true;
    shieldPopPointer.hidden = true;
    shieldConnected = false;
    glancePickerEl.hidden = true;
    inputTouched = false;
    siteInfoOpen = false;
    commandResultGeneration += 1;
    commandNotice = '';
    addressInputComposing = false;
    suppressProviderSuggestions = false;
    pendingGroupTabId = null;
    pendingRenameTabId = null;
    renamePrefill = null;
    namePrompt = null;
    clearWorkspacePopoverEditors();
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
  backdrop.addEventListener('mousedown', (event) => {
    // Pending decisions, Save First, and rejected editors own an explicit
    // Cancel path. Respect workspaceUI.close() refusing dismissal instead of
    // hiding the outer overlay and resetting that protected action anyway.
    if (workspaceSwitcherOpen && closeWorkspaceSwitcher() === false) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    window.browserAPI.closeOverlay();
  });
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
    if (mode === 'shield') {
      e.preventDefault();
      if (shieldChoosing) cancelShieldChoice();
      else window.browserAPI.closeOverlay('escape');
      return;
    }
    if (handleWorkspaceEscape()) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    window.browserAPI.closeOverlay();
  });

  /** Layered Esc for the footer workspace popover. Returns true if handled
   * (editor cancel or popover close) so main must not hide the whole island. */
  function handleWorkspaceEscape() { return workspaceUI.cancel(); }

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
  panelSiteInfo.addEventListener('click', () => {
    if (panelSiteInfo.hidden) return;
    siteInfoOpen = !siteInfoOpen;
    panelSiteInfo.setAttribute('aria-expanded', String(siteInfoOpen));
    renderList();
  });

  // --- Footer action bar (static: new tab / private launchers + quick pages) ---
  // These moved out of the scrollable list so they stay put while it shows
  // slash commands or Quick-Switcher results. Platform-correct shortcut hints.
  document.getElementById('footerNewTabKbd').textContent = `${modKey}T`;
  // These keep their visible words as their name; the tooltip's fuller text
  // (with the shortcut) is also their accessible description.
  for (const [button, text] of [
    [footerNewTab, blancI18n.t('pill.newTab.title', { shortcut: `${modKey}T` })],
    [footerNewPrivate, blancI18n.t('footer.newPrivate.title', { shortcut: `${modShiftKey}N` })],
    [footerDevices, blancI18n.t('footer.devices.title')],
  ]) {
    button.dataset.tooltip = text;
    button.setAttribute('aria-description', text);
  }

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
  footerDevices.addEventListener('click', () => {
    devicesDrawerOpen = !devicesDrawerOpen;
    renderList();
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
    // Typing switches the list out of its resting mode: end any drag first.
    islandDrag.cancel();
    siteInfoOpen = false;
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
    if (pendingRenameTabId != null && !addressInput.value.startsWith('/rename')) {
      pendingRenameTabId = null;
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
  /** Enter in a name prompt: an unchanged name just closes the panel; a
   * refused one says why and keeps the prompt open. A device saved with an
   * empty name shows its published name again. */
  async function submitNamePrompt() {
    const prompt = namePrompt;
    const value = addressInput.value;
    if (value.trim() === prompt.prefill.trim()) {
      window.browserAPI.closeOverlay();
      return;
    }
    if (prompt.kind === 'device') {
      await window.browserAPI.renameDevice(prompt.id, value);
      if (namePrompt === prompt) window.browserAPI.closeOverlay();
      return;
    }
    const result = await window.browserAPI.renameGroup(prompt.id, value);
    if (namePrompt !== prompt) return; // dismissed while main answered
    if (result?.ok === false && result.error === 'duplicate') {
      prompt.notice = blancI18n.t('groupMenu.duplicate', { name: value.trim() });
      renderList();
      return;
    }
    window.browserAPI.closeOverlay();
  }

  addressInput.addEventListener('keydown', (e) => {
    if (e.isComposing) return;
    if (namePrompt && e.key === 'Enter') {
      e.preventDefault();
      submitNamePrompt();
      return;
    }
    const unmodifiedArrow = !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey;
    if (
      unmodifiedArrow
      && (e.key === 'ArrowDown' || e.key === 'ArrowUp')
      && visibleResults.length
    ) {
      e.preventDefault();
      if (selectedResultIndex < 0) {
        selectedResultIndex = e.key === 'ArrowDown'
          ? arrowStartIndex()
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
    } else if (visibleResults[0]?.kind === 'bang') {
      // The hint row is the bare-Enter target whatever the words look like.
      pickResult(visibleResults[0]);
    } else if (visibleResults[0]?.kind === 'bangPick' && addressInput.value.trim() === '!') {
      // The picker alone: Enter does nothing rather than search for "!".
      // A bare unknown code (`!ddgbang`) falls through to the final branch
      // and searches as typed, as an unknown bang with words would.
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
    if (!findTabId || !query) {
      findCount.textContent = '';
      return;
    }
    window.browserAPI.findInPage(findTabId, query, options);
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
      if (findTabId) window.browserAPI.stopFindInPage(findTabId);
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
    const [favoritesList, historyList, remoteList, workspacesPayload, bangsPayload, archivedList] = await Promise.all([
      window.browserAPI.listFavorites(),
      window.browserAPI.listHistory({ limit: 300 }),
      window.browserAPI.listRemoteTabs(),
      window.browserAPI.listWorkspaces(),
      window.browserAPI.bangs(),
      window.browserAPI.archiveList(),
    ]);
    favorites = favoritesList;
    historyEntries = historyList;
    archivedEntries = Array.isArray(archivedList) ? archivedList : [];
    remoteDevices = remoteList;
    applyWorkspacesPayload(workspacesPayload);
    bangsState = bangsPayload;
    // Data lands after the panel already rendered — refresh it.
    if (mode === 'panel' || mode === 'palette') renderList();
  }

  window.browserAPI.onTabsUpdated((payload) => {
    const activeTabChanged = payload.activeTabId !== state.activeTabId;
    state = payload;
    noteBangIconPrivacy();
    islandDrag.notePayload(payload);
    // A group that closed or dissolved under its open menu takes the menu along.
    if (groupMenu && !groupById(groupMenu.groupId)) {
      const fromMode = groupMenu.host === 'mode';
      closeGroupMenu({ commit: false });
      if (fromMode) window.browserAPI.closeOverlay('cancel');
    }
    if (mode === 'panel' || mode === 'palette') {
      if (!inputTouched) addressInput.value = addressDisplayValue(activeTab());
      if (activeTabChanged) {
        siteInfoOpen = false;
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
  // The bang settings changed (Settings, Profile Sync, a bang used, history
  // cleared): the hint row and picker follow without a relaunch.
  window.browserAPI.onBangsChanged((payload) => {
    bangsState = payload;
    if (mode === 'panel' || mode === 'palette') renderList();
  });
  // A bang site's icon arrived from Blanc's icon server, or was withdrawn.
  window.browserAPI.onBangIconsChanged(applyBangIconChange);
  // Freshness for the workspaces section: a switch/rename/delete anywhere
  // (another window, or this one) must not leave a pull-once list showing a
  // stale "active" row or a name that no longer matches.
  window.browserAPI.onWorkspacesUpdated((payload) => {
    applyWorkspacesPayload(payload);
    if (mode === 'panel' || mode === 'palette') renderList();
  });
  // A space row's right-click choice (main's native menu) runs in this menu.
  window.browserAPI.onWorkspaceAction(({ kind, id }) => {
    const workspace = wsWorkspaces.find((w) => w.id === id);
    if (workspace && (kind === 'edit' || kind === 'delete')) workspaceUI.begin(kind, workspace);
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
    // A named group's header opens its group menu (tab group colors spec
    // §6); the Recently closed band's header is not a group and has none.
    const groupHeader = tabRowEl || workspaceRowEl
      ? null
      : e.target.closest('#islandList [data-drag-header][data-group-id]');
    if (groupHeader && groupHeader.dataset.groupId !== dragApi.constants.CLOSED_SECTION_ID) {
      e.preventDefault();
      releasePointerHold();
      const r = groupHeader.getBoundingClientRect();
      openGroupMenu(groupHeader.dataset.groupId, { right: r.right, top: r.top, bottom: r.bottom }, 'panel');
      return;
    }
    // A device header in the Other devices drawer gets Rename Device…
    // (device-context-menu.js).
    window.__blancCtxDeviceId = tabRowEl || workspaceRowEl
      ? null
      : e.target.closest('#islandDrawer .island-ghead[data-device-id]')?.dataset.deviceId ?? null;
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
      && window.__blancCtxDeviceId == null
    ) {
      e.preventDefault();
    }
  });
})();
