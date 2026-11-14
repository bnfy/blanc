// Copyright 2026 Bananify Creative. MIT; see LICENSE.
// Blanc for Android's Start Page: the desktop fork's page (chromium/blanc/island/pages, copied to
// android/pages/start/ by tools/android-pages.mjs) on a phone. Loaded first, before the fork's own
// scripts, from chrome://blanc/newtab.html; android-start.css draws the phone layout.
(function () {
  'use strict';
  const root = document.documentElement;
  root.dataset.platform = 'android';
  // The fork's page is a desktop page: without this a phone lays it out 980 px wide.
  const viewport = document.createElement('meta');
  viewport.name = 'viewport';
  viewport.content = 'width=device-width, initial-scale=1, viewport-fit=cover';
  document.head.append(viewport);

  // blanc:// links the fork's adapter doesn't take: the pages Android serves open here, Settings
  // through native code; anything else isn't a page on Android.
  const PAGES = ['bookmarks', 'history', 'mahjong', 'shortcuts'];
  document.addEventListener('click', event => {
    const anchor = event.target?.closest?.('a[href^="blanc:"]');
    if (!anchor || event.defaultPrevented) return;
    const link = /^blanc:\/\/([a-z-]+)\/?([?#].*)?$/.exec(anchor.getAttribute('href'));
    event.preventDefault();
    if (link && PAGES.includes(link[1])) location.assign('/' + link[1] + '.html' + (link[2] || ''));
    else if (link && link[1] === 'settings') window.bowserPages?.start?.openSettings?.('settings').catch(() => {});
  });

  // The Billboard clock's height, for the stylesheet: the line under the clock and the shortcuts
  // sit below it, whatever font and height the clock has.
  function measureClock(row) {
    new ResizeObserver(() => {
      root.style.setProperty('--android-clock-height', row.getBoundingClientRect().height + 'px');
    }).observe(row);
  }

  // The clock's figures at the middle of the screen (#1504). The stylesheet puts the middle of the
  // clock's box at the middle of the page, which starts below the status bar, and a box's middle
  // isn't its figures' middle either. This measures the figures from the clock's font, as CSS lays
  // out its one line, and android-start.css moves the clock by the difference.
  function centerClock(clock) {
    const context = document.createElement('canvas').getContext('2d');
    const editing = document.getElementById('clockPopover');
    function place() {
      // While the clock is edited it sits at the top as its own preview; place it again after.
      if (editing?.matches(':popover-open')) return;
      const style = getComputedStyle(clock);
      context.font = style.fontWeight + ' ' + style.fontSize + ' ' + style.fontFamily;
      const m = context.measureText(clock.textContent);
      // The baseline sits where the font's ascent and descent, centered in the line, put it; the
      // figures reach up and down from there.
      const figures = innerHeight / 2 + (m.fontBoundingBoxAscent - m.fontBoundingBoxDescent) / 2
        + (m.actualBoundingBoxDescent - m.actualBoundingBoxAscent) / 2;
      // A page that starts below the status bar (screen.availTop tall) and fills the screen's
      // height, under the navigation bar or not, centers on the screen; one sharing it (split
      // screen, the keyboard up) on itself.
      const full = innerHeight >= screen.availHeight - 3;
      const middle = full ? screen.height / 2 - screen.availTop : innerHeight / 2;
      let nudge = middle - figures;
      // With shortcuts on show, the clock moves up as far as they need to sit above Customize
      // (owner, November 14: they landed under it), but never under the date.
      const shortcuts = document.getElementById('bbFavorites');
      const footer = document.querySelector('.ledger-footer');
      const header = document.querySelector('.start-header');
      if (shortcuts && !shortcuts.hidden && shortcuts.childElementCount && footer) {
        const boxRect = (clock.closest('.bb-clock-row') || clock).getBoundingClientRect();
        const half = boxRect.height / 2;
        const rows = shortcuts.getBoundingClientRect();
        // How far the shortcuts start below the clock's middle; both move with the clock.
        const below = rows.top - (boxRect.top + half);
        // The clock's middle (in the page) that puts the shortcuts' bottom 16 px above Customize.
        const room = footer.getBoundingClientRect().top - 16 - rows.height - below;
        const floor = (header ? header.getBoundingClientRect().bottom + scrollY : 0) + 8 + half;
        nudge = Math.min(nudge, Math.max(floor, room) - innerHeight / 2);
      }
      root.style.setProperty('--android-clock-nudge', nudge.toFixed(2) + 'px');
    }
    place();
    new MutationObserver(place).observe(clock, {attributes: true, characterData: true, childList: true, subtree: true});
    new ResizeObserver(place).observe(clock);
    editing?.addEventListener('toggle', () => requestAnimationFrame(place));
    const shortcuts = document.getElementById('bbFavorites');
    if (shortcuts) {
      new MutationObserver(place).observe(shortcuts, {attributes: true, attributeFilter: ['hidden'], childList: true});
      new ResizeObserver(place).observe(shortcuts);
    }
    addEventListener('resize', place);
    document.fonts.addEventListener('loadingdone', place);
  }

  // blanc://settings#start-page and the Island menu's Customize Start Page open the Start Page at
  // #customize: Customize is where these choices live.
  function openCustomizeFromAddress() {
    if (location.hash !== '#customize') return;
    history.replaceState(null, '', location.pathname + location.search);
    const popover = document.getElementById('customizePopover');
    // The page wires the popover's state on DOMContentLoaded; open it after that.
    setTimeout(() => { try { popover?.showPopover(); } catch { /* already open */ } }, 0);
  }

  // A long press on a shortcut or a favorite opens its menu, a sheet over the bottom of the screen
  // (owner, November 14: the pin and × buttons were too small to tap). Each entry presses the
  // page's own button, which android-start.css hides from sight but leaves to screen readers, so
  // pinning, unpinning and hiding work exactly as the fork's page does them. The long press is
  // the page's alone: Chromium's own link menu doesn't open.
  const t = (key, params) => window.blancI18n?.t?.(key, params) ?? key;
  function shortcutMenu() {
    let menu = document.getElementById('androidShortcutMenu');
    if (menu) return menu;
    menu = document.createElement('div');
    menu.id = 'androidShortcutMenu';
    menu.className = 'android-shortcut-menu';
    menu.popover = 'auto';
    menu.setAttribute('role', 'menu');
    document.body.append(menu);
    return menu;
  }
  function openShortcutMenu(item) {
    const link = item.querySelector('a[href]');
    if (!link) return false;
    const pin = item.querySelector('.bb-site-pin, .fav-pin');
    const hide = item.querySelector('.bb-site-dismiss');
    const label = item.querySelector('.bb-fav .label, .fav .name');
    const title = (label?.title || label?.textContent || link.textContent || '').trim();
    const entries = [];
    if (pin) {
      entries.push([t(item.classList.contains('pinned') ? 'tabMenu.unpinStartPage' : 'tabMenu.pinStartPage'),
        () => pin.click(), 'pin']);
    }
    if (hide) entries.push([t('newtab.billboard.hideTitle', {title}), () => hide.click(), 'hide']);
    entries.push([t('contextMenu.openLinkInNewTab'), () => window.open(link.href, '_blank', 'noopener'), 'open']);
    const menu = shortcutMenu();
    const heading = document.createElement('div');
    heading.className = 'android-shortcut-menu-title';
    heading.textContent = title;
    heading.dataset.i18nIgnore = '';
    const buttons = entries.map(([text, run, action]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('role', 'menuitem');
      button.dataset.action = action;
      button.textContent = text;
      button.addEventListener('click', () => { menu.hidePopover(); run(); });
      return button;
    });
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'android-shortcut-menu-cancel';
    cancel.dataset.action = 'cancel';
    cancel.textContent = t('common.cancel');
    cancel.addEventListener('click', () => menu.hidePopover());
    menu.replaceChildren(heading, ...buttons, cancel);
    menu.showPopover();
    buttons[0]?.focus({preventScroll: true});
    return true;
  }
  document.addEventListener('contextmenu', event => {
    const item = event.target?.closest?.('#bbFavorites .bb-site, .fav-item');
    if (item && openShortcutMenu(item)) event.preventDefault();
  });

  document.addEventListener('DOMContentLoaded', () => {
    const clock = document.getElementById('bbClock');
    if (clock) {
      measureClock(clock.closest('.bb-clock-row') || clock);
      centerClock(clock);
    }
    openCustomizeFromAddress();
  }, {once: true});
  addEventListener('hashchange', openCustomizeFromAddress);
})();
