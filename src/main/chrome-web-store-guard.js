'use strict';

const CHROME_WEB_STORE_HOST = 'chromewebstore.google.com';
const DOCUMENT_RESOURCE_TYPES = new Set(['mainFrame', 'subFrame']);

function isChromeWebStoreUrl(value) {
  if (typeof value !== 'string' || !value) return false;
  try {
    const parsed = new URL(value);
    return (parsed.protocol === 'https:' || parsed.protocol === 'http:')
      && parsed.hostname === CHROME_WEB_STORE_HOST;
  } catch {
    return false;
  }
}

function shouldBlockChromeWebStoreRequest(details) {
  return DOCUMENT_RESOURCE_TYPES.has(details?.resourceType)
    && isChromeWebStoreUrl(details?.url);
}

function chromeWebStoreErrorPageUrl(value, code) {
  if (!isChromeWebStoreUrl(value)) return null;
  const query = new URLSearchParams({
    kind: 'chrome-web-store',
    url: value,
    code: String(code),
  });
  return `blanc://error/?${query}`;
}

/**
 * Own the session's single onBeforeRequest listener. The Web Store crash guard
 * always wins; ordinary requests delegate to the blocker only while it is on.
 */
function createBeforeRequestPolicy({ isBlockingEnabled, isExcepted, blockRequest }) {
  return (details, callback) => {
    if (shouldBlockChromeWebStoreRequest(details)) {
      callback({ cancel: true });
      return;
    }
    if (!isBlockingEnabled() || isExcepted(details)) {
      callback({});
      return;
    }
    blockRequest(details, callback);
  };
}

module.exports = {
  CHROME_WEB_STORE_HOST,
  isChromeWebStoreUrl,
  shouldBlockChromeWebStoreRequest,
  chromeWebStoreErrorPageUrl,
  createBeforeRequestPolicy,
};
