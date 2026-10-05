'use strict';

// Dark websites: pure policy, no require('electron'). Main owns the IPC and
// the network fetch (dark-websites-fetch.js); dark-reader/build.mjs reads the
// constants below when it generates src/main/dark-websites-preload.js.

const net = require('node:net');

// 1001 is the 1Password fill world (onepassword-policy.js FILL_WORLD_ID).
const DARK_WEBSITES_WORLD_ID = 1002;
const GET_CHANNEL = 'dark-websites:get';
const UPDATE_CHANNEL = 'dark-websites:update';
const FETCH_CHANNEL = 'dark-websites:fetch-css';

const MAX_STYLESHEET_BYTES = 2 * 1024 * 1024;
const MAX_STYLESHEET_URL_LENGTH = 4096;
const STYLESHEET_TIMEOUT_MS = 10_000;
// Per page: Dark Reader fetches each cross-origin stylesheet once.
const MAX_STYLESHEET_FETCHES_PER_MINUTE = 120;
const MAX_CONCURRENT_STYLESHEET_FETCHES = 6;

/** The site key for a URL: http(s) only, lowercased, without a leading www. */
function darkSiteHostname(url) {
  if (typeof url !== 'string' || !url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.hostname.toLowerCase().replace(/^www\./, '') || null;
  } catch {
    return null;
  }
}

/**
 * Whether a page should be darkened.
 * `privateOverrides` holds this run's /dark-site choices made in private tabs;
 * they apply only to private tabs and are never written to settings.
 */
function shouldDarken({ url, enabled, exceptions, systemDark, isPrivate = false, privateOverrides = null }) {
  if (enabled !== true || systemDark !== true) return false;
  const hostname = darkSiteHostname(url);
  if (!hostname) return false;
  if (isPrivate && privateOverrides?.has(hostname)) return privateOverrides.get(hostname) === true;
  return !(Array.isArray(exceptions) && exceptions.includes(hostname));
}

/**
 * "/dark-site": flip whether this site is darkened, ignoring Blanc's current
 * light/dark appearance so the choice holds for the next time Blanc is dark.
 * A private tab's choice stays in memory for this run; turning the feature on
 * globally is the only persistent write a private tab can cause, and it
 * reveals nothing about the site.
 *
 * @returns {null | { hostname: string, darkened: boolean,
 *   settings: object|null, privateOverride: boolean|null }}
 */
function resolveDarkSiteCommand({ url, enabled, exceptions, isPrivate = false, privateOverrides = null }) {
  const hostname = darkSiteHostname(url);
  if (!hostname) return null;
  const list = Array.isArray(exceptions) ? exceptions : [];
  const darkenedNow = shouldDarken({
    url, enabled, exceptions: list, systemDark: true, isPrivate, privateOverrides,
  });
  if (isPrivate) {
    const settings = !darkenedNow && enabled !== true ? { darkWebsites: true } : null;
    return { hostname, darkened: !darkenedNow, settings, privateOverride: !darkenedNow };
  }
  if (darkenedNow) {
    return {
      hostname,
      darkened: false,
      settings: { darkWebsitesExceptions: [...new Set([...list, hostname])] },
      privateOverride: null,
    };
  }
  return {
    hostname,
    darkened: true,
    settings: { darkWebsites: true, darkWebsitesExceptions: list.filter((h) => h !== hostname) },
    privateOverride: null,
  };
}

// Addresses a page must never reach through main's stylesheet fetch.
const BLOCKED_ADDRESSES = (() => {
  const list = new net.BlockList();
  for (const [address, prefix] of [
    ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
    ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
    ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
    ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
  ]) list.addSubnet(address, prefix, 'ipv4');
  for (const [address, prefix] of [
    ['::', 128], ['::1', 128], ['64:ff9b::', 96], ['64:ff9b:1::', 48], ['100::', 64],
    ['2001::', 23], ['2001:db8::', 32], ['2002::', 16], ['fc00::', 7], ['fe80::', 10],
    ['fec0::', 10], ['ff00::', 8],
  ]) list.addSubnet(address, prefix, 'ipv6');
  return list;
})();

/** True only for a globally routable unicast IP address. */
function isPublicAddress(address) {
  if (typeof address !== 'string') return false;
  let value = address.replace(/^\[|\]$/g, '').split('%')[0];
  const mapped = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (mapped) value = mapped[1];
  const family = net.isIP(value);
  if (family === 4) return !BLOCKED_ADDRESSES.check(value, 'ipv4');
  if (family === 6) {
    if (/^::ffff:/i.test(value)) return false;
    return !BLOCKED_ADDRESSES.check(value, 'ipv6');
  }
  return false;
}

const LOCAL_SUFFIXES = ['.localhost', '.local', '.internal', '.intranet', '.lan', '.home', '.corp', '.home.arpa'];

/**
 * Validate a stylesheet URL before any DNS lookup. Returns the parsed URL and
 * whether its host is an IP literal, or null when it must not be fetched.
 */
function parseStylesheetUrl(raw) {
  if (typeof raw !== 'string' || !raw || raw.length > MAX_STYLESHEET_URL_LENGTH) return null;
  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!host) return null;
  const literal = host.replace(/^\[|\]$/g, '');
  if (net.isIP(literal)) return isPublicAddress(literal) ? { url, host: literal, literal: true } : null;
  if (!host.includes('.') || host === 'localhost') return null;
  if (LOCAL_SUFFIXES.some((suffix) => host.endsWith(suffix))) return null;
  return { url, host, literal: false };
}

module.exports = {
  DARK_WEBSITES_WORLD_ID,
  GET_CHANNEL,
  UPDATE_CHANNEL,
  FETCH_CHANNEL,
  MAX_STYLESHEET_BYTES,
  MAX_STYLESHEET_URL_LENGTH,
  STYLESHEET_TIMEOUT_MS,
  MAX_STYLESHEET_FETCHES_PER_MINUTE,
  MAX_CONCURRENT_STYLESHEET_FETCHES,
  darkSiteHostname,
  shouldDarken,
  resolveDarkSiteCommand,
  isPublicAddress,
  parseStylesheetUrl,
};
