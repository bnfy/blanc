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

function countPhrase(blocked) {
  return `${blocked} ${blocked === 1 ? 'ad or tracker' : 'ads & trackers'}`;
}

function shieldChipState({ url, blockedCount, excepted, adblockEnabled }) {
  if (!blockableHostname(url)) return { mode: 'hidden', count: 0, title: '' };
  if (excepted) {
    return { mode: 'off', count: 0, title: 'Blanc Blocker off for this site — click for site controls' };
  }
  if (!adblockEnabled) {
    return { mode: 'off', count: 0, title: 'Blanc Blocker is off everywhere — click for details' };
  }
  const blocked = blockedCount ?? 0;
  if (blocked > 0) {
    return {
      mode: 'count',
      count: blocked,
      title: `Blanc Blocker — ${countPhrase(blocked)} blocked here — click for site controls`,
    };
  }
  return { mode: 'quiet', count: 0, title: 'Blanc Blocker — protected, nothing blocked yet — click for site controls' };
}

// `connection` arrives already derived (main.js does it once per broadcast) and
// is only carried through. Re-deriving it here would reintroduce the second
// source of truth this design exists to remove.
function shieldPopoverModel({ url, blockedCount, excepted, adblockEnabled, connection = null }) {
  const host = blockableHostname(url);
  if (!host) return null;
  if (excepted) {
    return { variant: 'site', host, on: false, countLine: 'Ads allowed on this site', connection };
  }
  if (!adblockEnabled) {
    return { variant: 'global-off', host, on: false, countLine: 'Ad blocking is off everywhere', connection };
  }
  const blocked = blockedCount ?? 0;
  const countLine = blocked === 0
    ? 'Nothing blocked on this page yet'
    : `${countPhrase(blocked)} blocked on this page`;
  return { variant: 'site', host, on: true, countLine, connection };
}

module.exports = {
  shieldChipState,
  shieldPopoverModel,
  connectionState,
  connectionFor,
  committedUrlOf,
  activeConnection,
};
