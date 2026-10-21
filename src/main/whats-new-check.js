'use strict';

// Whether a release's What's New page exists on blanc.day: the only request
// Blanc makes on its own for that page, before opening it once after a
// feature update (src/main/whats-new.js). A HEAD with no cookies, no referrer
// and no redirects; only a 200 counts, and any failure is a plain "no".
// main passes Electron's net.fetch; tests pass their own.
const DEFAULT_TIMEOUT_MS = 5000;

async function checkWhatsNewPage(url, { fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      redirect: 'error',
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      signal: controller.signal,
    });
    return response?.status === 200;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { checkWhatsNewPage };
