'use strict';
if (location.origin === 'chrome://blanc-prototype' && parent !== window) {
  window.browserAPI = parent.BlancPrototypeHost.apiForDocument(document);
  // The prototype's auxiliary WebView does not receive macOS's native
  // selectAll: edit command. Handle it only for this trusted UI's text fields.
  window.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey
        && event.key.toLowerCase() === 'a'
        && (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)) {
      event.preventDefault();
      event.target.select();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      parent.BlancPrototypeHost.escape();
    }
  });
  // Chromium's auxiliary WebView has no Electron context-menu event. Use a
  // keyboard-accessible chrome menu with actions resolved by native tab ID.
  let menu = null;
  let menuOrigin = null;
  let menuEpoch = 0;
  const localized = (key, fallback) => {
    try {
      const value = window.blancI18n?.t?.(key);
      return typeof value === 'string' && value && value !== key ? value : fallback;
    } catch { return fallback; }
  };
  const dismissMenu = (restoreFocus = false) => {
    ++menuEpoch;
    menu?.remove(); menu = null;
    const origin = menuOrigin; menuOrigin = null;
    if (restoreFocus && origin?.isConnected) origin.focus();
  };
  window.browserAPI.onOverlayHide?.(() => dismissMenu());
  window.addEventListener('pagehide', () => dismissMenu());
  document.addEventListener('pointerdown', event => { if (!menu?.contains(event.target)) dismissMenu(); });
  document.addEventListener('keydown', event => {
    if (!menu) return;
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopImmediatePropagation(); dismissMenu(true);
    }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const buttons = [...menu.querySelectorAll('button:not(:disabled)')];
      if (!buttons.length) return;
      const current = buttons.indexOf(document.activeElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
        : current < 0 ? (event.key === 'ArrowDown' ? 0 : buttons.length - 1)
        : (current + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next].focus();
    }
  }, true);
  document.addEventListener('contextmenu', async event => {
    const row = event.target.closest('[data-tab-id]');
    if (!row && !event.target.closest('#islandPill')) return;
    if (event.target.closest('input,textarea')) return;
    event.preventDefault();
    const origin = document.activeElement;
    dismissMenu();
    const requestEpoch = menuEpoch;
    const state = await window.browserAPI.getAllTabs();
    if (requestEpoch !== menuEpoch) return;
    const id = row?.dataset.tabId || state.activeTabId;
    const tabIndex = state.tabs.findIndex(item => item.id === id);
    if (tabIndex < 0) return;
    const tab = state.tabs[tabIndex];
    const canCloseAbove = state.tabs.slice(0, tabIndex).some(item => !item.pinned);
    const canCloseBelow = state.tabs.slice(tabIndex + 1).some(item => !item.pinned);
    if (location.pathname.endsWith('/index.html')) {
      await window.browserAPI.openIsland();
      if (requestEpoch !== menuEpoch) return;
      setTimeout(() => {
        if (requestEpoch !== menuEpoch) return;
        const frame = parent.document.getElementById('overlay');
        const target = [...frame.contentDocument.querySelectorAll('[data-tab-id]')].find(el => el.dataset.tabId === id);
        if (target) target.dispatchEvent(new frame.contentWindow.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 100 }));
      }, 100);
      return;
    }
    menuOrigin = origin;
    menu = document.createElement('div');
    menu.className = 'prototype-tab-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', tab.title || tab.url || localized('tab.untitled', 'Tab'));
    const link = await window.browserAPI.linkCopyState(id);
    if (requestEpoch !== menuEpoch || !menu) return;
    const split = state.splits?.find(s => s.tabIds.includes(id));
    const actions = [
      [localized('tabMenu.copyLink', 'Copy Link'), () => window.browserAPI.copyTabLink(id, link.url), !link.enabled],
      ...(link.cleaned ? [[localized('menu.copyCleanLink', 'Copy Clean Link'), () => window.browserAPI.copyTabLink(id, link.url, link.cleaned)]] : []),
      [localized(tab.bookmarked ? 'tabMenu.removeFavorite' : 'tabMenu.saveFavorite', tab.bookmarked ? 'Remove from Favorites' : 'Save to Favorites'),
       () => window.browserAPI.toggleBookmark(id), tab.private || !/^https?:\/\//.test(tab.url || '')],
      [localized('menu.reload', 'Reload'), () => window.browserAPI.reload(id)],
      [localized('tabMenu.duplicate', 'Duplicate Tab'), () => window.browserAPI.duplicateTab(id), tab.canDuplicate !== true],
      [localized(split ? (tab.pinned ? 'tabMenu.unpinSplit' : 'tabMenu.pinSplit') : (tab.pinned ? 'tabMenu.unpin' : 'tabMenu.pin'), split ? (tab.pinned ? 'Unpin Split' : 'Pin Split') : (tab.pinned ? 'Unpin Tab' : 'Pin Tab')), () => window.browserAPI.toggleTabPinned(id)],
      [localized(tab.muted ? 'tabMenu.unmute' : 'tabMenu.mute', tab.muted ? 'Unmute Tab' : 'Mute Tab'), () => window.browserAPI.toggleTabMuted(id)],
      [localized('tabMenu.newTabBelow', 'New Tab Below'), () => window.browserAPI.newTabBelow(id)],
      [localized('tabMenu.closeAbove', 'Close Tabs Above'), () => window.browserAPI.closeAbove(id), !canCloseAbove],
      [localized('tabMenu.closeBelow', 'Close Tabs Below'), () => window.browserAPI.closeBelow(id), !canCloseBelow],
      [localized('menu.closeTab', 'Close Tab'), () => window.browserAPI.closeTab(id)],
    ];
    actions.unshift([localized('tabMenu.rename', 'Rename Tab…'),
      () => window.browserAPI.openRenameTab(id)]);
    if (tab.pageTitle != null) actions.splice(1, 0,
      [localized('tabMenu.resetTitle', 'Reset to Page Title'),
       () => window.browserAPI.renameTab(id, '')]);
    if (typeof tab.siteMuted === 'boolean') actions.splice(3, 0, [localized(tab.siteMuted ? 'tabMenu.unmuteSite' : 'tabMenu.muteSite', tab.siteMuted ? 'Unmute Site' : 'Mute Site'), () => window.browserAPI.toggleSiteMute(id)]);
    // Query native state for the targeted tab, not the currently active tab.
    // The native action rechecks the committed URL so a navigated row cannot
    // apply the stale menu to a different page.
    let startPin = null;
    try { startPin = await window.browserAPI.startPinMenuState(id); } catch {}
    if (requestEpoch !== menuEpoch || !menu) return;
    actions.splice(3, 0, [startPin?.pinned
      ? localized('tabMenu.unpinStartPage', 'Unpin from Start Page')
      : localized('tabMenu.pinStartPage', 'Pin to Start Page'), async () => {
      const changed = await window.browserAPI.toggleStartPin(id, startPin.url);
      if (!changed) parent.BlancPrototypeHost.notice('This page could not be changed on the Start Page.');
    }, !startPin?.enabled]);
    if (split) actions.unshift(
      [localized('tabMenu.removeFromSplit', 'Remove from Split View'), () => window.browserAPI.removeFromSplit(id)],
      [localized('tabMenu.closeSplit', 'Close Split View'), () => window.browserAPI.closeSplit(id)]);
    else {
      for (const other of state.tabs.filter(t => t.id !== id && !state.splits?.some(s => s.tabIds.includes(t.id)))) {
        const groupNote = other.groupId !== tab.groupId ? ' (moves to this tab’s group)' : '';
        actions.push([`Split with ${other.title || other.url}${groupNote}`, () => window.browserAPI.createSplit(id, other.id)]);
      }
    }
    if (id !== state.activeTabId) {
      let canQuiet = false;
      try { canQuiet = !tab.asleep && await window.browserAPI.quietEligible(id); } catch {}
      if (requestEpoch !== menuEpoch || !menu) return;
      actions.push([localized('tabMenu.quiet', 'Quiet This Tab Now'), () => window.browserAPI.quietTab(id), !canQuiet]);
    }
    actions.push(['Quiet Tabs settings…', () => window.browserAPI.openPage('settings', 'quiet')]);
    for (const [label, action, disabled = false] of actions) {
      const button = document.createElement('button');
      button.type = 'button'; button.textContent = label; button.disabled = disabled; button.setAttribute('role', 'menuitem');
      button.addEventListener('click', () => { dismissMenu(); action().catch(error => parent.BlancPrototypeHost.notice(error.message)); });
      menu.append(button);
    }
    document.body.append(menu);
    menu.style.left = `${Math.max(4, Math.min(innerWidth - menu.offsetWidth - 4, event.clientX))}px`;
    menu.style.top = `${Math.max(4, Math.min(innerHeight - menu.offsetHeight - 4, event.clientY))}px`;
    menu.querySelector('button:not(:disabled)')?.focus();
  });
  window.addEventListener('unhandledrejection', (event) => {
    parent.BlancPrototypeHost.notice(event.reason?.message ?? String(event.reason));
  });
}
