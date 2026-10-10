// Vertical-tabs presentation for the trusted chrome document. Main remains
// the sole owner of tab state; renderer.js feeds each tabs:updated payload to
// the single render() entry point below.
(() => {
  'use strict';

  const api = window.browserAPI;
  const rail = document.getElementById('verticalTabsRail');
  const list = document.getElementById('verticalTabsList');
  const useIslandButton = document.getElementById('verticalTabsUseIsland');
  const newTabButton = document.getElementById('verticalTabsNew');
  const newTabShortcut = document.getElementById('verticalTabsNewShortcut');
  const resizeHandle = document.getElementById('verticalTabsResizeHandle');
  const announcer = document.getElementById('verticalTabsAnnouncer');
  if (!api || !rail || !list || !useIslandButton || !newTabButton || !resizeHandle) return;

  const ICONS = {
    close: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.75 4.75l6.5 6.5M11.25 4.75l-6.5 6.5"/></svg>',
    pin: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m5.2 2.75 5.6 5.6M9.9 3.65l2.45 2.45-2.1 2.1.35 2.25-1.05 1.05-2.3-2.3-3.5 3.5-.45-.45 3.5-3.5-2.3-2.3 1.05-1.05 2.25.35z"/></svg>',
    audible: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 6.25h2L8 3.5v9L5 9.75H3zM10.25 6a3 3 0 0 1 0 4M11.75 4.5a5 5 0 0 1 0 7"/></svg>',
    muted: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 6.25h2L8 3.5v9L5 9.75H3zM10.25 6.25l3.5 3.5M13.75 6.25l-3.5 3.5"/></svg>',
    caret: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3.75 4 4.25-4 4.25"/></svg>',
  };
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  // Derived render bookkeeping and pointer/focus interaction state only.
  // The authoritative tab/group model is never copied out of renderer.js.
  let lastSignature = null;
  let pendingFocusKey = null;
  let suppressFocusRestore = false;
  let resizeState = null;
  let resizePreviewFrame = 0;
  let queuedPreviewWidth = null;
  let widthMetrics = {
    width: 248,
    preferredWidth: 248,
    minWidth: 200,
    maxWidth: 360,
    defaultWidth: 248,
  };

  newTabShortcut.textContent = api.platform === 'darwin' ? '⌘T' : `${blancI18n.t('key.ctrl')} T`;

  function titleFor(tab) {
    return tab.title || (tab.private ? blancI18n.t('tab.untitledPrivate') : blancI18n.t('tab.untitled'));
  }

  function bucketKey(tab) {
    return JSON.stringify([tab.groupId ?? null, !!tab.pinned]);
  }

  function railSignature(payload) {
    return JSON.stringify({
      activeTabId: payload.activeTabId,
      groups: (payload.groups || []).map(({ id, name, collapsed }) => ({ id, name, collapsed })),
      tabs: (payload.tabs || []).map((tab) => ({
        id: tab.id,
        title: tab.title,
        url: tab.url,
        favicon: tab.favicon,
        isLoading: tab.isLoading,
        private: tab.private,
        pinned: tab.pinned,
        muted: tab.muted,
        audible: tab.audible,
        asleep: tab.asleep,
        groupId: tab.groupId ?? null,
      })),
    });
  }

  function invoke(label, action) {
    try {
      Promise.resolve(action()).catch((error) => {
        console.error(`Vertical tabs: ${label} failed`, error);
      });
    } catch (error) {
      console.error(`Vertical tabs: ${label} failed`, error);
    }
  }

  // Actions that hand keyboard focus to the Island or page must not have a
  // closely-following tabs:updated render restore focus back into the rail.
  function invokeLeavingRail(label, action) {
    pendingFocusKey = null;
    suppressFocusRestore = true;
    invoke(label, action);
  }

  function announce(message) {
    announcer.textContent = '';
    requestAnimationFrame(() => { announcer.textContent = message; });
  }

  function applyWidthMetrics(payload = {}) {
    const width = Number(payload.verticalTabsWidth);
    if (!Number.isFinite(width) || width <= 0) return false;
    const preferredWidth = Number(payload.verticalTabsPreferredWidth);
    const minWidth = Number(payload.verticalTabsMinWidth);
    const maxWidth = Number(payload.verticalTabsMaxWidth);
    const defaultWidth = Number(payload.verticalTabsDefaultWidth);
    widthMetrics = {
      width,
      preferredWidth: Number.isFinite(preferredWidth) ? preferredWidth : width,
      minWidth: Number.isFinite(minWidth) ? minWidth : 200,
      maxWidth: Number.isFinite(maxWidth) ? maxWidth : 360,
      defaultWidth: Number.isFinite(defaultWidth) ? defaultWidth : 248,
    };
    document.documentElement.style.setProperty('--vertical-tabs-w', `${width}px`);
    resizeHandle.setAttribute('aria-valuemin', String(widthMetrics.minWidth));
    resizeHandle.setAttribute('aria-valuemax', String(widthMetrics.maxWidth));
    resizeHandle.setAttribute('aria-valuenow', String(width));
    resizeHandle.setAttribute('aria-valuetext', blancI18n.t('rail.widthValue', { width }));
    return true;
  }

  function commitWidth(width, message) {
    invoke('resize vertical tabs', async () => {
      const committed = await api.setVerticalTabsWidth(width);
      if (message) announce(message(committed));
    });
  }

  function queueWidthPreview(width) {
    queuedPreviewWidth = width;
    if (resizePreviewFrame) return;
    resizePreviewFrame = requestAnimationFrame(() => {
      resizePreviewFrame = 0;
      const queued = queuedPreviewWidth;
      queuedPreviewWidth = null;
      api.previewVerticalTabsWidth(queued);
    });
  }

  function clearQueuedWidthPreview() {
    if (resizePreviewFrame) cancelAnimationFrame(resizePreviewFrame);
    resizePreviewFrame = 0;
    queuedPreviewWidth = null;
  }

  function faviconFallbackLabel(tab) {
    try {
      const host = new URL(tab?.url || '').hostname.replace(/^www\./i, '');
      return Array.from(host)[0]?.toUpperCase() || '•';
    } catch {
      return '•';
    }
  }

  function faviconFor(tab) {
    const favicon = document.createElement('span');
    favicon.className = `favicon vertical-tab-favicon${tab.isLoading ? ' loading' : ''}`;
    favicon.setAttribute('aria-hidden', 'true');
    if (tab.isLoading) return favicon;
    if ((tab.url || '').startsWith('blanc://')) {
      favicon.classList.add('internal');
    } else if (tab.favicon) {
      favicon.classList.add('has-icon');
      favicon.style.backgroundImage = `url("${tab.favicon.replace(/[\\"]/g, '\\$&')}")`;
    } else {
      favicon.classList.add('fallback');
      favicon.textContent = faviconFallbackLabel(tab);
    }
    return favicon;
  }

  function makeMarker(className, html, label) {
    const marker = document.createElement('span');
    marker.className = className;
    marker.innerHTML = html;
    marker.title = label;
    marker.setAttribute('aria-hidden', 'true');
    return marker;
  }

  function startTitleScroll(viewport, text) {
    if (reducedMotion.matches) return;
    const overflow = Math.ceil(text.scrollWidth - viewport.clientWidth);
    if (overflow <= 1) return;
    // Travel at a steady reading speed, bounded so unusually long page titles
    // neither race past nor leave the user waiting indefinitely.
    const duration = Math.max(1600, Math.min(12000, Math.round(overflow / 0.045)));
    viewport.style.setProperty('--vertical-tab-title-offset', `${-overflow}px`);
    viewport.style.setProperty('--vertical-tab-title-duration', `${duration}ms`);
    viewport.dataset.overflowing = 'true';
    viewport.classList.add('scrolling');
    // The native tooltip would cover the moving title. Screen readers retain
    // the complete button aria-label; reduced-motion users keep the tooltip
    // because this function exits before removing it.
    viewport.closest('.vertical-tab-primary')?.removeAttribute('title');
  }

  function stopTitleScroll(viewport) {
    viewport.classList.remove('scrolling');
    viewport.style.removeProperty('--vertical-tab-title-offset');
    viewport.style.removeProperty('--vertical-tab-title-duration');
    delete viewport.dataset.overflowing;
    const primary = viewport.closest('.vertical-tab-primary');
    if (primary && !primary.hasAttribute('title')) {
      primary.title = viewport.textContent;
    }
  }

  function visiblePrimaryButtons() {
    return [...list.querySelectorAll('.vertical-tab-primary')];
  }

  function setRovingPrimary(target) {
    for (const button of visiblePrimaryButtons()) {
      button.tabIndex = button === target ? 0 : -1;
    }
  }

  function movePrimaryFocus(current, destination) {
    const buttons = visiblePrimaryButtons();
    if (!buttons.length) return;
    const currentIndex = Math.max(0, buttons.indexOf(current));
    let next;
    if (destination === 'first') next = buttons[0];
    else if (destination === 'last') next = buttons[buttons.length - 1];
    else {
      const offset = destination === 'previous' ? -1 : 1;
      next = buttons[(currentIndex + offset + buttons.length) % buttons.length];
    }
    setRovingPrimary(next);
    next.focus();
    next.scrollIntoView({ block: 'nearest' });
  }

  function focusKeyFor(element) {
    return rail.contains(element) ? element.closest('[data-focus-key]')?.dataset.focusKey ?? null : null;
  }

  function closeTabFromRail(tab, keepFocus) {
    if (keepFocus) {
      const buttons = visiblePrimaryButtons();
      const current = buttons.findIndex((button) => button.dataset.tabId === tab.id);
      const fallback = buttons[current + 1] || buttons[current - 1];
      pendingFocusKey = fallback?.dataset.focusKey ?? null;
    }
    invoke('close tab', () => api.closeTab(tab.id));
  }

  function activateTab(tab) {
    invokeLeavingRail('activate tab', () => api.activateTabFromRail(tab.id));
  }

  function primaryKeydown(event, tab, primary, closeButton) {
    if (event.altKey && event.shiftKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      keyboardMove('tab', tab.id, event.key === 'ArrowUp' ? 'up' : 'down');
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      movePrimaryFocus(primary, 'previous');
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      movePrimaryFocus(primary, 'next');
    } else if (event.key === 'Home') {
      event.preventDefault();
      movePrimaryFocus(primary, 'first');
    } else if (event.key === 'End') {
      event.preventDefault();
      movePrimaryFocus(primary, 'last');
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      closeButton.focus();
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      activateTab(tab);
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      closeTabFromRail(tab, true);
    }
  }

  function tabRow(tab, activeTabId) {
    const title = titleFor(tab);
    const active = tab.id === activeTabId;
    const row = document.createElement('div');
    row.className =
      'vertical-tab-row' +
      (active ? ' active' : '') +
      (tab.private ? ' private' : '') +
      (tab.isLoading ? ' loading' : '') +
      (tab.asleep ? ' quiet' : '');
    row.setAttribute('role', 'listitem');
    row.dataset.tabId = tab.id;
    row.dataset.bucket = bucketKey(tab);
    row.dataset.dragTab = '';
    row.dataset.pinned = String(!!tab.pinned);
    row.dataset.groupId = tab.groupId ?? '';
    row.dataset.dragTitle = title;

    const primary = document.createElement('button');
    primary.type = 'button';
    primary.className = 'vertical-tab-primary';
    primary.dataset.tabId = tab.id;
    primary.dataset.focusKey = `tab:${tab.id}`;
    primary.tabIndex = -1;
    const states = [
      active && blancI18n.t('rail.state.active'),
      tab.private && blancI18n.t('rail.state.private'),
      tab.pinned && blancI18n.t('rail.state.pinned'),
      tab.isLoading && blancI18n.t('rail.state.loading'),
      tab.asleep && blancI18n.t('rail.state.quiet'),
      tab.muted ? blancI18n.t('rail.state.muted') : tab.audible && blancI18n.t('rail.state.playingAudio'),
    ].filter(Boolean);
    const rowLabel = active ? blancI18n.t('rail.tab.current', { title }) : blancI18n.t('dot.switchTo', { title });
    primary.setAttribute(
      'aria-label',
      states.length ? blancI18n.t('rail.tab.withStates', { label: rowLabel, states: states.join(', ') }) : rowLabel
    );
    if (active) primary.setAttribute('aria-current', 'page');
    primary.title = title;
    // A tab title is page data, not interface copy (pseudo-locale sweep): only
    // this button's title attribute and the title text below are exempt.
    if (tab.title) primary.dataset.i18nIgnore = 'title';

    primary.appendChild(faviconFor(tab));
    const titleEl = document.createElement('span');
    titleEl.className = 'vertical-tab-title';
    titleEl.dataset.i18nIgnore = '';
    titleEl.setAttribute('aria-hidden', 'true');
    const titleText = document.createElement('span');
    titleText.className = 'vertical-tab-title-text';
    titleText.textContent = title;
    titleEl.appendChild(titleText);
    titleEl.addEventListener('pointerenter', () => startTitleScroll(titleEl, titleText));
    titleEl.addEventListener('pointerleave', () => stopTitleScroll(titleEl));
    primary.appendChild(titleEl);

    if (tab.private) {
      const privateMarker = document.createElement('span');
      privateMarker.className = 'vertical-tab-private';
      privateMarker.textContent = blancI18n.t('rail.private.marker');
      privateMarker.setAttribute('aria-hidden', 'true');
      primary.appendChild(privateMarker);
    }
    // Quiet is dim-only here too (row dim + the aria states entry above); see
    // the 2026-08-18 quiet-marker-dim-only spec before reintroducing a marker.
    if (tab.pinned) {
      primary.appendChild(makeMarker('vertical-tab-state vertical-tab-pin', ICONS.pin, blancI18n.t('rail.marker.pinned')));
    }
    if (tab.muted) {
      primary.appendChild(makeMarker('vertical-tab-state vertical-tab-audio muted', ICONS.muted, blancI18n.t('rail.marker.muted')));
    } else if (tab.audible) {
      primary.appendChild(makeMarker('vertical-tab-state vertical-tab-audio', ICONS.audible, blancI18n.t('rail.marker.playingAudio')));
    }

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'vertical-tab-close';
    close.innerHTML = ICONS.close;
    close.title = blancI18n.t('rail.close', { title });
    close.setAttribute('aria-label', close.title);
    close.dataset.focusKey = `close:${tab.id}`;
    // ArrowRight from the row primary reaches this sibling without placing
    // every close action into the document's sequential Tab order.
    close.tabIndex = -1;
    close.dataset.noDrag = '';

    primary.addEventListener('focus', () => setRovingPrimary(primary));
    primary.addEventListener('click', () => activateTab(tab));
    primary.addEventListener('auxclick', (event) => {
      if (event.button !== 1) return;
      event.preventDefault();
      closeTabFromRail(tab, false);
    });
    primary.addEventListener('keydown', (event) => primaryKeydown(event, tab, primary, close));
    close.addEventListener('click', (event) => {
      event.stopPropagation();
      closeTabFromRail(tab, event.detail === 0);
    });
    close.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setRovingPrimary(primary);
        primary.focus();
      }
    });

    row.append(primary, close);
    return row;
  }

  // Pinned and loose always render a drop target: an empty one is a hidden
  // zone that CSS reveals only while a drag is active.
  function emptyZone(kind) {
    const zone = document.createElement('div');
    zone.className = 'drag-empty-zone';
    zone.dataset.dragSection = kind;
    zone.setAttribute('aria-hidden', 'true');
    return zone;
  }

  function staticBucket(label, kind, tabs, activeTabId) {
    if (!tabs.length) return emptyZone(kind);
    const section = document.createElement('section');
    section.dataset.dragSection = kind;
    section.className = 'vertical-tabs-section';
    section.setAttribute('role', 'group');
    section.setAttribute('aria-label', label);

    const heading = document.createElement('h2');
    heading.className = 'vertical-tabs-section-heading';
    heading.textContent = label;
    const count = document.createElement('span');
    count.textContent = String(tabs.length);
    heading.appendChild(count);
    section.appendChild(heading);
    for (const tab of tabs) section.appendChild(tabRow(tab, activeTabId));
    return section;
  }

  function groupSection(group, members, activeTabId, index) {
    if (!members.length) return null;
    const section = document.createElement('section');
    section.className = 'vertical-tabs-section vertical-tabs-group';
    section.setAttribute('role', 'group');
    section.dataset.dragSection = 'group';
    section.dataset.groupId = group.id;
    section.dataset.collapsed = String(!!group.collapsed);

    const containsActive = members.some((tab) => tab.id === activeTabId);
    const header = document.createElement('button');
    header.type = 'button';
    header.className =
      'vertical-tabs-group-header' +
      (group.collapsed ? ' collapsed' : '') +
      (containsActive && group.collapsed ? ' contains-active' : '');
    header.dataset.focusKey = `group:${group.id}`;
    header.dataset.dragHeader = '';
    header.dataset.groupId = group.id;
    header.dataset.dragTitle = group.name;
    header.setAttribute('aria-expanded', String(!group.collapsed));
    const groupLabel = {
      name: group.name,
      count: members.length,
      state: group.collapsed ? blancI18n.t('rail.group.collapsed') : blancI18n.t('rail.group.expanded'),
    };
    header.setAttribute(
      'aria-label',
      containsActive
        ? blancI18n.t('rail.group.labelWithCurrent', groupLabel)
        : blancI18n.t('rail.group.label', groupLabel)
    );
    const headerId = `vertical-tabs-group-${index}`;
    header.id = headerId;
    section.setAttribute('aria-labelledby', headerId);

    const caret = document.createElement('span');
    caret.className = 'vertical-tabs-group-caret';
    caret.innerHTML = ICONS.caret;
    caret.setAttribute('aria-hidden', 'true');
    const name = document.createElement('span');
    name.className = 'vertical-tabs-group-name';
    name.textContent = group.name;
    name.dataset.i18nIgnore = ''; // a user-chosen group name
    const count = document.createElement('span');
    count.className = 'vertical-tabs-group-count';
    count.textContent = String(members.length);
    header.append(caret, name, count);
    if (containsActive && group.collapsed) {
      const activeMarker = document.createElement('span');
      activeMarker.className = 'vertical-tabs-group-active';
      activeMarker.title = blancI18n.t('rail.group.containsCurrent');
      activeMarker.setAttribute('aria-hidden', 'true');
      header.appendChild(activeMarker);
    }

    header.addEventListener('click', () => {
      pendingFocusKey = header.dataset.focusKey;
      invoke('toggle group', () => api.toggleGroupCollapsed(group.id));
    });
    header.addEventListener('keydown', (event) => {
      if (event.altKey && event.shiftKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
        event.preventDefault();
        keyboardMove('group', group.id, event.key === 'ArrowUp' ? 'up' : 'down');
        return;
      }
      if (event.key === 'ArrowRight' && group.collapsed) {
        event.preventDefault();
        header.click();
      } else if (event.key === 'ArrowLeft' && !group.collapsed) {
        event.preventDefault();
        header.click();
      } else if (event.key === 'ArrowDown' && !group.collapsed) {
        const first = section.querySelector('.vertical-tab-primary');
        if (first) {
          event.preventDefault();
          setRovingPrimary(first);
          first.focus();
        }
      }
    });
    section.appendChild(header);

    if (!group.collapsed) {
      const pinned = members.filter((tab) => tab.pinned);
      const regular = members.filter((tab) => !tab.pinned);
      for (const tab of pinned) section.appendChild(tabRow(tab, activeTabId));
      for (const tab of regular) section.appendChild(tabRow(tab, activeTabId));
    }
    return section;
  }

  function restoreRovingFocus(payload, focusKey, shouldRestore) {
    const primaries = visiblePrimaryButtons();
    if (!primaries.length) return;
    const requestedPrimary = primaries.find((button) => button.dataset.focusKey === focusKey);
    const activePrimary = primaries.find((button) => button.dataset.tabId === payload.activeTabId);
    setRovingPrimary(requestedPrimary || activePrimary || primaries[0]);

    if (!shouldRestore || !focusKey) return;
    const focusTarget = [...rail.querySelectorAll('[data-focus-key]')]
      .find((element) => element.dataset.focusKey === focusKey);
    if (focusTarget) {
      if (focusTarget.classList.contains('vertical-tab-primary')) setRovingPrimary(focusTarget);
      focusTarget.focus();
    }
  }

  // A drag (or a settling drop) freezes only the list: the newest payload
  // waits here and is rendered exactly once when the drag ends.
  function render(payload = {}) {
    if (drag.isActive()) {
      deferredPayload = payload;
      if (payload.tabLayout !== 'vertical') { drag.cancel(); return; }
      drag.notePayload(payload);
      return;
    }
    renderNow(payload);
  }

  function renderNow(payload = {}) {
    lastPayload = payload;
    const layout = payload.tabLayout === 'vertical' ? 'vertical' : 'island';
    if (!applyWidthMetrics(payload)) {
      // A vertical payload without main's authoritative width is incomplete;
      // fail closed to Island instead of inventing renderer geometry.
      document.documentElement.dataset.tabLayout = 'island';
      rail.hidden = true;
      lastSignature = null;
      return;
    }
    document.documentElement.dataset.tabLayout = layout;
    rail.hidden = layout !== 'vertical';
    rail.dataset.activeTabId = payload.activeTabId || '';
    if (layout !== 'vertical') {
      lastSignature = null;
      return;
    }

    const signature = railSignature(payload);
    if (signature === lastSignature) return;
    lastSignature = signature;

    // A blurred chrome document retains its last activeElement. Never treat
    // that stale element as a restoration request: a later title/favicon/
    // loading broadcast must not pull focus back from page content or an
    // overlay after the explicit handoff has completed.
    const chromeOwnsFocus = document.hasFocus();
    const focusedKey = pendingFocusKey ||
      (chromeOwnsFocus ? focusKeyFor(document.activeElement) : null);
    const shouldRestoreFocus = !suppressFocusRestore && chromeOwnsFocus;
    pendingFocusKey = null;
    const scrollTop = list.scrollTop;
    const tabs = payload.tabs || [];
    const groups = payload.groups || [];
    const activeTabId = payload.activeTabId;
    const knownGroupIds = new Set(groups.map((group) => group.id));
    const fragment = document.createDocumentFragment();

    const standalonePins = tabs.filter((tab) => tab.pinned && (tab.groupId ?? null) === null);
    fragment.appendChild(staticBucket(blancI18n.t('rail.section.pinned'), 'pinned', standalonePins, activeTabId));

    groups.forEach((group, index) => {
      const members = tabs.filter((tab) => tab.groupId === group.id);
      const section = groupSection(group, members, activeTabId, index);
      if (section) fragment.appendChild(section);
    });

    // Invalid orphaned group ids should never escape main's model, but keep
    // their tabs visible if a future migration briefly produces one.
    const looseTabs = tabs.filter((tab) => (
      !tab.pinned &&
      ((tab.groupId ?? null) === null || !knownGroupIds.has(tab.groupId))
    ));
    fragment.appendChild(staticBucket(blancI18n.t('rail.section.tabs'), 'loose', looseTabs, activeTabId));

    list.replaceChildren(fragment);
    list.scrollTop = scrollTop;
    restoreRovingFocus(payload, focusedKey, shouldRestoreFocus);
  }

  const dragApi = window.blancTabDrag;
  let lastPayload = null;
  let deferredPayload = null;

  async function railMove(intent) {
    const message = dragApi.describeMove(lastPayload, intent);
    const focusKey = intent.kind === 'group' ? `group:${intent.id}` : `tab:${intent.id}`;
    pendingFocusKey = focusKey;
    let ok = false;
    try {
      ok = intent.kind === 'group'
        ? await api.reorderGroup(intent.id, intent.beforeGroupId)
        : await api.moveTab(intent.id, { groupId: intent.groupId, beforeId: intent.beforeId });
    } catch (error) {
      console.error('Vertical tabs: move failed', error);
    }
    if (ok === true) {
      announce(message);
    } else {
      // No broadcast will consume the focus intent of a rejected move.
      window.setTimeout(() => {
        if (pendingFocusKey === focusKey) pendingFocusKey = null;
      }, 100);
    }
    return ok === true;
  }

  const drag = dragApi.attach({
    list,
    document,
    window,
    onDrop: railMove,
    announce,
    onActiveChange(active) {
      if (active) return;
      const payload = deferredPayload;
      deferredPayload = null;
      if (payload) renderNow(payload);
    },
  });

  function keyboardMove(kind, id, direction) {
    if (!lastPayload) return;
    const result = kind === 'group'
      ? dragApi.keyboardGroupMove(lastPayload, id, direction)
      : dragApi.keyboardTabMove(lastPayload, id, direction);
    if (!result) return;
    if (result.stop) {
      announce(result.stop === 'top' ? blancI18n.t('rail.move.top') : blancI18n.t('rail.move.bottom'));
      return;
    }
    invoke('move with keyboard', () => railMove(result.intent));
  }

  useIslandButton.addEventListener('click', () => {
    invokeLeavingRail('change tab layout', () => api.setTabLayout('island'));
  });
  newTabButton.addEventListener('click', () => {
    invokeLeavingRail('create tab', () => api.createTab(null, { focusAddress: true }));
  });
  resizeHandle.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    resizeState = {
      pointerId: event.pointerId,
      startWidth: widthMetrics.preferredWidth,
      lastWidth: widthMetrics.width,
    };
    resizeHandle.setPointerCapture(event.pointerId);
    document.documentElement.dataset.verticalTabsResizing = 'true';
  });
  resizeHandle.addEventListener('pointermove', (event) => {
    if (!resizeState || resizeState.pointerId !== event.pointerId) return;
    const width = Math.round(event.clientX);
    resizeState.lastWidth = width;
    queueWidthPreview(width);
  });
  resizeHandle.addEventListener('pointerup', (event) => {
    if (!resizeState || resizeState.pointerId !== event.pointerId) return;
    const width = resizeState.lastWidth;
    resizeState = null;
    clearQueuedWidthPreview();
    delete document.documentElement.dataset.verticalTabsResizing;
    if (resizeHandle.hasPointerCapture(event.pointerId)) {
      resizeHandle.releasePointerCapture(event.pointerId);
    }
    commitWidth(width, (committed) => blancI18n.t('rail.widthAnnounce', { width: committed }));
  });
  resizeHandle.addEventListener('pointercancel', (event) => {
    if (!resizeState || resizeState.pointerId !== event.pointerId) return;
    const startWidth = resizeState.startWidth;
    resizeState = null;
    clearQueuedWidthPreview();
    delete document.documentElement.dataset.verticalTabsResizing;
    api.previewVerticalTabsWidth(startWidth);
  });
  resizeHandle.addEventListener('lostpointercapture', () => {
    if (!resizeState) return;
    const width = resizeState.lastWidth;
    resizeState = null;
    clearQueuedWidthPreview();
    delete document.documentElement.dataset.verticalTabsResizing;
    commitWidth(width, (committed) => blancI18n.t('rail.widthAnnounce', { width: committed }));
  });
  resizeHandle.addEventListener('dblclick', (event) => {
    event.preventDefault();
    commitWidth(
      widthMetrics.defaultWidth,
      (committed) => blancI18n.t('rail.widthReset', { width: committed })
    );
  });
  resizeHandle.addEventListener('keydown', (event) => {
    let nextWidth = null;
    const step = event.shiftKey ? 24 : 8;
    if (event.key === 'ArrowLeft') nextWidth = widthMetrics.width - step;
    if (event.key === 'ArrowRight') nextWidth = widthMetrics.width + step;
    if (event.key === 'Home') nextWidth = widthMetrics.minWidth;
    if (event.key === 'End') nextWidth = widthMetrics.maxWidth;
    if (event.key === 'Enter' || event.key === ' ') {
      nextWidth = widthMetrics.defaultWidth;
    }
    if (nextWidth === null) return;
    event.preventDefault();
    event.stopPropagation();
    commitWidth(nextWidth, (committed) => blancI18n.t('rail.widthAnnounce', { width: committed }));
  });
  rail.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !rail.dataset.activeTabId) return;
    event.preventDefault();
    event.stopPropagation();
    invokeLeavingRail(
      'return focus to active tab',
      () => api.activateTabFromRail(rail.dataset.activeTabId)
    );
  });
  // A rail-originated action hands focus to page/overlay content. Background
  // tab updates stay forbidden from restoring the rail until the user
  // deliberately focuses a rail control again.
  rail.addEventListener('focusin', () => {
    suppressFocusRestore = false;
  });

  api.onVerticalTabsWidth((metrics) => {
    applyWidthMetrics(metrics);
  });
  reducedMotion.addEventListener?.('change', (event) => {
    if (!event.matches) return;
    for (const title of rail.querySelectorAll('.vertical-tab-title.scrolling')) {
      stopTitleScroll(title);
    }
  });

  window.blancVerticalTabs = Object.freeze({ render });
})();
