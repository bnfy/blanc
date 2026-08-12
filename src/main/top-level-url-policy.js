'use strict';

const FORBIDDEN_TOP_LEVEL_PROTOCOLS = new Set([
  'blanc-chrome:',
  'data:',
  'file:',
  'javascript:',
  'vbscript:',
]);

function parsedUrl(value) {
  if (typeof value !== 'string' || !value) return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function isForbiddenTopLevelUrl(value) {
  const parsed = parsedUrl(value);
  return !!parsed && FORBIDDEN_TOP_LEVEL_PROTOCOLS.has(parsed.protocol.toLowerCase());
}

/** Settings and synced state may select only a web homepage or Blanc's start page. */
function normalizeHomepage(value, fallback = 'blanc://newtab/') {
  if (value === '' || value == null) return '';
  const parsed = parsedUrl(value);
  if (!parsed) return fallback;
  if (parsed.protocol === 'https:' || parsed.protocol === 'http:') return parsed.href;
  if (
    parsed.protocol === 'blanc:'
    && parsed.hostname === 'newtab'
    && parsed.pathname === '/'
    && !parsed.username
    && !parsed.password
  ) return parsed.href;
  return fallback;
}

module.exports = {
  FORBIDDEN_TOP_LEVEL_PROTOCOLS,
  isForbiddenTopLevelUrl,
  normalizeHomepage,
};
