'use strict';

// F60 link routing (spec docs/superpowers/specs/2026-10-26-link-routing-design.md):
// an ordered list of rules that send a link another app hands Blanc to a
// profile, optionally a Space, optionally as a private tab. Pure: no Electron,
// no settings store. main.js decides which profiles and Spaces are live.
//
// A rule is { id, match: { kind, value }, destination: { profileId, spaceId,
// private } }. `domain` compares the URL's parsed host, so the userinfo in
// https://work.example.com@evil.test/ never counts; `contains` is a
// case-insensitive substring of the whole URL as it was handed over.

const { validProfileId } = require('./local-profile-model');
const { validWorkspaceId } = require('./session-workspace');

const MAX_LINK_ROUTES = 50;
const MAX_LINK_ROUTE_VALUE = 200;
const LINK_ROUTE_KINDS = ['domain', 'contains'];

const SCHEME_RE = /^[a-z][a-z0-9+.-]*:\/\//i;
// A bare host has none of these; a URL with a scheme is reduced to its host.
const NOT_BARE_HOST_RE = /[\s/\\:@?#*%[\]]/;
const IPV4_RE = /^\d{1,3}(?:\.\d{1,3}){3}$/;
// Control characters never belong in a contains value.
const hasControlCharacter = (text) => [...text].some((ch) => ch.charCodeAt(0) < 0x20 || ch.charCodeAt(0) === 0x7f);

const validRouteId = (value) => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(value);
const isIpHost = (host) => IPV4_RE.test(host) || host.startsWith('[');

/** A parsed host in the form rules compare: ASCII (punycode), lowercase, no
 * trailing dot. null for anything that isn't an http(s) URL with a host. */
function urlHost(url) {
  let parsed;
  try { parsed = new URL(String(url)); } catch { return null; }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  const host = parsed.hostname.toLowerCase().replace(/\.$/, '');
  return host || null;
}

/** The Settings field's value as a rule host. A pasted URL keeps just its
 * host (`fromUrl` lets the field say so); a leading `www.` is dropped so what
 * the address bar shows works. Returns { ok, value, fromUrl } or { ok: false,
 * error } with error 'empty', 'too-long' or 'invalid'. */
function normalizeDomain(input) {
  const text = typeof input === 'string' ? input.trim() : '';
  if (!text) return { ok: false, error: 'empty' };
  if (text.length > MAX_LINK_ROUTE_VALUE) return { ok: false, error: 'too-long' };
  const fromUrl = SCHEME_RE.test(text);
  let host;
  if (fromUrl) {
    host = urlHost(text);
  } else {
    if (NOT_BARE_HOST_RE.test(text)) return { ok: false, error: 'invalid' };
    host = urlHost(`http://${text}/`);
  }
  if (!host || host.includes('..') || host.startsWith('.')) return { ok: false, error: 'invalid' };
  if (!isIpHost(host) && host.startsWith('www.') && host.slice(4).includes('.')) host = host.slice(4);
  if (host.length > MAX_LINK_ROUTE_VALUE) return { ok: false, error: 'too-long' };
  return { ok: true, value: host, fromUrl };
}

/** A contains value: trimmed, 1–200 characters, no control characters. */
function normalizeContains(input) {
  const text = typeof input === 'string' ? input.trim() : '';
  if (!text) return { ok: false, error: 'empty' };
  if (text.length > MAX_LINK_ROUTE_VALUE) return { ok: false, error: 'too-long' };
  if (hasControlCharacter(text)) return { ok: false, error: 'invalid' };
  return { ok: true, value: text };
}

function normalizeRoute(raw) {
  if (!raw || typeof raw !== 'object' || !validRouteId(raw.id)) return null;
  const kind = raw.match?.kind;
  if (!LINK_ROUTE_KINDS.includes(kind)) return null;
  const value = kind === 'domain' ? normalizeDomain(raw.match.value) : normalizeContains(raw.match.value);
  if (!value.ok) return null;
  const destination = raw.destination;
  if (!destination || typeof destination !== 'object' || !validProfileId(destination.profileId)) return null;
  const spaceId = destination.spaceId ?? null;
  if (spaceId !== null && !validWorkspaceId(spaceId)) return null;
  if (destination.private !== undefined && typeof destination.private !== 'boolean') return null;
  return {
    id: raw.id,
    match: { kind, value: value.value },
    destination: { profileId: destination.profileId, spaceId, private: destination.private === true },
  };
}

/** Read-side repair: drops malformed entries and repeated ids, keeps order
 * and ids, caps at MAX_LINK_ROUTES. Never throws. */
function normalizeLinkRoutes(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const entry of raw) {
    if (out.length >= MAX_LINK_ROUTES) break;
    const route = normalizeRoute(entry);
    if (!route || seen.has(route.id)) continue;
    seen.add(route.id);
    out.push(route);
  }
  return out;
}

