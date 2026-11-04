'use strict';
if (location.origin === 'chrome://blanc-prototype' && parent !== window) {
  window.browserAPI = parent.BlancPrototypeHost.api;
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
  const dismissMenu = () => { menu?.remove(); menu = null; };
  document.addEventListener('pointerdown', event => { if (!menu?.contains(event.target)) dismissMenu(); });
  document.addEventListener('keydown', event => {
    if (!menu) return;
    if (event.key === 'Escape') { event.stopImmediatePropagation(); dismissMenu(); }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const buttons = [...menu.querySelectorAll('button')];
      const step = event.key === 'ArrowDown' ? 1 : -1;
      buttons[(buttons.indexOf(document.activeElement) + step + buttons.length) % buttons.length].focus();
    }
  }, true);
  document.addEventListener('contextmenu', async event => {
    const row = event.target.closest('[data-tab-id]');
    if (!row && !event.target.closest('#islandPill')) return;
    if (event.target.closest('input,textarea')) return;
    event.preventDefault();
    const state = await window.browserAPI.getAllTabs();
    const id = row?.dataset.tabId || state.activeTabId;
    const tab = state.tabs.find(item => item.id === id);
    if (!tab) return;
    if (location.pathname.endsWith('/index.html')) {
      await window.browserAPI.openIsland();
      setTimeout(() => {
        const frame = parent.document.getElementById('overlay');
        const target = [...frame.contentDocument.querySelectorAll('[data-tab-id]')].find(el => el.dataset.tabId === id);
        if (target) target.dispatchEvent(new frame.contentWindow.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 100 }));
      }, 100);
      return;
    }
    dismissMenu();
    menu = document.createElement('div');
    menu.className = 'prototype-tab-menu';
    menu.setAttribute('role', 'menu');
    const actions = [
      ['Reload', () => window.browserAPI.reload(id)],
      [tab.pinned ? 'Unpin Tab' : 'Pin Tab', () => window.browserAPI.toggleTabPinned(id)],
      [tab.muted ? 'Unmute Tab' : 'Mute Tab', () => window.browserAPI.toggleTabMuted(id)],
      ['New Tab Below', () => window.browserAPI.newTabBelow(id)],
      ['Close Tabs Above', () => window.browserAPI.closeAbove(id)],
      ['Close Tabs Below', () => window.browserAPI.closeBelow(id)],
      ['Close Tab', () => window.browserAPI.closeTab(id)],
    ];
    if (typeof tab.siteMuted === 'boolean') actions.splice(3, 0, [tab.siteMuted ? 'Unmute Site' : 'Mute Site', () => window.browserAPI.toggleSiteMute(id)]);
    const split = state.splits?.find(s => s.tabIds.includes(id));
    if (split) actions.unshift(['Remove from Split View', () => window.browserAPI.removeFromSplit(id)]);
    else if (!tab.pinned) {
      for (const other of state.tabs.filter(t => t.id !== id && !t.pinned && !state.splits?.some(s => s.tabIds.includes(t.id)))) {
        const groupNote = other.groupId !== tab.groupId ? ' (moves to this tab’s group)' : '';
        actions.push([`Split with ${other.title || other.url}${groupNote}`, () => window.browserAPI.createSplit(id, other.id)]);
      }
    }
    for (const [label, action] of actions) {
      const button = document.createElement('button');
      button.type = 'button'; button.textContent = label; button.setAttribute('role', 'menuitem');
      button.addEventListener('click', () => { dismissMenu(); action().catch(error => parent.BlancPrototypeHost.notice(error.message)); });
      menu.append(button);
    }
    document.body.append(menu);
    menu.style.left = `${Math.max(4, Math.min(innerWidth - menu.offsetWidth - 4, event.clientX))}px`;
    menu.style.top = `${Math.max(4, Math.min(innerHeight - menu.offsetHeight - 4, event.clientY))}px`;
    menu.querySelector('button').focus();
  });
  window.addEventListener('unhandledrejection', (event) => {
    parent.BlancPrototypeHost.notice(event.reason?.message ?? String(event.reason));
  });
}
