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
    function place() {
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
      root.style.setProperty('--android-clock-nudge', (middle - figures).toFixed(2) + 'px');
    }
    place();
    new MutationObserver(place).observe(clock, {attributes: true, characterData: true, childList: true, subtree: true});
    new ResizeObserver(place).observe(clock);
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