/** Write-side validation of the whole list: every entry must be a rule and
 * the list must fit, or nothing is stored. Values come back normalized. */
function validateLinkRoutes(raw) {
  if (!Array.isArray(raw)) return { ok: false, error: 'invalid' };
  if (raw.length > MAX_LINK_ROUTES) return { ok: false, error: 'too-many' };
  const routes = [];
  const seen = new Set();
  for (let index = 0; index < raw.length; index += 1) {
    const route = normalizeRoute(raw[index]);
    if (!route || seen.has(route.id)) return { ok: false, error: 'invalid', index };
    seen.add(route.id);
    routes.push(route);
  }
  return { ok: true, routes };
}

function matchesRoute(route, url, host) {
  const { kind, value } = route.match;
  if (kind === 'contains') return String(url).toLowerCase().includes(value.toLowerCase());
  if (!host) return false;
  // IP addresses match only exactly: 10.0.0.4 is not a "subdomain" of 0.4.
  if (isIpHost(value) || isIpHost(host)) return host === value;
  return host === value || host.endsWith(`.${value}`);
}

/** 'ok', 'profile-deleted' or 'space-deleted': whether a rule can route now.
 * A deleted target is skipped, never repointed. */
function linkRouteTargetState(route, { isLiveProfile = () => true, isLiveSpace = () => true } = {}) {
  const { profileId, spaceId } = route.destination;
  if (!isLiveProfile(profileId)) return 'profile-deleted';
  if (spaceId && !isLiveSpace(profileId, spaceId)) return 'space-deleted';
  return 'ok';
}

/** The first rule that matches `url` and whose target still exists, or null.
 * A rule whose profile or Space is gone falls through to the next one. */
function matchLinkRoute(routes, url, liveness = {}) {
  if (typeof url !== 'string' || !Array.isArray(routes)) return null;
  const host = urlHost(url);
  for (const route of routes) {
    if (!route?.match || !route.destination) continue;
    if (!matchesRoute(route, url, host)) continue;
    if (linkRouteTargetState(route, liveness) !== 'ok') continue;
    return route;
  }
  return null;
}

/** The window a routed link opens in. Keeps `preferred` (the window chosen
 * on an earlier flush) while it still fits; else the Space's window, else the
 * profile's most recently focused window. With none, a Space that isn't
 * showing opens in a new window (D2) through `openSpace`, and when that is
 * refused or fails (null) `openProfileWindow` makes a new window of the
 * destination's profile. Never another profile's window.
 * `runtimes` are live browser windows; `focusOrder(runtime)` is a number,
 * larger for more recent focus. */
function resolveRoutedRuntime(destination, preferred, { runtimes, focusOrder, openSpace, openProfileWindow }) {
  const fits = (runtime) => runtimes.includes(runtime) && runtime.profileId === destination.profileId
    && (!destination.spaceId || runtime.workspaceId === destination.spaceId);
  if (preferred && fits(preferred)) return preferred;
  const candidates = runtimes.filter(fits);
  if (candidates.length) {
    return candidates.reduce((best, runtime) => (focusOrder(runtime) > focusOrder(best) ? runtime : best));
  }
  const opened = destination.spaceId ? openSpace(destination) : null;
  if (opened && opened.profileId === destination.profileId) return opened;
  return openProfileWindow(destination.profileId);
}

