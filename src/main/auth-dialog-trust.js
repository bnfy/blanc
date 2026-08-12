'use strict';

function isTrustedAuthEvent(event, dialogContents, id) {
  if (
    !event?.sender ||
    event.sender !== dialogContents ||
    event.senderFrame !== dialogContents?.mainFrame
  ) return false;
  let frameUrl;
  let contentsUrl;
  try {
    frameUrl = new URL(event.senderFrame.url);
    contentsUrl = new URL(dialogContents.getURL());
  } catch {
    return false;
  }
  for (const parsed of [frameUrl, contentsUrl]) {
    if (
      parsed.protocol !== 'blanc:' ||
      parsed.host !== 'auth' ||
      parsed.pathname !== '/' ||
      parsed.searchParams.get('id') !== String(id)
    ) return false;
  }
  return true;
}

module.exports = { isTrustedAuthEvent };
