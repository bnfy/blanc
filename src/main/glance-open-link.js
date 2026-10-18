'use strict';

// Opening a link into Glance, and the link section of the page's context
// menu. Pure — no Electron — so both are unit-tested; context-menu.js and
// main.js supply the actions and guards.

/** The context menu's items for a link (none for an image or plain text):
 * Open Link in New Tab, Open Link in Glance, Copy Link Address. */
function linkMenuItems(params, actions, t) {
  if (!params?.linkURL) return [];
  const url = params.linkURL;
  return [
    { label: t('contextMenu.openLinkInNewTab'), click: () => actions.openBackgroundTab(url) },
    { label: t('contextMenu.openLinkInGlance'), click: () => actions.openInGlance(url) },
    { label: t('contextMenu.copyLinkAddress'), click: () => actions.copyLink(url) },
  ];
}

/** Open Link in Glance: the same guards as Open Link in New Tab, then an
 * ungrouped tab in the opener's profile and private flag that becomes the
 * reference (replacing the current one while Glance is open). Resolves to
 * whether the tab is in Glance. */
async function openLinkInGlance(opener, url, { handOffToOs, isForbiddenTopLevelUrl, createTab, setGlanceTab }) {
  if (handOffToOs(url)) return false;
  if (isForbiddenTopLevelUrl(url)) return false;
  const id = createTab(url, { private: !!opener.private });
  return (await setGlanceTab(id)) === true;
}

module.exports = { linkMenuItems, openLinkInGlance };
