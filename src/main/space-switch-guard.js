'use strict';

// Which pages keep a window from switching space right now (#1140). Pure: no
// require('electron'); main.js passes the live facts in. Switching sets the
// window's pages aside with their renderers intact, so a page only counts
// while setting it aside would break something it is doing at this moment,
// and each one is reported so the person can see which tab it is.

/** At most this many blocking pages cross IPC; the box names fewer. */
const MAX_REPORTED = 20;

/**
 * Why `tab` must stay in its visible window, or null.
 * - capture: a live camera, microphone or screen share.
 * - popup: a pop-up window the page opened is still open.
 * - loading: the page's own document is still loading, or the tab is going
 *   quiet or waking up. Loading inside a frame (ads, chat widgets) never counts.
 * - opener: a page-opened tab still connected to the live page that opened it
 *   (a sign-in hand-off). Once the opener is closed or quiet the link is gone.
 * @param {object} tab
 * @param {{ popupCount(id): number, mainFrameLoading(tab): boolean, openerConnected(tab): boolean }} facts
 */
function blockingReason(tab, facts) {
  if (tab.capturing) return 'capture';
  if (facts.popupCount(tab.id) > 0) return 'popup';
  if (tab.sleeping || tab.waking) return 'loading';
  if (tab.isLoading && facts.mainFrameLoading(tab)) return 'loading';
  if (tab.openerTabId && facts.openerConnected(tab)) return 'opener';
  return null;
}

/** The pages in `tabList` that block a switch, in tab order, each with the
 * label to show and the reason. */
function blockingPages(tabList, facts) {
  const pages = [];
  for (const tab of tabList) {
    const reason = blockingReason(tab, facts);
    if (!reason) continue;
    pages.push({ id: tab.id, title: facts.label(tab), reason });
    if (pages.length === MAX_REPORTED) break;
  }
  return pages;
}

module.exports = { MAX_REPORTED, blockingReason, blockingPages };
