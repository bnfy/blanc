'use strict';

function parseInternalDocument(value) {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'blanc:' || parsed.pathname !== '/') return null;
    return parsed;
  } catch {
    return null;
  }
}

/** A pages:* capability belongs to an exact top-level internal document and
 * an exact main-process-owned surface. URL trust alone is insufficient: all
 * blanc:// pages share a scheme and preload, and a compromised page must not
 * inherit another surface's powers. */
function isTrustedPagesEvent(event, { hosts, sessions, ownsSender }) {
  if (!event?.sender || event.senderFrame !== event.sender.mainFrame) return false;
  if (sessions && !sessions.has(event.sender.session)) return false;
  const frameUrl = parseInternalDocument(event.senderFrame?.url);
  const contentsUrl = parseInternalDocument(event.sender.getURL?.());
  if (!frameUrl || !contentsUrl) return false;
  if (frameUrl.host !== contentsUrl.host) return false;
  if (!hosts.has(frameUrl.host)) return false;
  return ownsSender(frameUrl.host, event.sender) === true;
}

module.exports = { parseInternalDocument, isTrustedPagesEvent };