/** The rule host for a page: its parsed host with a leading `www.` dropped,
 * or null when the page has no web host. */
function siteRouteHost(url) {
  if (!urlHost(url)) return null;
  const domain = normalizeDomain(String(url));
  return domain.ok ? domain.value : null;
}

const sameDestination = (destination, here) => destination.profileId === here.profileId
  && (destination.spaceId ?? null) === (here.spaceId ?? null) && destination.private !== true;

/** The shield popover's "Open links to this site in this profile" switch
 * (spec §3.6): the domain rule for exactly this page's host, and whether it
 * points `here` ({ profileId, spaceId }). null when the page has no host. */
function siteLinkRouteState(routes, url, here) {
  const host = siteRouteHost(url);
  if (!host) return null;
  const rule = normalizeLinkRoutes(routes).find((route) => route.match.kind === 'domain' && route.match.value === host) ?? null;
  return { host, rule, on: !!rule && sameDestination(rule.destination, here) };
}

/** The shield popover's switch model: null in a private tab, with fewer
 * than two live profiles, or for a page with no host. `nameFor(destination)`
 * names where a rule for this host sends links instead, or returns null. */
function siteRouteSwitchModel({ routes, url, here, privateTab, liveProfileCount, nameFor = () => null }) {
  if (privateTab || liveProfileCount < 2) return null;
  const state = siteLinkRouteState(routes, url, here);
  if (!state) return null;
  const elsewhere = state.rule && !state.on ? (nameFor(state.rule.destination) ?? null) : null;
  return { on: state.on, scope: here.spaceId ? 'space' : 'profile', elsewhere };
}

/** Write or replace the domain rule for this page's host so it points
 * `here`. A replaced rule keeps its id and place; a new one goes first, so a
 * broader rule further down can't shadow it. */
function setSiteLinkRoute(routes, url, here, makeId) {
  const host = siteRouteHost(url);
  if (!host) return { ok: false, error: 'no-host' };
  const list = normalizeLinkRoutes(routes);
  const destination = { profileId: here.profileId, spaceId: here.spaceId ?? null, private: false };
  const index = list.findIndex((route) => route.match.kind === 'domain' && route.match.value === host);
  if (index >= 0) {
    list[index] = { ...list[index], destination };
  } else {
    if (list.length >= MAX_LINK_ROUTES) return { ok: false, error: 'too-many', host };
    list.unshift({ id: makeId(), match: { kind: 'domain', value: host }, destination });
  }
  return { ok: true, host, routes: list };
}

/** Remove the domain rule for this page's host, wherever it points. */
function removeSiteLinkRoute(routes, url) {
  const host = siteRouteHost(url);
  if (!host) return { ok: false, error: 'no-host' };
  const list = normalizeLinkRoutes(routes);
  const kept = list.filter((route) => !(route.match.kind === 'domain' && route.match.value === host));
  return { ok: true, host, removed: kept.length !== list.length, routes: kept };
}

/** Deleting a profile removes the rules that point at it. */
function linkRoutesWithoutProfile(routes, profileId) {
  return normalizeLinkRoutes(routes).filter((route) => route.destination.profileId !== profileId);
}

module.exports = {
  MAX_LINK_ROUTES,
  MAX_LINK_ROUTE_VALUE,
  LINK_ROUTE_KINDS,
  urlHost,
  normalizeDomain,
  normalizeContains,
  normalizeLinkRoutes,
  validateLinkRoutes,
  matchLinkRoute,
  linkRouteTargetState,
  linkRoutesWithoutProfile,
  resolveRoutedRuntime,
  siteRouteHost,
  siteLinkRouteState,
  siteRouteSwitchModel,
  setSiteLinkRoute,
  removeSiteLinkRoute,
};
