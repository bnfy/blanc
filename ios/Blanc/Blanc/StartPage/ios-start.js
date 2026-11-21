// Copyright 2026 Bananify Creative. MIT; see LICENSE.
// Blanc for iPhone's Start Page: the desktop fork's page (chromium/blanc/android/pages/start, bundled
// as start/ and served at blanc://newtab/ by BlancSchemeHandler), on a phone, as Android's
// android-start.js puts it on one. Loaded first, after ios-start-state.js (window.__blancIosStart),
// before the fork's own scripts; ios-start.css draws the phone layout.
(function () {
  'use strict';
  const root = document.documentElement;
  const state = window.__blancIosStart || {};
  const isPrivatePage = new URLSearchParams(location.search).has('private');
  root.dataset.platform = 'ios';
  // The fork's page is a desktop page: without this a phone lays it out 980 px wide. Added before
  // the first layout, or the page can keep sizes resolved against the wider default (vw units).
  const viewport = document.createElement('meta');
  viewport.name = 'viewport';
  viewport.content = 'width=device-width, initial-scale=1, viewport-fit=cover';
  document.head.append(viewport);

  // Where the Island sits (Settings → Island position). Moving it reloads every Start Page.
  root.dataset.island = state.island === 'top' ? 'top' : 'bottom';

  // The adapter's wallpaper choices (newtab-adapter.js keeps them here, the photo in IndexedDB).
  const KEY = 'blanc.prototype.start.preferences.v1';
  const IMAGES = 'blanc.prototype.wallpaper.v1';
  const read = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
      return saved && typeof saved === 'object' ? saved : null;
    } catch { return null; }
  };
  const write = record => { try { localStorage.setItem(KEY, JSON.stringify(record)); } catch { /* storage refused */ } };
  const send = (kind, value) => window.blancIos?.send?.(kind, value);

  if (isPrivatePage) {
    // A private tab's storage starts empty and is forgotten: it draws the regular Start Page's
    // wallpaper choices, never its photo (the fork shows no photo on a private page).
    try {
      const regular = typeof state.preferences === 'string' ? JSON.parse(state.preferences) : null;
      if (regular && typeof regular === 'object') {
        const wallpaper = { ...(regular.wallpaper || {}) };
        delete wallpaper.imageKey;
        delete wallpaper.image;
        if (wallpaper.source === 'custom') delete wallpaper.source;
        write({ ...regular, wallpaper });
      }
    } catch { /* the fork's defaults */ }
  } else {
    // Native code keeps a copy for private pages: the record as it is now, and every change.
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      setItem.call(this, name, value);
      if (this === localStorage && name === KEY) send('preferences', String(value));
    };
    if (!state.migration) send('preferences', localStorage.getItem(KEY));
  }

  // The first Start Page after the update carries over the choices made on the iPhone's old Start
  // Page (StartAppearanceStore.forkMigration), before the adapter reads them; a photo is stored in
  // the adapter's own image store, as its chooseWallpaper stores one.
  async function storePhoto(address) {
    const response = await fetch(address);
    const blob = await response.blob();
    if (!response.ok || blob.type !== 'image/jpeg') return null;
    const db = await new Promise((resolve, reject) => {
      const open = indexedDB.open(IMAGES, 1);
      open.onupgradeneeded = () => open.result.createObjectStore('images');
      open.onerror = () => reject(open.error);
      open.onsuccess = () => resolve(open.result);
    });
    const id = crypto.randomUUID();
    try {
      await new Promise((resolve, reject) => {
        const transaction = db.transaction('images', 'readwrite');
        transaction.objectStore('images').put(blob, id);
        transaction.oncomplete = resolve;
        transaction.onerror = transaction.onabort = () => reject(transaction.error);
      });
    } finally { db.close(); }
    return id;
  }
  // Every regular Start Page is handed the carry-over until one reports it done; the lock keeps two
  // pages loading together from storing the photo twice.
  const carryOver = migration => navigator.locks.request('blanc.ios.start.migration', () => carryOverOnce(migration));
  async function carryOverOnce(migration) {
    const existing = read();
    if (!existing) write(migration.preferences && typeof migration.preferences === 'object' ? migration.preferences : {});
    if (typeof migration.photo === 'string' && !(existing?.wallpaper?.imageKey)) {
      const id = await storePhoto(migration.photo);
      if (!id) throw new Error('The photo could not be carried over');
      const record = read() || {};
      write({ ...record, wallpaper: { ...(record.wallpaper || {}), source: 'custom', image: null, imageKey: id } });
      // The adapter may have read the record already; it reads it again.
      window.blancNewTabEvent?.('startData');
    }
    send('migrated', true);
  }
  if (state.migration && !isPrivatePage) {
    carryOver(state.migration).catch(error => console.warn('Start Page choices not carried over', error))
      .finally(() => send('preferences', localStorage.getItem(KEY)));
  }

  // blanc://settings links open native Settings; Blanc's other pages load as pages do.
  document.addEventListener('click', event => {
    const anchor = event.target?.closest?.('a[href^="blanc://settings"]');
    if (!anchor || event.defaultPrevented) return;
    event.preventDefault();
    window.bowserPages?.start?.openSettings?.('settings').catch(() => {});
  });

  // The Billboard clock's height before any fitting scale (below), for the stylesheet: the line
  // under the clock and the shortcuts sit below it, whatever font and height the clock has.
  function measureClock(row) {
    new ResizeObserver(() => {
      root.style.setProperty('--ios-clock-height', row.offsetHeight + 'px');
    }).observe(row);
  }

  // The clock's figures at the middle of the screen. The stylesheet puts the middle of the clock's
  // box at the middle of the page, which fills the screen under the status bar and the Island; a
  // box's middle isn't its figures' middle, so this measures the figures from the clock's font, as
  // CSS lays out its one line, and ios-start.css moves the clock by the difference (Android #1504).
  // The Liquid Glass clock is a native view drawn where the page's clock was when it was asked
  // (newtab.js's drawClockArt); it is asked again whenever the clock moves on the page.
  const redrawGlass = () => window.scheduleClockArt?.();
  function centerClock(clock) {
    const context = document.createElement('canvas').getContext('2d');
    const editing = document.getElementById('clockPopover');
    let placed = '';
    function place() {
      // While the clock is edited it sits at the top as its own preview; place it again after.
      if (editing?.matches(':popover-open')) return;
      const style = getComputedStyle(clock);
      context.font = style.fontWeight + ' ' + style.fontSize + ' ' + style.fontFamily;
      const m = context.measureText(clock.textContent);
      const figures = innerHeight / 2 + (m.fontBoundingBoxAscent - m.fontBoundingBoxDescent) / 2
        + (m.actualBoundingBoxDescent - m.actualBoundingBoxAscent) / 2;
      let nudge = innerHeight / 2 - figures, fit = 1;
      // With shortcuts on show, the clock moves up as far as they need to sit above Customize, but
      // never under the date; if that isn't enough, it also shrinks until every row fits.
      const shortcuts = document.getElementById('bbFavorites');
      const blocked = document.getElementById('bbBlocked');
      const footer = document.querySelector('.ledger-footer');
      const header = document.querySelector('.start-header');
      const billboard = shortcuts?.closest('.billboard');
      if (billboard) root.style.setProperty('--ios-billboard-top', (billboard.getBoundingClientRect().top + scrollY) + 'px');
      const shown = element => element && !element.hidden && element.getClientRects().length > 0;
      const below = shown(shortcuts) && shortcuts.childElementCount ? shortcuts
        : shown(blocked) && blocked.textContent.trim() ? blocked : null;
      if (below && footer) {
        const row = clock.closest('.bb-clock-row') || clock;
        const height = row.offsetHeight;
        const drawn = row.getBoundingClientRect();
        const rows = below.getBoundingClientRect();
        const gap = rows.top - drawn.bottom;
        const top = (header ? header.getBoundingClientRect().bottom + scrollY : 0) + 8;
        const bottom = footer.getBoundingClientRect().top - 16 - rows.height - gap;
        fit = Math.max(0.35, Math.min(1, (bottom - top) / height));
        const half = height * fit / 2;
        nudge = Math.min(nudge, Math.max(top + half, bottom - half) - innerHeight / 2);
      }
      root.style.setProperty('--ios-clock-nudge', nudge.toFixed(2) + 'px');
      root.style.setProperty('--ios-clock-fit', fit.toFixed(3));
      const now = nudge.toFixed(2) + ' ' + fit.toFixed(3);
      if (now !== placed) { placed = now; requestAnimationFrame(redrawGlass); }
    }
    place();
    new MutationObserver(place).observe(clock, {attributes: true, characterData: true, childList: true, subtree: true});
    new ResizeObserver(place).observe(clock);
    editing?.addEventListener('toggle', () => requestAnimationFrame(() => { place(); redrawGlass(); }));
    for (const id of ['bbFavorites', 'bbBlocked']) {
      const element = document.getElementById(id);
      if (!element) continue;
      new MutationObserver(place).observe(element, {attributes: true, attributeFilter: ['hidden'], childList: true, characterData: true, subtree: true});
      new ResizeObserver(place).observe(element);
    }
    addEventListener('resize', place);
    document.fonts.addEventListener('loadingdone', place);
    // The clock scrolls with the page; the native glass, over the web view, follows it. Customize
    // covers the clock, so the glass goes while it's open (newtab.js asks for none then) and
    // comes back when it closes.
    addEventListener('scroll', redrawGlass, {passive: true});
    document.getElementById('customizePopover')?.addEventListener('toggle', () => requestAnimationFrame(redrawGlass));
  }

  // The Island menu's Customize Start Page, Settings → Start Page and the hold open the Start Page
  // at #customize: Customize is where these choices live.
  // A finger still down (the hold that asked for Customize) would close it as it lifts, since a
  // light-dismiss popover closes on a pointer released outside it: wait for the lift.
  let touching = 0;
  for (const type of ['touchstart', 'touchend', 'touchcancel']) {
    document.addEventListener(type, event => { touching = event.touches.length; }, {capture: true, passive: true});
  }
  function whenUntouched(run) {
    if (!touching) return setTimeout(run, 0);
    const lifted = () => {
      if (touching) return;
      document.removeEventListener('touchend', lifted);
      document.removeEventListener('touchcancel', lifted);
      setTimeout(run, 0);
    };
    document.addEventListener('touchend', lifted);
    document.addEventListener('touchcancel', lifted);
  }
  function openCustomizeFromAddress() {
    if (location.hash !== '#customize') return;
    history.replaceState(null, '', location.pathname + location.search);
    const popover = document.getElementById('customizePopover');
    // The page wires the popover's state on DOMContentLoaded; open it after that.
    whenUntouched(() => { try { popover?.showPopover(); } catch { /* already open */ } });
  }

  // A long press on a shortcut or a favorite opens iOS's own menu (with its haptic), built natively
  // (TabUIDelegate): it asks this for the tile's state and presses the page's own pin and hide
  // buttons, which ios-start.css hides from sight but leaves to VoiceOver, so pinning and hiding work
  // exactly as the fork's page does them. Sent items aren't shortcuts.
  const ITEMS = '#bbFavorites .bb-site, .fav-item:not(.sent-item)';
  const itemFor = href => [...document.querySelectorAll(ITEMS)].find(item => item.querySelector('a[href]')?.href === href);
  window.blancIosShortcut = {
    state(href) {
      const item = itemFor(href);
      if (!item) return null;
      const link = item.querySelector('a[href]');
      const label = item.querySelector('.bb-fav .label, .fav .name');
      return {
        title: (label?.title || label?.textContent || link.textContent || '').trim(),
        canPin: !!item.querySelector('.bb-site-pin, .fav-pin'),
        pinned: item.classList.contains('pinned'),
        canHide: !!item.querySelector('.bb-site-dismiss'),
      };
    },
    pin: href => itemFor(href)?.querySelector('.bb-site-pin, .fav-pin')?.click(),
    hide: href => itemFor(href)?.querySelector('.bb-site-dismiss')?.click(),
  };

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
