'use strict';
if (location.origin === 'chrome://blanc-prototype' && parent !== window) {
  window.browserAPI = parent.BlancPrototypeHost.apiForDocument(document);
  // The prototype's auxiliary WebView does not receive macOS's native
  // selectAll: edit command. Handle it only for this trusted UI's text fields.
  window.addEventListener('keydown', (event) => {
    // Auxiliary WebViews do not always forward Cocoa menu accelerators.
    if (event.metaKey && event.altKey && !event.ctrlKey && !event.shiftKey && event.code === 'KeyV') {
      event.preventDefault();
      parent.BlancPrototypeHost.toggleTabLayout();
      return;
    }
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
  const localized = (key, fallback, values) => {
    try {
      const value = window.blancI18n?.t?.(key, values);
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
  function appendActions(actions) {
    for (const [label, action, disabled = false, opensList = false, actionId = null, checked = null] of actions) {
      const button = document.createElement('button');
      button.type = 'button'; button.textContent = label; button.disabled = disabled; button.setAttribute('role', 'menuitem');
      if (actionId) button.dataset.action = actionId;
      if (typeof checked === 'boolean') { button.setAttribute('role', 'menuitemradio'); button.setAttribute('aria-checked', String(checked)); }
      if (opensList) button.setAttribute('aria-haspopup', 'menu');
      button.addEventListener('click', () => {
        if (opensList) { action(); return; }
        dismissMenu(); Promise.resolve(action()).catch(error => parent.BlancPrototypeHost.notice(error.message));
      });
      menu.append(button);
    }
  }
  function placeMenu(event) {
    document.body.append(menu);
    menu.style.left = `${Math.max(4, Math.min(innerWidth - menu.offsetWidth - 4, event.clientX))}px`;
    menu.style.top = `${Math.max(4, Math.min(innerHeight - menu.offsetHeight - 4, event.clientY))}px`;
    menu.querySelector('button:not(:disabled)')?.focus();
  }
  async function batchMenu(state, event, requestEpoch) {
    const ids = [...state.selectedTabIds];
    const members = state.tabs.filter(tab => ids.includes(tab.id));
    const [rules, spaces] = await Promise.all([
      window.browserAPI.selectedTabsMenuState(ids), window.browserAPI.listWorkspaces(),
    ]);
    if (requestEpoch !== menuEpoch || !menu) return;
    const run = (action, options) => () => window.browserAPI.runSelectedTabsAction(`batch-${action}`, { ...options, selectedTabIds: ids });
    const item = (action, key, fallback, enabled = true) => [localized(key, fallback), run(action), !enabled, false, `batch-${action}`];
    const pick = entries => () => {
      menu.replaceChildren(); appendActions(entries); placeMenu(event);
    };
    const header = document.createElement('div');
    header.className = 'prototype-tab-menu-header';
    header.textContent = localized('tabsMenu.header', `${ids.length} tabs`, { count: ids.length });
    menu.setAttribute('aria-label', header.textContent); menu.append(header);
    const actions = [];
    if (spaces.items.length) actions.push([localized('tabMenu.moveToSpace', 'Move to Space'), pick([
      ...spaces.items.map(space => [space.name, run('space-move', { workspaceId: space.id }), !rules.canPlace || space.active, false, 'batch-space-move', !!space.active]),
      item('space-new', 'tabMenu.newSpace', 'New Space…', rules.canPlace && spaces.items.length < 25),
    ]), !rules.canPlace, true, 'batch-space']);
    actions.push(item('new-window', 'tabsMenu.newWindow', 'Move Tabs to New Window', rules.canMove));
    actions.push([localized('tabMenu.moveToGroup', 'Move to Group'), pick([
      ...(state.groups ?? []).map(group => [group.name, run('group-move', { groupId: group.id }), !rules.canGroup, false, 'batch-group-move', members.every(tab => tab.groupId === group.id)]),
      ...(members.some(tab => tab.groupId) ? [item('group-none', 'tabMenu.removeFromGroup', 'Remove from Group', rules.canMove)] : []),
      item('group-new', 'tabMenu.newGroup', 'New Group…', rules.canGroup),
    ]), !rules.canMove || (!rules.canGroup && !members.some(tab => tab.groupId)), true, 'batch-group']);
    const pinned = members.every(tab => tab.pinned), muted = members.every(tab => tab.muted);
    actions.push(item('pin', pinned ? 'tabsMenu.unpin' : 'tabsMenu.pin', pinned ? 'Unpin Tabs' : 'Pin Tabs', rules.canMutate),
      item('mute', muted ? 'tabsMenu.unmute' : 'tabsMenu.mute', muted ? 'Unmute Tabs' : 'Mute Tabs', rules.canMutate),
      item('reload', 'tabsMenu.reload', 'Reload Tabs', rules.canReload),
      item('quiet', 'tabsMenu.quiet', 'Quiet Tabs', rules.canQuiet),
      item('copy', 'tabsMenu.copy', 'Copy Links', rules.canCopy),
      item('close', 'tabsMenu.close', 'Close Tabs', false));
    appendActions(actions); placeMenu(event);
  }
  document.addEventListener('contextmenu', async event => {
    const deviceRow = event.target.closest('#islandDrawer [data-device-id]');
    if (deviceRow) {
      event.preventDefault();
      dismissMenu(); menuOrigin = document.activeElement;
      menu = document.createElement('div'); menu.className = 'prototype-tab-menu';
      menu.setAttribute('role', 'menu');
      appendActions([[localized('deviceMenu.rename', 'Rename Device…'),
        () => window.browserAPI.beginRenameDevice(deviceRow.dataset.deviceId)]]);
      placeMenu(event); return;
    }
    const row = event.target.closest('[data-tab-id]');
    if (!row && !event.target.closest('#islandPill')) return;
    if (event.target.closest('input,textarea')) return;
    event.preventDefault();
    const origin = document.activeElement;
    dismissMenu();
    const requestEpoch = menuEpoch;
    const state = await window.browserAPI.getAllTabs();
    if (requestEpoch !== menuEpoch) return;
    const id = event.target.closest('#islandPill') ? state.activeTabId : row?.dataset.tabId || state.activeTabId;
    const tabIndex = state.tabs.findIndex(item => item.id === id);
    if (tabIndex < 0) return;
    const tab = state.tabs[tabIndex];
    const canCloseAbove = state.tabs.slice(0, tabIndex).some(item => !item.pinned);
    const canCloseBelow = state.tabs.slice(tabIndex + 1).some(item => !item.pinned);
    const split = state.splits?.find(s => s.tabIds.includes(id));
    const selectable = !!row?.closest('.vertical-tab-row,.tab-row,.split-row');
    const single = event.blancSingleTabMenu === true || !selectable;
    const selected = (state.selectedTabIds ?? []).includes(id);
    if (split && row?.closest('.vertical-tab-row') && !selected) return;
    const batch = !single && !state.contextMenuSelection && selected && state.selectedTabIds.length > 1;
    if (!single && !selected) await window.browserAPI.prepareTabMenu(id);
    if (location.pathname.endsWith('/index.html')) {
      await window.browserAPI.openIsland();
      if (requestEpoch !== menuEpoch) return;
      setTimeout(() => {
        if (requestEpoch !== menuEpoch) return;
        const frame = parent.document.getElementById('overlay');
        const target = [...frame.contentDocument.querySelectorAll('[data-tab-id]')].find(el => el.dataset.tabId === id);
        if (target) target.dispatchEvent(Object.assign(new frame.contentWindow.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 100 }), { blancSingleTabMenu: single }));
      }, 100);
      return;
    }
    menuOrigin = origin;
    menu = document.createElement('div');
    menu.className = 'prototype-tab-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', tab.title || tab.url || localized('tab.untitled', 'Tab'));
    if (batch) { await batchMenu(state, event, requestEpoch); return; }
    const actions = [
      [localized(tab.bookmarked ? 'tabMenu.removeFavorite' : 'tabMenu.saveFavorite', tab.bookmarked ? 'Remove from Favorites' : 'Save to Favorites'),
       () => window.browserAPI.toggleBookmark(id), tab.private || !/^https?:\/\//.test(tab.url || '')],
      [localized('menu.reload', 'Reload'), () => window.browserAPI.reload(id)],
      [localized('tabMenu.duplicate', 'Duplicate'), () => window.browserAPI.duplicateTab(id)],
      // Shipping's F46 items: only a renamed tab has a page title to go back to.
      [localized('tabMenu.rename', 'Rename Tab…'), () => window.browserAPI.beginRenameTab(id)],
      ...(tab.pageTitle != null ? [[localized('tabMenu.resetTitle', 'Reset Tab Title'), () => window.browserAPI.renameTab(id, '')]] : []),
      [localized(split ? (tab.pinned ? 'tabMenu.unpinSplit' : 'tabMenu.pinSplit') : (tab.pinned ? 'tabMenu.unpin' : 'tabMenu.pin'), split ? (tab.pinned ? 'Unpin Split' : 'Pin Split') : (tab.pinned ? 'Unpin Tab' : 'Pin Tab')), () => window.browserAPI.toggleTabPinned(id)],
      ...(tab.pinned ? [
        [localized('tabMenu.returnPinnedHome', 'Back to Pinned Page'), () => window.browserAPI.returnPinnedHome(id), !tab.pinnedHome?.canReturn],
        [localized('tabMenu.setPinnedHome', 'Use Current Page as Pinned Home'), () => window.browserAPI.setPinnedHome(id), !tab.pinnedHome?.canSet],
      ] : []),
      [localized(tab.muted ? 'tabMenu.unmute' : 'tabMenu.mute', tab.muted ? 'Unmute Tab' : 'Mute Tab'), () => window.browserAPI.toggleTabMuted(id)],
      [localized('tabMenu.newTabBelow', 'New Tab Below'), () => window.browserAPI.newTabBelow(id)],
      [localized('tabMenu.closeAbove', 'Close Tabs Above'), () => window.browserAPI.closeAbove(id), !canCloseAbove],
      [localized('tabMenu.closeBelow', 'Close Tabs Below'), () => window.browserAPI.closeBelow(id), !canCloseBelow],
      [localized('menu.closeTab', 'Close Tab'), () => window.browserAPI.closeTab(id)],
    ];
    if (typeof tab.siteMuted === 'boolean') actions.splice(3, 0, [localized(tab.siteMuted ? 'tabMenu.unmuteSite' : 'tabMenu.muteSite', tab.siteMuted ? 'Unmute Site' : 'Mute Site'), () => window.browserAPI.toggleSiteMute(id)]);
    const groupRules = await window.browserAPI.selectedTabsMenuState([id]);
    if (requestEpoch !== menuEpoch || !menu) return;
    actions.push(
      [localized('tabMenu.newGroup', 'New Group…'), () => window.browserAPI.beginNewGroupForTab(id), !groupRules.canGroup],
      [localized('menu.ungroupTab', 'Ungroup Tab'), () => window.browserAPI.setTabGroup(id, null), !tab.groupId || !groupRules.canMove]);
    if (tab.canSend === true) {
      const targets = await window.browserAPI.listSendTargets().catch(() => []);
      if (requestEpoch !== menuEpoch || !menu) return;
      actions.push([localized('tabMenu.sendToDevice', 'Send to Device'), () => {
        menu.replaceChildren();
        appendActions(targets.length ? targets.map(target => [target.name, async () => {
          const result = await window.browserAPI.sendTabToDevice(id, target.id);
          parent.BlancPrototypeHost.notice(result.status === 'sent'
            ? localized('sends.sent', `Sent to ${target.name}`, {device: target.name})
            : localized(result.status === 'unavailable' ? 'sends.unavailable' : 'sends.failed', 'Could not send this tab.'));
        }]) : [[localized('sends.none', 'No other devices available'), () => {}, true]]);
        placeMenu(event);
      }, false, true]);
    }
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
    // Open in Glance: any other tab of this window, while no split shows.
    if (id !== state.activeTabId && !split && !state.splits?.some(s => s.tabIds.includes(state.activeTabId))) {
      actions.push([localized('tabMenu.glance', 'Open in Glance'), () => window.browserAPI.setGlanceTab(id), id === state.glanceTabId]);
    }
    // A split pane opens in Glance over the pane that stays.
    if (split) actions.push([localized('tabMenu.glance', 'Open in Glance'), async () => {
      const other = split.tabIds.find(tabId => tabId !== id);
      await window.browserAPI.removeFromSplit(id);
      await window.browserAPI.switchTab(other);
      await window.browserAPI.setGlanceTab(id);
    }]);
    // Move to Space ▸ (F41): shown once the profile has a Space, never for a
    // private tab. Every Space is listed, this window's checked; New Space…
    // makes one holding the tab. Native rechecks the move.
    let spaces = null;
    if (!tab.private) { try { spaces = await window.browserAPI.listWorkspaces(); } catch {} }
    if (requestEpoch !== menuEpoch || !menu) return;
    if (spaces?.items?.length) {
      const canMove = state.tabs.length > 1 && !tab.asleep && !tab.audible && !tab.capturing && /^https?:\/\//.test(tab.url || '');
      const canCreate = spaces.items.length < 25;
      const reachable = spaces.items.some(space => !space.active);
      const pickSpace = () => {
        menu.replaceChildren();
        for (const space of spaces.items) {
          const button = document.createElement('button');
          button.type = 'button'; button.setAttribute('role', 'menuitemradio');
          button.setAttribute('aria-checked', String(!!space.active));
          button.dataset.workspaceId = space.id; button.textContent = space.name;
          button.addEventListener('click', () => { dismissMenu();
            if (!space.active) window.browserAPI.moveTabToSpace(id, space.id).catch(error => parent.BlancPrototypeHost.notice(error.message)); });
          menu.append(button);
        }
        menu.append(Object.assign(document.createElement('hr'), { className: 'prototype-tab-menu-separator' }));
        const create = document.createElement('button');
        create.type = 'button'; create.setAttribute('role', 'menuitem'); create.dataset.action = 'space-new';
        create.textContent = localized('tabMenu.newSpace', 'New Space…'); create.disabled = !canCreate;
        create.addEventListener('click', () => { dismissMenu();
          window.browserAPI.beginNewSpaceForTab(id).catch(error => parent.BlancPrototypeHost.notice(error.message)); });
        menu.append(create);
        menu.querySelector('button:not(:disabled)')?.focus();
      };
      actions.push([localized('tabMenu.moveToSpace', 'Move to Space'), pickSpace, !(canMove && (reachable || canCreate)), true]);
    }
    if (split) actions.unshift(
      [localized('tabMenu.removeFromSplit', 'Remove from Split View'), () => window.browserAPI.removeFromSplit(id)],
      [localized('tabMenu.closeSplit', 'Close Split View'), () => window.browserAPI.closeSplit(id)]);
    else {
      // Shipping's Split with ▸ (F53): this tab's own group first, then each
      // other group under a note saying how the group rule moves the pick.
      const free = state.tabs.filter(t => t.id !== id && !t.private === !tab.private && !t.asleep
        && !state.splits?.some(s => s.tabIds.includes(t.id)));
      const ownGroup = state.groups?.find(g => g.id === tab.groupId);
      const sections = [{ tabs: free.filter(t => (t.groupId ?? null) === (tab.groupId ?? null)), header: ownGroup?.name }];
      for (const group of state.groups ?? []) {
        if (group.id === tab.groupId) continue;
        sections.push({ tabs: free.filter(t => t.groupId === group.id), header: ownGroup
          ? window.blancI18n.t('split.menuMovesInto', { group: ownGroup.name })
          : window.blancI18n.t('split.menuMovesOutOf', { group: group.name }) });
      }
      if (ownGroup) sections.push({ tabs: free.filter(t => t.groupId == null),
        header: window.blancI18n.t('split.menuMovesInto', { group: ownGroup.name }) });
      const shown = sections.filter(section => section.tabs.length);
      const pick = () => {
        menu.replaceChildren();
        for (const section of shown) {
          if (section.header) {
            const header = document.createElement('div');
            header.className = 'prototype-tab-menu-header'; header.textContent = section.header;
            menu.append(header);
          }
          for (const other of section.tabs) {
            const button = document.createElement('button');
            button.type = 'button'; button.setAttribute('role', 'menuitem');
            button.dataset.tabId = other.id; button.textContent = other.title || other.url;
            button.addEventListener('click', () => { dismissMenu();
              window.browserAPI.createSplit(id, other.id).catch(error => parent.BlancPrototypeHost.notice(error.message)); });
            menu.append(button);
          }
        }
        menu.querySelector('button')?.focus();
      };
      actions.push([localized('tabMenu.splitWith', 'Split with'), pick, !shown.length, true]);
    }
    appendActions(actions); placeMenu(event);
  });
  window.addEventListener('unhandledrejection', (event) => {
    parent.BlancPrototypeHost.notice(event.reason?.message ?? String(event.reason));
  });
}
