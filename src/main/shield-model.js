// Pure derivation for the island's shield chip and its site-protection
// popover (design: docs/superpowers/specs/2026-08-07-shield-popover-design.md).
// Main computes these and ships them on tabs:updated; the chrome renderers
// only render. An excepted site outranks the global switch here for the same
// reason it does in resolveBlockAdsCommand: the exception is what the user
// can see and undo from this site.

const { blockableHostname } = require('./adblock-exceptions');

const LOOPBACK_V4 = /^127(?:\.\d{1,3}){3}$/;

function isLoopbackHost(host) {
  const h = String(host ?? '').toLowerCase();
  return h === 'localhost'
    || h.endsWith('.localhost')
    || h === '[::1]'
    || h === '::1'
    || LOOPBACK_V4.test(h);
}

/** Scheme-level connection claim. Pure on the URL: knows nothing about load
 * state. Named for schemes, not security properties — the address is all this
 * can prove, which is why the copy says "Uses HTTPS" and not "Encrypted". */
function connectionState(url) {
  if (typeof url !== 'string' || !url) return null;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol === 'https:') return 'https';
  if (parsed.protocol !== 'http:') return null;
  return isLoopbackHost(parsed.hostname) ? 'local' : 'http';
}

/** The loading gate lives here, one layer above the pure mapping, so every
 * consumer inherits it from a single derivation. An absent claim beats a
 * stale one. */
function connectionFor({ url, isLoading }) {
  return isLoading ? null : connectionState(url);
}

/** The url Chromium has actually committed for a view, or null.
 * A tab is created holding the REQUESTED url, and a stored url can run ahead
 * of a navigation that has not landed — so a scheme claim must be read from
 * here, never from tab.url. Destroyed, unattached, and throwing views all
 * yield null, which renders as no claim at all. Duck-typed so it is testable
 * without Electron. */
function committedUrlOf(view) {
  try {
    const wc = view?.webContents;
    if (!wc || wc.isDestroyed()) return null;
    return wc.getURL() || null;
  } catch {
    return null;
  }
}

/** The active tab's connection, read back out of the ALREADY-SERIALIZED tab
 * list. This is what makes "derived exactly once" true: the popover consumes
 * the payload's own value instead of recomputing it, so the two can never
 * disagree within one broadcast. */
function activeConnection(serializedTabs, activeTabId) {
  if (!Array.isArray(serializedTabs)) return null;
  const entry = serializedTabs.find((t) => t && t.id === activeTabId);
  return entry ? entry.connection ?? null : null;
}

// Blocker names are fixed product names, never translated.
const providerName = (id) => (id === 'ublock-origin' ? 'uBlock Origin' : 'Blanc Blocker');

// Each text-producing function takes `t`, the interface translator.
function shieldChipState({ url, blockedCount, excepted, adblockEnabled, provider = 'blanc', readiness = 'ready', t }) {
  if (provider === 'ublock-origin') {
    if (!blockableHostname(url)) return { mode: 'hidden', count: 0, title: '' };
    // Requests are held while uBO restarts: neither protected nor off.
    if (readiness === 'recovering' && adblockEnabled) return { mode: 'restarting', count: 0, title: t('shield.uboRestarting') };
    if (readiness !== 'ready') return { mode: 'off', count: 0, title: t('shield.chip.uboUnavailable') };
    if (!adblockEnabled) return { mode: 'off', count: 0, title: t('shield.chip.uboOff') };
    const count = blockedCount ?? 0;
    return { mode: count ? 'count' : 'quiet', count, title: t('shield.chip.uboCount', { count }) };
  }
  if (!blockableHostname(url)) return { mode: 'hidden', count: 0, title: '' };
  if (excepted) {
    return { mode: 'off', count: 0, title: t('shield.chip.siteOff') };
  }
  if (!adblockEnabled) {
    return { mode: 'off', count: 0, title: t('shield.chip.globalOff') };
  }
  const blocked = blockedCount ?? 0;
  if (blocked > 0) {
    return {
      mode: 'count',
      count: blocked,
      title: t('shield.chip.count', { count: blocked }),
    };
  }
  return { mode: 'quiet', count: 0, title: t('shield.chip.quiet') };
}

