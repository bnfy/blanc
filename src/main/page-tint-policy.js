'use strict';

// Website tabs use their rendered top edge as the Island strip's faux header.
// The Start Page and Mahjong are the internal surfaces that participate too:
// their Sunrise backdrop is the page itself, rather than utility chrome such
// as Settings or History. Private tabs match only those Sunrise backdrops;
// private websites keep the private theme's own header.
const SUNRISE_PAGES = new Set(['newtab', 'mahjong']);

function shouldSamplePageTint(tab) {
  if (!tab || typeof tab.url !== 'string') return false;

  try {
    const url = new URL(tab.url);
    const sunrisePage = url.protocol === 'blanc:' && SUNRISE_PAGES.has(url.hostname);
    if (tab.private) return sunrisePage;
    return url.protocol === 'http:' || url.protocol === 'https:' || sunrisePage;
  } catch {
    return false;
  }
}

// Marker-only IPC; the renderer never supplies a tint or chooses a target.
function isPageTintSignal(event, { tab, runtime, webContents }) {
  return !!event?.sender?.mainFrame && event.senderFrame === event.sender.mainFrame
    && event.sender === webContents && !!runtime && !runtime.closing
    && runtime.activeTabId === tab?.id && runtime.id === tab?.runtimeId
    && shouldSamplePageTint(tab);
}
module.exports = { shouldSamplePageTint, isPageTintSignal };
