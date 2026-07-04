// Renderer for the overlay WebContentsView — the island's expanded states,
// floating over web content: the command bar ('panel', anchored where the
// pill sits), the summoned palette ('palette', centered over a scrim), and
// the find-in-page capsule ('find', tight bounds set by main).
(() => {
  const { platform } = window.browserAPI;
  const isMac = platform === 'darwin';
  const modKey = isMac ? '⌘' : 'ctrl+';

  const backdrop = document.getElementById('backdrop');
  const panelAnchor = document.getElementById('panelAnchor');
  const addressInput = document.getElementById('addressInput');
  const islandList = document.getElementById('islandList');
  const islandHint = document.getElementById('islandHint');
  const backBtn = document.getElementById('backBtn');
  const fwdBtn = document.getElementById('fwdBtn');
  const reloadBtn = document.getElementById('reloadBtn');
  const heartBtn = document.getElementById('heartBtn');
  const dismissBtn = document.getElementById('dismissBtn');
  const findBar = document.getElementById('findBar');
  const findInput = document.getElementById('findInput');
  const findCount = document.getElementById('findCount');
  const findPrevBtn = document.getElementById('findPrevBtn');
  const findNextBtn = document.getElementById('findNextBtn');
  const findCloseBtn = document.getElementById('findCloseBtn');

  let state = { tabs: [], activeTabId: null };
  /** @type {null | 'panel' | 'palette' | 'find'} */
  let mode = null;
  // The address input's value is only ours to overwrite while untouched;
  // once the user types, incoming tab updates must not clobber it.
  let inputTouched = false;
  let findLastQuery = null;
  // Quick Switcher corpora, refreshed each time the panel opens.
  let favorites = [];
  let historyEntries = [];
  // What Enter acts on — rebuilt on every list render.
  let visibleCommands = [];
  let visibleResults = [];

  const ICONS = {
    reload: '<svg viewBox="0 0 16 16"><path d="M13 8a5 5 0 1 1-5-5c1.4 0 2.74.56 3.74 1.53L13 5.78"/><path d="M13 3v2.78h-2.78"/></svg>',
    stop: '<svg viewBox="0 0 16 16"><path d="M4.25 4.25l7.5 7.5M11.75 4.25l-7.5 7.5"/></svg>',
    close: '<svg viewBox="0 0 16 16"><path d="M4.75 4.75l6.5 6.5M11.25 4.75l-6.5 6.5"/></svg>',
    plus: '<svg viewBox="0 0 16 16"><path d="M8 3.25v9.5M3.25 8h9.5"/></svg>',
  };
  reloadBtn.innerHTML = ICONS.reload;

  function activeTab() {
    return state.tabs.find((t) => t.id === state.activeTabId) || null;
  }

  const isFavoritable = (url) => /^https?:\/\//.test(url || '');

  function addressDisplayValue(tab) {
    if (!tab) return '';
    if (tab.url.startsWith('bowser://newtab') || tab.url.startsWith('file://')) return '';
    // The error page carries the failed URL in its query — show that, so
    // the user sees (and can edit/retry) the address they typed.
    if (tab.url.startsWith('bowser://error')) {
      try {
        return new URL(tab.url).searchParams.get('url') || tab.url;
      } catch {
        return tab.url;
      }
    }
    return tab.url;
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
  }

  function tabRow(tab) {
    const row = document.createElement('div');
    row.className = 'island-row' + (tab.id === state.activeTabId ? ' active' : '');

    const favicon = document.createElement('span');
    setFavicon(favicon, tab);

    const title = document.createElement('span');
    title.className = 'row-title';
    title.textContent = tab.isLoading ? 'Loading…' : tab.title || 'New Tab';

    const sub = document.createElement('span');
    sub.className = 'row-sub';
    sub.textContent = tabDomain(tab);

    row.append(favicon, title, sub);

    if (tab.private) {
      const tag = document.createElement('span');
      tag.className = 'row-private';
      tag.textContent = 'private';
      row.append(tag);
    }

    if (tab.blockedCount > 0) {
      const shield = document.createElement('span');
      shield.className = 'shield';
      shield.textContent = String(tab.blockedCount);
      shield.title = `Bowser blocked ${tab.blockedCount} ${tab.blockedCount === 1 ? 'ad or tracker' : 'ads & trackers'} on this page`;
      row.append(shield);
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

    row.addEventListener('click', () => {
      window.browserAPI.switchTab(tab.id);
      window.browserAPI.closeOverlay();
    });
    row.addEventListener('auxclick', (e) => {
      if (e.button === 1) window.browserAPI.closeTab(tab.id); // middle-click closes
    });
    return row;
  }

  function newTabRow() {
    const row = document.createElement('div');
    row.className = 'island-row newtab';
    row.innerHTML = `${ICONS.plus}<span class="row-title">New tab</span><span class="row-kbd">${modKey}T</span>`;
    row.addEventListener('click', () => {
      window.browserAPI.closeOverlay();
      window.browserAPI.createTab(); // main reopens the panel focused on the blank tab
    });
    return row;
  }

  // --- Slash commands ---

  const COMMANDS = [
    { cmd: '/favorites', hint: 'Open favorites', run: () => window.browserAPI.openPage('bookmarks') },
    { cmd: '/history', hint: 'Open browsing history', run: () => window.browserAPI.openPage('history') },
    { cmd: '/downloads', hint: 'Open downloads', run: () => window.browserAPI.openPage('downloads') },
    { cmd: '/settings', hint: 'Open settings', run: () => window.browserAPI.openPage('settings') },
    { cmd: '/clear', hint: 'Clear browsing history', run: () => window.browserAPI.clearHistory() },
    { cmd: '/new', hint: 'Open a new tab', run: () => window.browserAPI.createTab() },
    { cmd: '/private', hint: 'Open a private tab — history stays untouched', run: () => window.browserAPI.createTab(null, { private: true }) },
    { cmd: '/close', hint: 'Close this tab', run: () => state.activeTabId && window.browserAPI.closeTab(state.activeTabId) },
    { cmd: '/find', hint: 'Find in page', run: () => window.browserAPI.openFindBar(), keepOverlay: true },
    { cmd: '/adblock', hint: 'Toggle ad & tracker blocking', run: () => window.browserAPI.toggleAdblock() },
    { cmd: '/off-leash', hint: 'Allow ads on this site', run: () => window.browserAPI.allowAdsOnActiveSite() },
    { cmd: '/theme', hint: 'Cycle appearance (system → light → dark)', run: () => window.browserAPI.cycleTheme() },
  ];

  function runCommand(command) {
    // Close first: commands that open something (a page, a fresh tab) rely
    // on main re-showing the overlay in a clean state where needed.
    if (!command.keepOverlay) window.browserAPI.closeOverlay();
    command.run();
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

  const stripUrl = (u) => (u || '').replace(/^https?:\/\//, '').replace(/\/$/, '');

  function switcherResults(query) {
    const results = [];
    for (const t of state.tabs) {
      const s = matchScore(query, matchableText(t.title, t.url));
      if (s) results.push({ kind: 'tab', title: t.title || 'New Tab', sub: tabDomain(t), tab: t, score: s + 0.2 });
    }
    for (const f of favorites) {
      const s = matchScore(query, matchableText(f.title, f.url));
      if (s) results.push({ kind: 'favorite', title: f.title, sub: stripUrl(f.url), url: f.url, score: s + 0.1 });
    }
    for (const h of historyEntries) {
      const s = matchScore(query, matchableText(h.title, h.url));
      if (s) results.push({ kind: 'history', title: h.title, sub: stripUrl(h.url), url: h.url, score: s });
    }
    const seen = new Set();
    return results
      .sort((a, b) => b.score - a.score)
      .filter((r) => {
        const key = r.kind === 'tab' ? `tab:${r.tab.id}` : r.url;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 6);
  }

  function pickResult(result) {
    if (result.kind === 'tab') window.browserAPI.switchTab(result.tab.id);
    else if (state.activeTabId) window.browserAPI.navigate(state.activeTabId, result.url);
    window.browserAPI.closeOverlay();
  }

  function resultRow(result, isTop) {
    const row = document.createElement('div');
    row.className = 'island-row' + (isTop ? ' active' : '');

    const favicon = document.createElement('span');
    setFavicon(favicon, result.tab ?? null);

    const title = document.createElement('span');
    title.className = 'row-title';
    title.textContent = result.title || result.url || '';

    const sub = document.createElement('span');
    sub.className = 'row-sub';
    sub.textContent = result.sub || '';

    const tag = document.createElement('span');
    tag.className = 'row-tag';
    tag.textContent = result.kind;

    row.append(favicon, title, sub, tag);
    if (isTop) row.append(enterGlyph());
    row.addEventListener('click', () => pickResult(result));
    return row;
  }

  // --- List area: tabs at rest, commands on "/", switcher while typing ---

  function renderList() {
    const value = addressInput.value;
    visibleCommands = [];
    visibleResults = [];

    if (inputTouched && value.startsWith('/')) {
      const slashWord = value.trim().split(/\s+/)[0];
      visibleCommands = COMMANDS.filter((c) => c.cmd.startsWith(slashWord) || slashWord === '/');
      islandList.replaceChildren(
        ...(visibleCommands.length
          ? visibleCommands.map((c, i) => commandRow(c, i === 0))
          : [emptyRow('no matching command')])
      );
    } else if (inputTouched && value.trim()) {
      visibleResults = switcherResults(value.trim().toLowerCase());
      islandList.replaceChildren(
        ...(visibleResults.length
          ? visibleResults.map((r, i) => resultRow(r, i === 0))
          : [emptyRow('no matches — ↵ opens as address or search')])
      );
    } else {
      islandList.replaceChildren(...state.tabs.map(tabRow), newTabRow());
    }

    islandHint.textContent = activeTab()?.private
      ? 'private · nothing here is saved to history · esc to dismiss'
      : `esc to dismiss · ${modKey}L summons · / for commands`;
  }

  function renderPanel() {
    // The private theme scope follows the active tab.
    if (activeTab()?.private) document.documentElement.dataset.theme = 'private';
    else delete document.documentElement.dataset.theme;
    renderPanelChrome();
    renderList();
  }

  // --- Mode switching (driven by main via overlay:show / overlay:hide) ---

  function applyMode(next) {
    const reshow = mode === next;
    mode = next;
    document.body.dataset.mode = next ?? '';
    backdrop.hidden = next !== 'panel' && next !== 'palette';
    panelAnchor.hidden = next !== 'panel' && next !== 'palette';
    findBar.hidden = next !== 'find';

    if (next === 'panel' || next === 'palette') {
      refreshSwitcherData();
      renderPanel();
      // A reassert (main re-focusing the same open panel) must not clobber
      // what the user already typed.
      if (!reshow || !inputTouched) {
        inputTouched = false;
        addressInput.value = addressDisplayValue(activeTab());
      }
      addressInput.focus();
      addressInput.select();
    } else if (next === 'find') {
      findInput.focus();
      findInput.select();
    }
  }

  function resetFind() {
    findInput.value = '';
    findCount.textContent = '';
    if (findLastQuery && state.activeTabId) window.browserAPI.stopFindInPage(state.activeTabId);
    findLastQuery = null;
  }

  window.browserAPI.onOverlayShow(({ mode: next }) => applyMode(next));
  window.browserAPI.onOverlayHide(() => {
    if (mode === 'find') resetFind();
    mode = null;
    document.body.dataset.mode = '';
    backdrop.hidden = true;
    panelAnchor.hidden = true;
    findBar.hidden = true;
    inputTouched = false;
  });

  // Click on the backdrop (anywhere outside the panel) dismisses.
  backdrop.addEventListener('mousedown', () => window.browserAPI.closeOverlay());
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') window.browserAPI.closeOverlay();
  });

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

  addressInput.addEventListener('input', () => {
    inputTouched = true;
    renderList();
  });
  addressInput.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    if (visibleCommands.length) {
      runCommand(visibleCommands[0]);
    } else if (visibleResults.length) {
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

  // Search live as the user types; Enter/Shift+Enter step through matches.
  findInput.addEventListener('input', () => {
    if (!findInput.value) {
      findCount.textContent = '';
      findLastQuery = null;
      if (state.activeTabId) window.browserAPI.stopFindInPage(state.activeTabId);
      return;
    }
    runFind({ forward: true, findNext: false });
  });
  findInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      runFind({ forward: !e.shiftKey, findNext: findInput.value === findLastQuery });
    }
  });
  findPrevBtn.addEventListener('click', () => runFind({ forward: false, findNext: true }));
  findNextBtn.addEventListener('click', () => runFind({ forward: true, findNext: true }));
  findCloseBtn.addEventListener('click', () => window.browserAPI.closeOverlay());

  window.browserAPI.onFindResult(({ activeMatchOrdinal, matches }) => {
    findCount.textContent = matches > 0 && findInput.value ? `${activeMatchOrdinal}/${matches}` : '';
  });

  // --- State sync ---

  async function refreshSwitcherData() {
    [favorites, historyEntries] = await Promise.all([
      window.browserAPI.listFavorites(),
      window.browserAPI.listHistory({ limit: 300 }),
    ]);
  }

  window.browserAPI.onTabsUpdated((payload) => {
    state = payload;
    if (mode === 'panel' || mode === 'palette') {
      renderPanel();
      if (!inputTouched) addressInput.value = addressDisplayValue(activeTab());
    }
  });
  window.browserAPI.getAllTabs().then((payload) => {
    state = payload;
  });
})();
