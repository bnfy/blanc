const COSMETIC_FILTER_CHANNEL = '@ghostery/adblocker/inject-cosmetic-filters';
const MUTATION_OBSERVER_CHANNEL = '@ghostery/adblocker/is-mutation-observer-enabled';

/**
 * The exception-list hostname for a URL, or null when it has none to match.
 * Only http(s) pages have one: exceptions exist to let a *website* serve ads,
 * so a `blanc://`/`devtools://` page must never match the list — otherwise
 * "/allow-ads" on a new tab files a bogus "newtab" exception that then
 * quietly disables cosmetic filtering on the internal pages.
 */
function blockableHostname(url) {
  if (typeof url !== 'string' || !url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.hostname.toLowerCase().replace(/^www\./, '') || null;
  } catch {
    return null;
  }
}

/** blockableHostname for a live tab — the URL the request path matches on. */
function hostnameForWebContents(wc) {
  if (!wc) return null;
  try {
    return blockableHostname(wc.getURL());
  } catch {
    return null;
  }
}

function isWebContentsExcepted(wc, exceptions) {
  const hostname = hostnameForWebContents(wc);
  return !!hostname && exceptions.includes(hostname);
}

/**
 * Decide what "/block-ads" does for the site in front of the user.
 *
 * A per-site exception outranks the global switch — isExcepted short-circuits
 * both the webRequest wrappers and the cosmetic handlers before the engine
 * ever runs — so on an excepted site, flipping `adblockEnabled` cannot change
 * anything the user can see. Left as a bare global toggle the command reads as
 * broken there (nothing happens on the page) while silently disabling blocking
 * on every *other* site. So on an excepted site "/block-ads" lifts that
 * exception instead: the true inverse of "/allow-ads". Blocking is switched on
 * alongside, since dropping the exception while the global switch is off would
 * be the same invisible no-op in a different disguise — the user typed "block
 * ads", so ads end up blocked here either way.
 *
 * Anywhere else it keeps its documented meaning: toggle blocking globally.
 *
 * @param {{hostname: string|null, exceptions: string[], enabled: boolean}} state
 * @returns {{action: 'unexcept'|'toggle', hostname: string|null,
 *            enabled: boolean, exceptions: string[]}}
 */
function resolveBlockAdsCommand({ hostname, exceptions, enabled }) {
  const list = Array.isArray(exceptions) ? exceptions : [];
  if (hostname && list.includes(hostname)) {
    return {
      action: 'unexcept',
      hostname,
      enabled: true,
      exceptions: list.filter((h) => h !== hostname),
    };
  }
  return { action: 'toggle', hostname: null, enabled: !enabled, exceptions: list };
}

/**
 * Ghostery's cosmetic filtering uses process-global IPC handlers rather than
 * Electron's webRequest API. Replace the handlers installed by
 * enableBlockingInSession so a per-site exception covers cosmetic CSS and
 * scriptlets as well as network requests.
 */
function installCosmeticExceptionHandlers(ipcMain, blocker, isExcepted) {
  ipcMain.removeHandler(COSMETIC_FILTER_CHANNEL);
  ipcMain.removeHandler(MUTATION_OBSERVER_CHANNEL);

  ipcMain.handle(COSMETIC_FILTER_CHANNEL, (event, url, msg) => {
    if (isExcepted(event.sender)) return undefined;
    return blocker.onInjectCosmeticFilters(event, url, msg);
  });
  ipcMain.handle(MUTATION_OBSERVER_CHANNEL, (event) => {
    if (isExcepted(event.sender)) return false;
    return blocker.onIsMutationObserverEnabled(event);
  });
}

module.exports = {
  COSMETIC_FILTER_CHANNEL,
  MUTATION_OBSERVER_CHANNEL,
  blockableHostname,
  hostnameForWebContents,
  isWebContentsExcepted,
  resolveBlockAdsCommand,
  installCosmeticExceptionHandlers,
};