// `connection` arrives already derived (main.js does it once per broadcast) and
// is only carried through. Re-deriving it here would reintroduce the second
// source of truth this design exists to remove.
function shieldPopoverModel({ url, blockedCount, excepted, adblockEnabled, connection = null, provider = 'blanc', readiness = 'ready', t }) {
  const host = blockableHostname(url);
  if (!host) return null;
  if (provider === 'ublock-origin') {
    const blocked = blockedCount ?? 0;
    const countLine = !adblockEnabled ? t('shield.count.globalOff')
      : readiness === 'recovering' ? t('shield.uboRestarting')
        : readiness !== 'ready' ? t('shield.count.needsAttention')
          : t('shield.count.uboRequests', { count: blocked });
    // uBO owns its exceptions. Never infer its site switch from Blanc's list
    // or label a trusted uBO site as protected without querying its popup.
    return { variant: 'ublock', host, on: adblockEnabled, countLine, connection };
  }
  if (readiness === 'failed' || readiness === 'unsupported') {
    return {
      variant: 'recovery', host, on: false, connection,
      countLine: t(adblockEnabled ? 'shield.count.needsAttention' : 'shield.count.globalOff'),
    };
  }
  if (excepted) {
    return { variant: 'site', host, on: false, countLine: t('shield.count.siteOff'), connection };
  }
  if (!adblockEnabled) {
    return { variant: 'global-off', host, on: false, countLine: t('shield.count.globalOff'), connection };
  }
  const blocked = blockedCount ?? 0;
  const countLine = blocked === 0 ? t('shield.count.none') : t('shield.count.blocked', { count: blocked });
  return { variant: 'site', host, on: true, countLine, connection };
}

function shieldProviderModel(status, privateTab, t) {
  const active = privateTab ? 'blanc' : status?.active ?? 'blanc';
  const selected = privateTab ? 'blanc' : status?.selected ?? active;
  let detail = t('shield.provider.active');
  if (privateTab) detail = t(status?.exposed === false ? 'shield.provider.privateProtects' : 'shield.provider.privateNoUbo');
  else {
    const unavailable = status?.phase === 'failed' || status?.phase === 'unsupported';
    const off = status?.enabled === false || status?.phase === 'disabled';
    if (unavailable) detail = t(off ? 'shield.provider.unavailableOff' : 'shield.provider.unavailable', { provider: providerName(active) });
    else if (off) detail = t('shield.provider.off');
    else if (status?.phase === 'recovering') detail = t('shield.uboRestarting');
    else if (status?.phase === 'initializing') detail = t('shield.provider.starting', { provider: providerName(active) });
    // A pending choice never establishes that the current provider is
    // filtering. Preserve failure/disable/startup guidance alongside restart.
    if (status?.fallback) {
      const current = !unavailable && !off && status.phase === 'ready'
        ? t('shield.provider.protecting') : detail;
      const reason = t(status.fallback === 'manifest-v2-retired' ? 'shield.provider.engineNoUbo' : 'shield.provider.buildNoUbo');
      detail = t('shield.provider.fallback', { reason, current });
    }
    if (status?.restartPending) {
      const current = !unavailable && !off && status.phase === 'ready'
        ? t('shield.provider.stillActive', { provider: providerName(active) }) : detail;
      detail = t('shield.provider.restartPending', { selected: providerName(selected), current });
    }
  }
  return {
    active, selected, choice: status?.fallback && !privateTab ? active : selected,
    restartPending: !privateTab && status?.restartPending === true, hidden: status?.exposed === false, disabled: privateTab || !status || status?.exposed === false,
    activeLabel: t(status?.enabled === false ? 'shield.badge.off'
      : privateTab || status?.phase === 'ready' ? 'shield.active'
        : status?.phase === 'initializing' ? 'shield.badge.starting' : 'shield.badge.unavailable'),
    ublockAvailable: !privateTab && status?.supported === true,
    canOpenUblock: active === 'ublock-origin' && status?.phase === 'ready',
    detail,
    availability: !privateTab && status?.exposed !== false && status?.supported === false
      ? status?.fallback ? '' : t('shield.provider.availability') : '',
    scope: privateTab || status?.exposed === false ? '' : `${t('shield.privateNote')}\n${t('shield.provider.ownSettings')}`,
  };
}

module.exports = {
  shieldChipState,
  shieldPopoverModel,
  shieldProviderModel,
  connectionState,
  connectionFor,
  committedUrlOf,
  activeConnection,
};
