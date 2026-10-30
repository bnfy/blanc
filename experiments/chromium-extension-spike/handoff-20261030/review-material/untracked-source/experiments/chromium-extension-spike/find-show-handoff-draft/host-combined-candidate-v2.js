'use strict';
(() => {
  let nextId = 0;
  let snapshot = null;
  let tabSelection = BlancTabSelection.emptySelection();
  const selectionTabs = () => (snapshot?.tabs ?? []).map(tab => ({ ...tab, splitId: snapshot.splits?.find(split => split.tabIds.includes(tab.id))?.id ?? null }));
  let serialized = '';
  let pillRect = null;
  let opened = false;
  let overlayMode = null;
  let findTabId = null;
  let findShowEpoch = 0;
  let pendingFindShow = null;
  let refreshQueue = Promise.resolve();
  let extensionsOpened = false;
  let geometry = "";
  let blockerRecoveryShown = false;
  let layout = localStorage.getItem('blanc.prototype.tabLayout') === 'vertical' ? 'vertical' : 'island';
  let railWidth = Math.max(200, Math.min(360, Number(localStorage.getItem('blanc.prototype.railWidth')) || 248));
  let closedBefore = localStorage.getItem('blanc.prototype.closedBefore');
  async function applyRail(persist = false) {
    railWidth = await request('rail', [layout === 'vertical', Math.round(railWidth)]);
    strip.style.height = layout === 'vertical' ? '100%' : '68px';
    if (persist) {
      localStorage.setItem('blanc.prototype.tabLayout', layout);
      localStorage.setItem('blanc.prototype.railWidth', String(railWidth));
    }
    await refresh();
    emit('onVerticalTabsWidth', snapshot);
    return railWidth;
  }
  const pending = new Map();
  const subscribers = new Map();
  const overlayShowDocuments = new WeakMap();
  const strip = document.getElementById('strip');
  const overlay = document.getElementById('overlay');
  const tooltip = document.createElement('div');
  tooltip.id = 'prototypeTooltip';
  tooltip.setAttribute('role', 'tooltip');
  tooltip.hidden = true;
  document.body.append(tooltip);

  const snapshotTimeoutMarker = Symbol('snapshot timeout');
  let snapshotRefreshAttempt = 0;
  let lastNotice = null;
  function notice(message, snapshotTimeoutAttempt = null) {
    lastNotice = { message, snapshotTimeoutAttempt };
    const status = document.getElementById('status');
    status.textContent = message;
    status.hidden = false;
    console.warn(message);
  }

  function pruneOverlayShowSubscribers() {
    const current = overlay.contentDocument;
    const listeners = subscribers.get('onOverlayShow');
    for (const callback of listeners ?? []) {
      if (!current || overlayShowDocuments.get(callback) !== current) listeners.delete(callback);
    }
    return listeners;
  }

  function subscribe(event, callback) {
    if (!subscribers.has(event)) subscribers.set(event, new Set());
    if (event === 'onOverlayShow') {
      pruneOverlayShowSubscribers();
      overlayShowDocuments.set(callback, overlay.contentDocument);
    }
    subscribers.get(event).add(callback);
    // The renderer can subscribe after a Find request was opened. Deliver the
    // pending handoff once its handler has finished registering.
    if (event === 'onOverlayShow' && pendingFindShow) {
      const epoch = pendingFindShow.epoch;
      queueMicrotask(() => deliverFindShow(epoch));
    }
    if (event === 'onSplitLayout') queueMicrotask(() => {
      if (subscribers.get(event)?.has(callback)) callback(currentSplitLayout());
    });
    return () => subscribers.get(event)?.delete(callback);
  }

  function emit(event, value) {
    if (event === 'onOverlayShow') pruneOverlayShowSubscribers();
    for (const callback of subscribers.get(event) ?? []) {
      try { callback(value); } catch (error) { notice(error.message); }
    }
  }

  function request(method, args = []) {
    return new Promise((resolve, reject) => {
      const id = String(++nextId);
      const timeout = ['extensionContextMenu', 'closeSplit', 'closeTab'].includes(method) ? null : setTimeout(() => {
        pending.delete(id);
        const error = new Error(`Native bridge timed out: ${method}`);
        if (method === 'snapshot') error[snapshotTimeoutMarker] = true;
        reject(error);
      }, 10000);
      pending.set(id, { resolve, reject, timeout, method });
      chrome.send('blancPrototype', [id, method, args]);
    });
  }

  window.blancPrototypeReply = (id, success, value) => {
    const entry = pending.get(id);
    if (!entry) return;
    pending.delete(id);
    clearTimeout(entry.timeout);
    (success ? entry.resolve : entry.reject)(success ? value : new Error(value));
  };

  function paintHeader() {
    const active = snapshot?.tabs.find(tab => tab.id === snapshot.activeTabId);
    const theme = active?.private ? null : snapshot?.installedTheme;
    for (const doc of [document, strip.contentDocument, overlay.contentDocument])
      window.BlancInstalledTheme.apply(doc, theme);
    const color = active?.private ? '#0a0a0a'
      : theme?.frame ? theme.frame
      : /^#[0-9a-f]{6}$/i.test(active?.pageBg) ? active.pageBg : '';
    document.documentElement.style.setProperty('--page-bg', color);
  }

  let splitHeaderKey = '';
  let dividerDrag = null;
  let paneMenu = null;
  const divider = document.createElement('div');
  divider.id = 'splitDivider'; divider.tabIndex = 0; divider.hidden = true;
  divider.setAttribute('role', 'separator');
  divider.setAttribute('aria-label', 'Resize Split View');
  divider.setAttribute('aria-orientation', 'vertical');
  divider.setAttribute('aria-valuemin', '20'); divider.setAttribute('aria-valuemax', '80');
  divider.append(document.createElement('span'));
  document.body.append(divider);
  function visibleSplit() { return snapshot?.splits?.find(s => s.tabIds.includes(snapshot.activeTabId)); }
  function currentSplitLayout() {
    const split = visibleSplit();
    const geometry = snapshot?.splitGeometry;
    if (!split || !geometry?.frames || geometry.frames.length !== split.tabIds.length) return null;
    const panes = split.tabIds.map((tabId, index) => ({
      tabId,
      frame: { ...geometry.frames[index] },
      focused: tabId === (snapshot.focusedTabId ?? snapshot.activeTabId),
      private: !!snapshot.tabs.find(tab => tab.id === tabId)?.private,
    }));
    const rect = geometry.divider;
    const dividers = geometry.mode === 'columns' && rect?.width > 0 && rect?.height > 0
      ? [{ index: 0, axis: 'x', rect: { ...rect }, saved: true }] : [];
    return { splitId: split.id, panes, dividers };
  }

  let resizeQueue = Promise.resolve();
  function resizeSplit(pair, ratio) {
    ratio = Math.max(.2, Math.min(.8, ratio));
    resizeQueue = resizeQueue.then(async () => {
      if (!await request('resizeSplit', [...pair.map(nativeId), ratio])) throw Error('Split View changed; resize cancelled.');
      await refresh();
    }).catch(e => notice(e.message));
    return resizeQueue;
  }
  divider.addEventListener('pointerdown', event => {
    const split = visibleSplit(); if (event.button !== 0 || !split) return;
    event.preventDefault(); divider.focus();
    dividerDrag = { id: event.pointerId, pair: [...split.tabIds] };
    divider.setPointerCapture(event.pointerId);
  });
  divider.addEventListener('pointermove', event => {
    if (!dividerDrag || event.pointerId !== dividerDrag.id) return;
    const geometry = snapshot?.splitGeometry;
    if (geometry?.mode === 'columns') resizeSplit(dividerDrag.pair, (event.clientX - geometry.originX) / geometry.usableWidth);
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) divider.addEventListener(type, event => {
    if (!dividerDrag || event.pointerId !== dividerDrag.id) return;
    dividerDrag = null;
    if (divider.hasPointerCapture(event.pointerId)) divider.releasePointerCapture(event.pointerId);
  });
  divider.addEventListener('dblclick', () => { const split = visibleSplit(); if (split) resizeSplit(split.tabIds, .5); });
  divider.addEventListener('keydown', event => {
    const split = visibleSplit(); if (!split) return;
    const delta = { ArrowLeft: -1, ArrowRight: 1 }[event.key];
    let ratio = split.layout.widths[0];
    if (delta) ratio += delta * (event.shiftKey ? .05 : .02);
    else if (['Enter', ' '].includes(event.key)) ratio = .5;
    else if (event.key === 'Home') ratio = .2;
    else if (event.key === 'End') ratio = .8;
    else return;
    event.preventDefault(); resizeSplit(split.tabIds, ratio);
  });
  async function dismissPaneMenu(returnFocus = false) {
    if (!paneMenu) return;
    const id = paneMenu.dataset.tabId; paneMenu.remove(); paneMenu = null;
    await request('height', [68]); reportGeometry();
    if (returnFocus) [...document.querySelectorAll(`[data-pane-menu="${id}"]`)].find(button => !button.hidden)?.focus();
  }
  async function openPaneMenu(tab, anchor) {
    const pair = [...(visibleSplit()?.tabIds ?? [])];
    await close(false);
    await dismissPaneMenu();
    const menu = document.createElement('div'); menu.id = 'splitPaneMenu';
    menu.dataset.tabId = tab.id; menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', `Actions for ${tab.title || 'pane'}`);
    const rect = anchor.getBoundingClientRect();
    menu.style.left = `${Math.max(0, Math.min(innerWidth - 240, rect.right - 240))}px`;
    menu.dataset.private = String(tab.private);
    menu.style.top = `${Math.max(68, Math.min(rect.bottom, innerHeight - 220))}px`;
    for (const [label, method] of [
      ['Reload', 'reload'], [tab.muted ? 'Unmute tab' : 'Mute tab', 'toggleMuted'],
      ['Pin tab', 'togglePinned'], ['Remove from Split View', 'removeFromSplit'], ['Close tab', 'closeTab'], ['Close Split View', 'closeSplit'],
    ]) {
      const button = document.createElement('button'); button.textContent = label; button.setAttribute('role', 'menuitem');
      button.addEventListener('click', async () => {
        // Recheck the original visible pair before dispatching a stale menu action.
        await refresh();
        const split = visibleSplit();
        await dismissPaneMenu();
        if (!split || JSON.stringify(split.tabIds) !== JSON.stringify(pair)) return;
        try { await request(method, [nativeId(tab.id)]); await refresh(); } catch (e) { notice(e.message); }
      }); menu.append(button);
    }
    menu.addEventListener('keydown', event => {
      const buttons = [...menu.querySelectorAll('button')];
      if (event.key === 'Escape') { event.preventDefault(); dismissPaneMenu(true); }
      else if (event.key === 'Tab') dismissPaneMenu();
      else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault(); const i = buttons.indexOf(document.activeElement);
        buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 :
          (i + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length].focus();
      }
    });
    paneMenu = menu; document.body.append(menu); await request('height', [Math.ceil(rect.bottom + 220)]); reportGeometry();
    menu.querySelector('button').focus();
  }
  document.addEventListener('pointerdown', event => {
    if (paneMenu && !paneMenu.contains(event.target)) dismissPaneMenu();
  });
  window.addEventListener('blur', () => { if (paneMenu) dismissPaneMenu(); });
  const splitCornerWidths = [240, 240];
  document.fonts.ready.then(() => { splitHeaderKey = ''; refresh(); });
  function paintSplitHeaders() {
    const box = document.getElementById('splitHeaders');
    const split = snapshot?.splits?.find(s => s.tabIds.includes(snapshot.activeTabId));
    const tabs = split?.tabIds.map(id => snapshot.tabs.find(t => t.id === id)) ?? [];
    const geometry = snapshot?.splitGeometry;
    const key = JSON.stringify([split, tabs, snapshot?.activeTabId, layout, railWidth, geometry]);
    divider.hidden = !split || geometry?.mode !== 'columns';
    if (split && geometry?.divider) {
      const r = geometry.divider;
      Object.assign(divider.style, {left:r.x+'px',top:r.y+'px',width:r.width+'px',height:r.height+'px'});
      divider.setAttribute('aria-valuenow', String(Math.round(split.layout.widths[0] * 100)));
      divider.setAttribute('aria-valuetext', `${Math.round(split.layout.widths[0] * 100)} percent saved left pane`);
    }
    if (paneMenu && !split?.tabIds.includes(paneMenu.dataset.tabId)) dismissPaneMenu();
    if (key === splitHeaderKey) return;
    splitHeaderKey = key;
    box.hidden = !split;
    box.dataset.private = String(tabs.some(t => t?.private));
    box.replaceChildren();
    box.dataset.mode = geometry?.mode || '';
    if (!split) return;
    box.style.left = '0';
    const frames = (geometry?.frames || []).filter(r => r.width > 0 && r.height > 0);
    if (frames.length) {
      const left = Math.min(...frames.map(r => r.x)) - 8, top = Math.min(...frames.map(r => r.y)) - 8;
      const right = Math.max(...frames.map(r => r.x + r.width)) + 8;
      const bottom = Math.max(...frames.map(r => r.y + r.height)) + 8;
      const surround = document.createElement('div'); surround.className = 'split-card-surround';
      surround.setAttribute('aria-hidden', 'true');
      Object.assign(surround.style, {left:left+'px',top:top+'px',width:(right-left)+'px',height:(bottom-top)+'px'});
      box.append(surround);
      const gutter = geometry.divider;
      if (gutter?.width && gutter?.height) {
        const gap = document.createElement('div'); gap.className = 'split-card-gap'; gap.setAttribute('aria-hidden', 'true');
        Object.assign(gap.style, {left:gutter.x+'px',top:gutter.y+'px',width:gutter.width+'px',height:gutter.height+'px'});
        box.append(gap);
      }
    }
    for (const [index, tab] of tabs.entries()) {
      const frameRect = geometry?.frames?.[index];
      const r = geometry?.headers?.[index];
      if (!r?.width || !r?.height || !frameRect?.width) continue;
      const active = tab.id === snapshot.activeTabId;
      const frame = document.createElement('div'); frame.className = 'split-pane-frame';
      frame.dataset.active = String(active); frame.setAttribute('aria-hidden', 'true');
      Object.assign(frame.style, {left:frameRect.x+'px',top:frameRect.y+'px',width:frameRect.width+'px',height:frameRect.height+'px'});
      box.append(frame);
      const pane = document.createElement('div'); pane.className = 'split-pane-header';
      Object.assign(pane.style, {left:r.x+'px',top:r.y+'px',width:r.width+'px',height:r.height+'px'});
      pane.dataset.active = String(active);
      for (const edge of ['top', 'left']) {
        const fillet = document.createElement('span'); fillet.className = 'split-corner-fillet '+edge;
        fillet.setAttribute('aria-hidden', 'true'); pane.append(fillet);
      }
      const corner = document.createElement('div'); corner.className = 'split-corner-tab';
      let site = tab.title || tab.url || 'New Tab';
      try { const url = new URL(tab.url); if (['http:', 'https:'].includes(url.protocol)) site = url.host; } catch { /* title fallback */ }
      const focus = document.createElement('button'); focus.className = 'split-pane-title';
      focus.setAttribute('aria-label', `Focus ${tab.title || site}; pane actions with Shift+F10`);
      focus.title = `${tab.title || site} — right-click for pane actions`;
      let icon;
      if (tab.favicon?.startsWith('data:image/')) {
        icon = document.createElement('img'); icon.alt = ''; icon.src = tab.favicon;
      } else {
        icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        icon.setAttribute('viewBox', '0 0 16 16'); icon.setAttribute('aria-hidden', 'true');
        const circle = document.createElementNS(icon.namespaceURI, 'circle');
        for (const [k,v] of Object.entries({cx:8,cy:8,r:6})) circle.setAttribute(k,v);
        const path = document.createElementNS(icon.namespaceURI, 'path');
        path.setAttribute('d', 'M2 8h12M8 2c1.7 1.6 2.5 3.6 2.5 6S9.7 12.4 8 14C6.3 12.4 5.5 10.4 5.5 8S6.3 3.6 8 2z');
        icon.append(circle,path);
      }
      const label = document.createElement('span'); label.textContent = site;
      focus.append(icon, label); focus.hidden = active;
      focus.addEventListener('click', () => request('switchTab', [nativeId(tab.id)]).then(refresh).catch(e => notice(e.message)));
      const closeButton = document.createElement('button'); closeButton.className = 'split-corner-close';
      const closeIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      closeIcon.setAttribute('viewBox', '0 0 16 16'); closeIcon.setAttribute('aria-hidden', 'true');
      const cross = document.createElementNS(closeIcon.namespaceURI, 'path');
      cross.setAttribute('d', 'M4.75 4.75l6.5 6.5M11.25 4.75l-6.5 6.5');
      closeIcon.append(cross); closeButton.append(closeIcon);
      closeButton.setAttribute('aria-label', `Remove ${tab.title || site} from Split View`);
      closeButton.title = 'Remove from Split View';
      closeButton.addEventListener('click', () => request('removeFromSplit', [nativeId(tab.id)]).then(refresh).catch(e => notice(e.message)));
      corner.append(focus, closeButton); pane.append(corner); box.append(pane);
      // Context actions retain the same validated native commands without a toolbar.
      for (const button of [focus, closeButton]) {
        button.dataset.paneMenu = tab.id;
        button.setAttribute('aria-haspopup', 'menu');
        button.addEventListener('keydown', event => {
          if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
            event.preventDefault(); openPaneMenu(tab, button).catch(e => notice(e.message));
          }
        });
      }
      corner.addEventListener('contextmenu', event => {
        event.preventDefault(); openPaneMenu(tab, active ? closeButton : focus).catch(e => notice(e.message));
      });
      pane.classList.add('measuring');
      splitCornerWidths[index] = Math.max(36, Math.min(240, Math.ceil(corner.getBoundingClientRect().width + 7)));
      pane.classList.remove('measuring');
    }
  }

  function pageTint(nativeTabId, color) {
    const id = String(nativeTabId);
    if (snapshot?.activeTabId !== id || (color && !/^#[0-9a-f]{6}$/i.test(color))) return;
    const tab = snapshot.tabs.find(tab => tab.id === id);
    if (!tab || tab.private) return;
    tab.pageBg = color;
    paintHeader();
    if (color) emit('onPageTint', { id, color });
    else emit('onTabsUpdated', snapshot);
  }

  function refresh() {
    // Each caller awaits a snapshot requested after its preceding mutation.
    // Returning early during a polling refresh exposed stale selection state.
    refreshQueue = refreshQueue.then(refreshNow, refreshNow);
    return refreshQueue;
  }

  async function refreshNow() {
    const attempt = ++snapshotRefreshAttempt;
    try {
      snapshot = await request('snapshot');
      const pill = strip.contentDocument?.getElementById('islandPill');
      let recovery = strip.contentDocument?.getElementById('blockerRecovery');
      if (pill && !recovery) {
        recovery = strip.contentDocument.createElement('button');
        recovery.id = 'blockerRecovery';
        recovery.type = 'button';
        recovery.textContent = 'Blocking unavailable';
        recovery.setAttribute('aria-label', 'Blocking unavailable. Open recovery options');
        recovery.style.cssText = 'color:inherit;background:transparent;border:1px solid currentColor;border-radius:6px;padding:4px 8px;font:inherit;white-space:nowrap';
        recovery.addEventListener('click', event => {
          event.stopPropagation();
          request('blockerRecovery').catch(error => notice(error.message));
        });
        recovery.addEventListener('keydown', event => event.stopPropagation());
        pill.append(recovery);
      }
      if (recovery) recovery.hidden = snapshot.blockerHealth !== 'unavailable';
      if (pill && snapshot.blockerHealth === 'unavailable' && !blockerRecoveryShown) {
        blockerRecoveryShown = true;
        // Do not reopen a failed dialog request on every 300ms snapshot.
        // The visible button remains available for an explicit retry.
        request('blockerRecovery').catch(error => notice(error.message));
      }

      // The contract's TabId is an opaque string, and the copied renderers
      // round-trip ids through DOM datasets (drag intents, keyboard moves,
      // context rows), so native integer ids become strings here and go
      // back through nativeId() on every call.
      for (const tab of snapshot.tabs) tab.id = String(tab.id);
      for (const split of snapshot.splits ?? []) {
        split.tabIds = split.tabIds.map(String);
        if (split.focusedTabId != null) split.focusedTabId = String(split.focusedTabId);
      }
      if (snapshot.activeTabId != null) snapshot.activeTabId = String(snapshot.activeTabId);
      for (const key of ['focusedTabId', 'glanceTabId']) {
        if (snapshot[key] != null) snapshot[key] = String(snapshot[key]);
      }
      const enabled = snapshot.adblockEnabled;
      const health = snapshot.blockerHealth;
      const blockerStatus = !enabled ? 'Blanc Blocker is not enabled'
        : health === 'ready' ? 'Blanc Blocker is active'
        : health === 'unavailable' ? 'Blanc Blocker needs attention; requests remain blocked'
        : 'Blanc Blocker is starting; requests are held';
      const t = (key, values) => strip.contentWindow?.blancI18n?.t(key, values) ?? blockerStatus;
      for (const tab of snapshot.tabs) {
        tab.connection = BlancShieldModel.connectionFor({ url: tab.committedUrl, isLoading: tab.isLoading });
        tab.shield = BlancShieldModel.shieldChipState({
          url: tab.url, blockedCount: tab.blockedCount, excepted: tab.adblockExcepted === true,
          adblockEnabled: enabled, t,
        });
        // Native fail-closed health must never look like ready protection.
        if (tab.shield.mode !== 'hidden' && enabled && health !== 'ready') {
          tab.shield = { mode: health === 'unavailable' ? 'off' : 'restarting',
            count: 0, title: blockerStatus };
        }
      }
      const shieldTab = snapshot.tabs.find(tab => tab.id === snapshot.activeTabId);
      const shippingShield = shieldTab ? BlancShieldModel.shieldPopoverModel({
        url: shieldTab.url, blockedCount: shieldTab.blockedCount, excepted: shieldTab.adblockExcepted === true,
        adblockEnabled: enabled, connection: shieldTab.connection, t,
      }) : null;
      snapshot.shieldPopover = shippingShield ? {
        ...shippingShield,
        // Keep the shipping site/global distinction; unhealthy protection has
        // recovery semantics rather than an apparently active site switch.
        variant: shieldTab.isLoading || (enabled && health !== 'ready') ? 'recovery' : shippingShield.variant,
        on: shippingShield.on && health === 'ready', connection: shippingShield.connection,
        countLine: enabled && health !== 'ready' ? blockerStatus : shippingShield.countLine,
        controls: { active: 'blanc', choice: 'blanc', disabled: true, hidden: true,
          restartPending: false, ublockAvailable: false, canOpenUblock: false,
          activeLabel: 'Active', detail: blockerStatus, availability: '',
          scope: shieldTab.private ? 'Private window' : '' },
      } : null;
      tabSelection = BlancTabSelection.pruneSelection(tabSelection, selectionTabs());
      snapshot.selectedTabIds = [...tabSelection.selectedTabIds];
      const items = strip.contentWindow?.TabSections?.itemsOf(snapshot.tabs) ?? [];
      const beforeIndex = items.findIndex(item => item.id === closedBefore);
      snapshot.closedSlot = beforeIndex < 0 ? items.length : beforeIndex;
      strip.contentDocument?.documentElement?.toggleAttribute('data-extensions-page',
        snapshot.tabs.find(t => t.id === snapshot.activeTabId)?.url === 'chrome://extensions/');
      paintHeader();
      paintSplitHeaders();
      const slot = strip.contentDocument?.getElementById('nativeExtensions');
      if (slot) slot.style.width = `${snapshot.extensionsWidth / 1.15}px`;
      reportGeometry();
      const next = JSON.stringify(snapshot);
      if (next !== serialized) {
        serialized = next;
        emit('onTabsUpdated', snapshot);
        emit('onSplitLayout', currentSplitLayout());
      }
      // A newer fully processed snapshot can retire only its own older timeout.
      // Preserve any later unrelated notice and wait while any snapshot is pending.
      const status = document.getElementById('status');
      if (lastNotice?.snapshotTimeoutAttempt != null &&
          lastNotice.snapshotTimeoutAttempt < attempt &&
          ![...pending.values()].some(entry => entry.method === 'snapshot') &&
          !status.hidden && status.textContent === lastNotice.message) {
        status.textContent = '';
        status.hidden = true;
        lastNotice = null;
      }
    } catch (error) {
      notice(error.message, error?.[snapshotTimeoutMarker] ? attempt : null);
    }
  }

  // Shipping chrome-layout.js: 404px view, 380px card, centered on the
  // measured trigger and clamped inside the window. CSS paints the card.
  function positionShield() {
    if (!opened || overlayMode !== 'shield') {
      for (const key of ['left', 'top', 'width', 'height', 'right', 'bottom']) overlay.style[key] = '';
      return;
    }
    const trigger = strip.contentDocument?.getElementById('pillShield');
    const rect = trigger?.getBoundingClientRect();
    const stripRect = strip.getBoundingClientRect();
    const width = Math.min(404, Math.max(0, innerWidth - 24));
    const center = rect ? stripRect.x + rect.x + rect.width / 2 : innerWidth / 2;
    const x = Math.max(12, Math.min(Math.round(center + width / 2) - width, innerWidth - width - 12));
    const y = rect ? Math.ceil(Math.max(0, Math.min(stripRect.y + rect.bottom, 68))) : 68;
    Object.assign(overlay.style, {left: x + 'px', top: y + 'px', right: 'auto', bottom: 'auto',
      width: width + 'px', height: Math.min(580, Math.max(0, innerHeight - y)) + 'px'});
    emit('onShieldAnchor', {x: Math.max(32, Math.min(width - 32, center - x)), connected: !!rect});
  }

  function reportGeometry() {
    positionShield();
    const slot = strip.contentDocument?.getElementById('nativeExtensions');
    const panel = paneMenu ?? (extensionsOpened ? document.getElementById('extensionsPanel')
      : opened ? overlay.contentDocument?.getElementById(overlayMode === 'find' ? 'findBar' : overlayMode === 'shield' ? 'shieldPop' : 'islandPanel')
      : strip.contentDocument?.getElementById('islandPill'));
    if (!slot || !panel) return;
    const a = slot.getBoundingClientRect();
    // The palette scrim owns outside clicks across the whole viewport.
    const b = opened && overlayMode === 'palette'
      ? { x: 0, y: 0, width: innerWidth, height: innerHeight }
      : panel.getBoundingClientRect();
    const overlayRect = opened ? overlay.getBoundingClientRect() : {x: 0, y: 0};
    const offsetY = opened && overlayMode !== 'palette' ? overlayRect.y : 0;
    const offsetX = opened && overlayMode !== 'palette' ? overlayRect.x : 0;
    const values = [a.x, a.y, a.width, a.height, b.x + offsetX, b.y + offsetY, b.width, b.height, ...splitCornerWidths].map(Math.round);
    const next = JSON.stringify(values);
    if (next !== geometry) {
      geometry = next;
      request('geometry', values).catch(error => notice(error.message));
    }
  }

  async function show(prefill, mode = 'panel') {
    invalidateFindShow();
    if (overlayMode === 'find') emit('onOverlayHide', {});
    findTabId = null;
    overlay.dataset.mode = mode;
    tooltip.hidden = true;
    extensionsOpened = false;
    extensionsPanel.hide();
    strip.style.visibility = '';
    await refresh();
    await request('height', [mode === 'palette' ? 10000 : mode === 'shield' ? 648 : 640]);
    overlayMode = mode;
    opened = true;
    overlay.hidden = false;
    emit('onIslandState', { mode });
    requestAnimationFrame(() => {
      emit('onOverlayShow', { mode, prefill, pillRect });
      reportGeometry();
      if (prefill !== undefined) {
        const input = overlay.contentDocument.getElementById('addressInput');
        input.value = prefill;
        input.dispatchEvent(new overlay.contentWindow.Event('input', { bubbles: true }));
      }
      overlay.contentWindow.focus();
    });
  }

  // A backgrounded host can stop receiving animation frames. The timer also
  // attempts the handoff, while a late listener retries it at registration.
  // Epochs prevent a delayed callback from reopening a closed/replaced view.
  function invalidateFindShow() {
    ++findShowEpoch;
    pendingFindShow = null;
  }

  function deliverFindShow(epoch) {
    const pending = pendingFindShow;
    if (!pending || pending.epoch !== epoch || epoch !== findShowEpoch ||
        !opened || overlayMode !== 'find' || findTabId !== pending.tabId ||
        !pruneOverlayShowSubscribers()?.size) return;
    pendingFindShow = null;
    emit('onOverlayShow', { mode: 'find', purpose: { findTabId: pending.tabId } });
    // A callback may synchronously close or replace the overlay.
    if (epoch !== findShowEpoch || !opened || overlayMode !== 'find') return;
    overlay.contentWindow.focus();
    reportGeometry();
  }

  async function openFindBar() {
    invalidateFindShow();
    const epoch = findShowEpoch;
    await refresh();
    if (epoch !== findShowEpoch || !snapshot?.activeTabId) return;
    if (overlayMode !== 'find') emit('onOverlayHide', {});
    extensionsOpened = false;
    extensionsPanel.hide();
    strip.style.visibility = '';
    findTabId = snapshot.focusedTabId ?? snapshot.activeTabId;
    // Find can open before the copied panel renderer applies its theme.
    const findRoot = overlay.contentDocument?.documentElement;
    if (findRoot) {
      if (snapshot.tabs.find(tab => tab.id === findTabId)?.private)
        findRoot.dataset.theme = 'private';
      else delete findRoot.dataset.theme;
    }
    overlayMode = 'find';
    overlay.dataset.mode = 'find';
    await request('height', [228]);
    if (epoch !== findShowEpoch) return;
    opened = true;
    overlay.hidden = false;
    emit('onIslandState', { mode: 'find' });
    pendingFindShow = { epoch, tabId: findTabId };
    requestAnimationFrame(() => deliverFindShow(epoch));
    setTimeout(() => deliverFindShow(epoch), 250);
  }

  async function close(focus = true) {
    invalidateFindShow();
    await dismissPaneMenu();
    tooltip.hidden = true;
    extensionsOpened = false;
    extensionsPanel.hide();
    strip.style.visibility = '';
    emit('onOverlayHide', {});
    emit('onIslandState', { mode: null });
    opened = false;
    overlayMode = null;
    findTabId = null;
    overlay.dataset.mode = '';
    overlay.hidden = true;
    await request('height', [68]);
    // Escape and outside clicks return focus to the page (Electron's
    // hideOverlay does the same); extension activation passes false so the
    // native popup takes focus instead.
    if (focus) await request('focusPage');
    reportGeometry();
  }

  const extensionsPanel = new window.BlancExtensions({
    request, close, refreshGeometry: reportGeometry, back: () => show(),
  });
  async function showExtensions() {
    invalidateFindShow();
    if (extensionsOpened) return close();
    emit('onOverlayHide', {});
    emit('onIslandState', { mode: null });
    opened = false;
    overlayMode = null;
    findTabId = null;
    overlay.dataset.mode = '';
    overlay.hidden = true;
    extensionsOpened = true;
    strip.style.visibility = 'hidden';
    await request('height', [640]);
    await extensionsPanel.show();
    reportGeometry();
  }
  document.addEventListener('pointerdown', event => {
    if (extensionsOpened && !extensionsPanel.contextMenuOpen &&
        !extensionsPanel.panel.contains(event.target)) close();
  });
  window.addEventListener('blur', () => {
    setTimeout(() => { if (extensionsOpened && !extensionsPanel.contextMenuOpen && !document.hasFocus()) close(); }, 0);
  });
  setInterval(() => extensionsPanel.update(), 1000);

  // Native handlers take the integer SessionID; anything else fails their
  // "real tab ID" check instead of matching by accident.
  function nativeId(id) {
    const n = typeof id === 'string' && /^\d+$/.test(id) ? Number(id) : id;
    return Number.isInteger(n) ? n : -1;
  }

  function destination(value) {
    const text = String(value ?? '').trim();
    if (!text) throw new Error('Enter a search or address.');
    if (/^(?:mailto|tel|facetime|sms):/i.test(text)) {
      if (/[\\\x00-\x20\x7f"`]/.test(text)) throw new Error('This address cannot be opened.');
      return { external: text };
    }
    if (/^(?:file:|[\\/]|\.{1,2}[\\/]|~[\\/]|[a-z]:[\\/])/i.test(text))
      throw new Error('Local file addresses are not available yet.');
    if (/^https?:\/\//i.test(text)) return { url: text };
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text))
      throw new Error('This address type is not available yet.');
    if (/^(?:localhost|(?:\d{1,3}\.){3}\d{1,3})(?::\d+)?(?:[/?#]|$)/i.test(text))
      return { url: `http://${text}` };
    if (/^\[[0-9a-f:.%_-]+\](?::\d+)?(?:[/?#]|$)/i.test(text))
      return { url: `http://${text}` };
    if (/^(?:[0-9a-f]*:){2,}[0-9a-f:.%_-]*(?:[/?#]|$)/i.test(text))
      throw new Error('This address type is not available yet.');
    if (/^(?!\.)[^\s./?#:]+(?:\.[^\s./?#:]+)+(?::\d+)?(?:[/?#][^\s]*)?$/u.test(text))
      return { url: `https://${text}` };
    return { query: text };
  }
  async function searchCurrent(id, query, method = 'searchTab') {
    const tab = snapshot?.tabs.find(t => String(t.id) === String(id));
    if (!tab || String(snapshot.activeTabId) !== String(id) ||
        typeof tab.searchDocumentId !== 'string' || typeof tab.committedUrl !== 'string' || typeof snapshot.searchSelectionEpoch !== 'string')
      throw new Error('The page changed before the search could start.');
    return request(method, [nativeId(id), query, tab.searchDocumentId, tab.committedUrl, snapshot.searchSelectionEpoch]);
  }

  const implemented = {
    platform: 'darwin',
    startPinMenuState: id => request('startPinMenuState', [nativeId(id)]),
    toggleStartPin: (id, expectedUrl) => request('toggleStartPin', [nativeId(id), expectedUrl]),
    toggleAdblock: async () => { const tab = snapshot?.tabs.find(t => t.id === snapshot.activeTabId); const value = await request('toggleAdblock', [tab?.committedUrl ?? '']); await refresh(); return value; },
    allowAdsOnActiveSite: async () => { const tab = snapshot?.tabs.find(t => t.id === snapshot.activeTabId); const value = await request('allowAdsOnActiveSite', [tab?.committedUrl ?? '']); await refresh(); return value; },
    openShieldPopover: async () => { await refresh(); if (snapshot.shieldPopover) await show(undefined, 'shield'); },
    setTabLayout: async value => { layout = value === 'vertical' ? 'vertical' : 'island'; await applyRail(true); return layout; },
    setVerticalTabsWidth: async width => { railWidth = Number(width) || 248; return applyRail(true); },
    previewVerticalTabsWidth: async width => { railWidth = Number(width) || 248; return applyRail(); },
    activateTabFromRail: async id => { await request('switchTab', [nativeId(id)]); await request('focusPage'); await refresh(); },
    toggleSiteMute: async id => { const result = await request('toggleSiteMute', [nativeId(id)]); await refresh(); return result; },
    moveClosedSection: async before => { closedBefore = before == null ? null : String(before); localStorage.setItem('blanc.prototype.closedBefore', closedBefore ?? ''); await refresh(); return true; },
    showTooltip: ({ text, anchor, privateTheme }) => {
      if (opened || extensionsOpened || !anchor || !Number.isFinite(anchor.x)) return;
      tooltip.textContent = String(text).slice(0, 180);
      tooltip.hidden = false;
      tooltip.dataset.private = String(privateTheme === true);
      const width = tooltip.getBoundingClientRect().width;
      tooltip.style.left = `${Math.max(4, Math.min(innerWidth - width - 4, anchor.x + anchor.width / 2 - width / 2))}px`;
      tooltip.style.top = `${Math.max(0, Math.min(44, anchor.y + anchor.height + 4))}px`;
    },
    hideTooltip: () => { tooltip.hidden = true; },
    bangs: async () => ({ enabled: false, custom: [], recent: [] }),
    getAllTabs: async () => snapshot ?? request('snapshot'),
    createTab: async (url, options) => {
      if (options?.private) throw new Error('Use Chromium’s native private-window command in this prototype.');
      const target = url ? destination(url) : { url: 'chrome://newtab/' };
      const outcome = target.query ? await searchCurrent(snapshot?.activeTabId, target.query, 'createSearchTab') : target.external ? await searchCurrent(snapshot?.activeTabId, target.external, 'externalTab') : await request('createTab', [target.url]);
      try { await refresh(); } catch {}
      if (options?.focusAddress) { try { await show(''); } catch {} }
      return outcome;
    },
    navigate: async (id, value) => { const target = destination(value); const outcome = target.query ? await searchCurrent(id, target.query) : target.external ? await searchCurrent(id, target.external, 'externalTab') : await searchCurrent(id, target.url, 'navigateTab'); try { await refresh(); } catch {} return outcome; },
    search: async (id, query) => { const outcome = await searchCurrent(id, String(query ?? '').trim()); try { await refresh(); } catch {} return outcome; },
    openPage: async (name, section) => {
      if (name === 'settings' && section === 'blocking') {
        await request('createTab', ['chrome://blanc-prototype/blocking-settings.html']);
        await close(); await refresh(); return;
      }
      // General Settings can use Chromium's native controls while Blanc's
      // product-specific settings are ported. Unsupported sections continue
      // to report an error instead of silently opening the wrong page.
      if (name === 'settings' && (section == null || section === '' || section === 'general')) {
        await request('createTab', ['chrome://settings/']);
        await close(); await refresh(); return;
      }
      // Electron names Favorites `bookmarks` internally; Chromium's manager
      // pages stand in for Blanc's utility sheets in this prototype.
      if (!['downloads', 'extensions', 'bookmarks', 'history'].includes(name)) {
        throw new Error('Use Chromium’s native controls for this page in the prototype.');
      }
      await request('createTab', [`chrome://${name}/`]);
    },
    // Favorites and history are Chromium's own BookmarkModel and
    // HistoryService, shaped like Electron's records; see contract.json.
    // The copied hearts enable on any http(s) page without checking
    // `private`; like Electron's main, a private tab is a silent no-op here
    // (prototype.css also hides them under the private theme). The native
    // guard stays as defense in depth.
    toggleBookmark: async () => {
      const tab = snapshot?.tabs.find(tab => tab.id === snapshot.activeTabId);
      if (!tab || tab.private) return;
      try {
        const result = await request('toggleBookmark', [nativeId(tab.id)]);
        await refresh();
        return result;
      } catch (error) {
        notice(error.message);
        throw error;
      }
    },
    saveFavorite: async (folder) => {
      const tab = snapshot?.tabs.find(tab => tab.id === snapshot.activeTabId);
      if (!tab || tab.private) return;
      try {
        const result = await request('saveFavorite', [nativeId(tab.id), typeof folder === 'string' ? folder : '']);
        await refresh();
        return result;
      } catch (error) {
        notice(error.message);
        throw error;
      }
    },
    // Pin, mute and reorder are TabStripModel operations; the snapshot's
    // pinned/muted/audible fields feed the copied rows and pill unchanged.
    toggleTabPinned: async (id) => {
      const pinned = await request('togglePinned', [nativeId(id)]);
      await refresh();
      return pinned;
    },
    toggleTabMuted: async (id) => {
      const muted = await request('toggleMuted', [nativeId(id)]);
      await refresh();
      return muted;
    },
    moveTab: async (id, target) => {
      // Drag intents carry DOM dataset strings for both tab ids; group ids are
      // Chromium's TabGroupId strings straight from the snapshot.
      const groupId = typeof target?.groupId === 'string' ? target.groupId : null;
      const beforeId = target?.beforeId == null ? null : nativeId(target.beforeId);
      const moved = await request('moveTab', [nativeId(id), groupId, beforeId]);
      await refresh();
      return moved === true;
    },
    // Named groups are Chromium tab groups (TabStripModel), shaped as Blanc's
    // {id, name, collapsed}; names are lowercase labels and colour is unused.
    groupTabByName: async (id, name) => {
      await request('groupTabByName', [nativeId(id), String(name ?? '')]);
      await refresh();
    },
    setTabGroup: async (id, groupId) => {
      await request('setTabGroup', [nativeId(id), typeof groupId === 'string' ? groupId : null]);
      await refresh();
    },
    reorderGroup: async (groupId, beforeGroupId) => {
      const moved = await request('reorderGroup',
        [String(groupId), typeof beforeGroupId === 'string' ? beforeGroupId : null]);
      await refresh();
      return moved === true;
    },
    ...Object.fromEntries(['focusGroup', 'toggleGroupCollapsed', 'closeGroup', 'newTabInGroup', 'ungroupGroup', 'moveGroupToNewWindow'].map((method) =>
      [method, async (groupId) => { await request(method, [String(groupId)]); await refresh(); }])),
    ...Object.fromEntries(['renameGroup', 'setGroupColor'].map(method =>
      [method, async (groupId, value) => {
        const result = await request(method, [String(groupId), value ?? null]);
        await refresh();
        return result;
      }])),
    // Destructive and history-only, like Electron's /clear; main refuses it
    // from a private window. Test on a disposable profile only.
    clearHistory: () => request('clearHistory'),
    listFavorites: () => request('listFavorites'),
    listHistory: (options) => {
      const limit = Number.isInteger(options?.limit) ? options.limit : 300;
      return request('listHistory', [Math.min(300, Math.max(1, limit))]);
    },
    listRemoteTabs: async () => [],
    // Internal migration probes; no user-facing Glance acceptance yet.
    createSplit: async (first, second) => {
      const result = await request('createSplit', [nativeId(first), nativeId(second)]);
      if (!result) throw new Error('These tabs can no longer be split.');
      await close(); await refresh(); return result;
    },
    resizeSplit: async (target, indexOrRatio, axis, point) => {
      // Preserve the existing pair API while accepting the shipping renderer's
      // divider coordinates. Resolve identity against a fresh native snapshot.
      if (Array.isArray(target)) return request('resizeSplit', [...target.map(nativeId), indexOrRatio]);
      await refresh();
      const split = visibleSplit();
      const geometry = snapshot?.splitGeometry;
      if (!split || split.id !== target || split.tabIds.length !== 2 ||
          geometry?.mode !== 'columns' || indexOrRatio !== 0 || axis !== 'x' ||
          !Number.isFinite(point?.x) || !Number.isFinite(point?.y) ||
          !Number.isFinite(geometry.originX) || !(geometry.usableWidth > 0)) return false;
      const ratio = (point.x - geometry.originX) / geometry.usableWidth;
      const result = await request('resizeSplit', [...split.tabIds.map(nativeId), ratio]);
      await refresh();
      return result;
    },
    resetSplit: async (splitId) => {
      await refresh();
      const split = visibleSplit();
      if (!split || split.id !== splitId || split.tabIds.length !== 2 || snapshot.splitGeometry?.mode !== 'columns') return false;
      const result = await request('resizeSplit', [...split.tabIds.map(nativeId), 0.5]);
      await refresh();
      return result;
    },
    removeFromSplit: async id => { await request('removeFromSplit', [nativeId(id)]); await refresh(); },
    previewSplitPair: (main, reference) => request('previewSplitPair', [nativeId(main), nativeId(reference)]),
    selectTab: async (id, mode) => {
      await refresh();
      if (!snapshot) return null;
      const { focusId, ...next } = BlancTabSelection.selectTabs(tabSelection, selectionTabs(), snapshot.groups ?? [], snapshot.activeTabId, id, mode);
      tabSelection = next;
      snapshot.selectedTabIds = [...next.selectedTabIds];
      emit('onTabsUpdated', snapshot);
      return focusId;
    },
    keepGlanceAsSplit: async () => {
      const result = await request('keepGlanceAsSplit');
      await refresh();
      return result;
    },
    previewGlancePair: (main, reference) => request('previewGlancePair', [nativeId(main), nativeId(reference)]),
    previewGlanceClose: id => request('previewGlanceClose', [nativeId(id)]),
    previewPageCommand: command => request('previewPageCommand', [command]),
    previewSpaceRecover: () => request('previewSpaceRecover'),
    previewSpaceSave: name => request('previewSpaceSave', [name]),
    previewSpaceList: () => request('previewSpaceList'),
    previewSpaceOpen: name => request('previewSpaceOpen', [name]),
    listWorkspaces: async () => ({ items: [], tint: 'mark' }),
    searchSuggestions: async () => [],
    openFindBar,
    findInPage: (id, query, options = {}) => request('find',
      [nativeId(id), String(query), options.forward !== false, options.findNext !== false]),
    // Teardown can race navigation/tab closure; never search a replacement tab.
    stopFindInPage: async (id) => {
      emit('onFindResult', { activeMatchOrdinal: 0, matches: 0 });
      return request('stopFind', [nativeId(id)]).catch(() => false);
    },
    openIsland: () => show(),
    openIslandTyping: (character) => show(character),
    openIslandCommands: () => show('/'),
    closeOverlay: close,
    reportIslandRect: (rect) => { pillRect = rect; reportGeometry(); },
    reportChromeLayout: () => {},
    reportPanelDrawn: () => emit('onIslandCovered'),
    // Shared panel cleanup runs even though this prototype has no workspace actions.
    cancelWorkspaceAction: () => {},
    setWorkspaceSwitcherOpen: () => {},
    setOverlayDragState: () => {},
    acknowledgeDownloads: () => {},
  };

  for (const method of ['reopenClosedTab', 'reopenClosedEntry', 'forgetClosedEntry', 'clearClosedEntries']) {
    implemented[method] = async (...args) => {
      const result = await request(method, args.map(String));
      await refresh();
      return result;
    };
  }

  for (const method of ['switchTab', 'closeTab', 'closeSplit', 'goBack', 'goForward', 'reload', 'stop', 'newTabBelow', 'closeAbove', 'closeBelow']) {
    implemented[method] = async (id) => {
      const pageCommand = ['goBack', 'goForward', 'reload', 'stop'].includes(method);
      const routed = pageCommand && String(id) === snapshot?.activeTabId
        ? snapshot.focusedTabId ?? id : id;
      await request(method, [nativeId(routed)]);
      await refresh();
    };
  }

  const api = new Proxy(implemented, {
    get(target, property) {
      if (property in target) return target[property];
      if (String(property).startsWith('on')) return (callback) => subscribe(property, callback);
      return () => {
        const error = new Error(`Prototype does not implement ${String(property)}. Use Chromium’s native controls.`);
        notice(error.message);
        return Promise.reject(error);
      };
    },
  });

  window.BlancPrototypeHost = {
    api,
    notice,
    open: (newTab = false, text = '') => {
      if (!newTab && opened && overlayMode !== 'find') { emit('onOverlayToggle'); return; }
      return show(newTab ? text : undefined, newTab ? 'panel' : 'palette');
    },
    extensions: showExtensions,
    escape: () => opened || extensionsOpened ? close() : undefined,
    refresh,
    pageTint,
    findResult: (id, activeMatchOrdinal, matches, finalUpdate) => {
      if (overlayMode === 'find' && String(id) === findTabId)
        emit('onFindResult', { activeMatchOrdinal, matches, finalUpdate });
    },
    findStep: (forward) => {
      if (overlayMode !== 'find') return openFindBar();
      const query = overlay.contentDocument.getElementById('findInput').value;
      if (query && findTabId) return implemented.findInPage(findTabId, query,
        { forward, findNext: false });
    },
    findReset: () => { if (overlayMode === 'find') close(false); },
  };
  // The strip and overlay adapters read parent.BlancPrototypeHost as they
  // load, so the frames start only once it exists. A src in the markup let a
  // fast relaunch load the overlay first and leave its bridge undefined.
  strip.src = strip.dataset.src;
  overlay.src = overlay.dataset.src;

  window.addEventListener('unhandledrejection', (event) => {
    notice(event.reason?.message ?? String(event.reason));
  });
  window.addEventListener('resize', reportGeometry);
  setInterval(refresh, 300);
  applyRail().catch(error => notice(error.message));
})();
