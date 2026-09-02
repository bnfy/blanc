'use strict';

const DEFAULT_LIMIT = 48;
const MAX_LIMIT = 96;
const MAX_OFFSET = 5000;
const MAX_TITLE_LENGTH = 120;

function siteIdentity(value) {
  if (typeof value !== 'string') return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    const key = parsed.hostname.toLowerCase().replace(/^www\./, '');
    if (!key) return null;
    return { key, url: parsed.href };
  } catch {
    return null;
  }
}

function siteKey(value) {
  return siteIdentity(value)?.key ?? null;
}

function siteTitle(value, fallback) {
  const title = typeof value === 'string' ? value.trim() : '';
  return (title || fallback).slice(0, MAX_TITLE_LENGTH);
}

/**
 * Collapse local visit entries to one representative per hostname and rank
 * by visit count, then most-recent visit. The input remains the source of
 * truth; this function does not create another visit log.
 */
function rankTopSites(entries, { limit = DEFAULT_LIMIT, offset = 0 } = {}) {
  const requested = Number.isInteger(limit) ? limit : DEFAULT_LIMIT;
  const safeLimit = Math.max(0, Math.min(requested, MAX_LIMIT));
  const requestedOffset = Number.isInteger(offset) ? offset : 0;
  const safeOffset = Math.max(0, Math.min(requestedOffset, MAX_OFFSET));
  if (safeLimit === 0) return [];

  const bySite = new Map();
  for (const entry of Array.isArray(entries) ? entries : []) {
    const identity = siteIdentity(entry?.url);
    if (!identity) continue;
    const visitedAt = Number.isFinite(entry.visitedAt) ? entry.visitedAt : 0;
    const existing = bySite.get(identity.key);
    if (!existing) {
      bySite.set(identity.key, {
        key: identity.key,
        url: identity.url,
        title: siteTitle(entry.title, identity.key),
        visitCount: 1,
        lastVisitedAt: visitedAt,
      });
      continue;
    }

    existing.visitCount += 1;
    if (visitedAt > existing.lastVisitedAt) {
      existing.url = identity.url;
      existing.title = siteTitle(entry.title, identity.key);
      existing.lastVisitedAt = visitedAt;
    }
  }

  return [...bySite.values()]
    .sort((a, b) =>
      b.visitCount - a.visitCount ||
      b.lastVisitedAt - a.lastVisitedAt ||
      a.key.localeCompare(b.key))
    .slice(safeOffset, safeOffset + safeLimit)
    .map(({ lastVisitedAt: _lastVisitedAt, ...site }) => site);
}

module.exports = {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  MAX_OFFSET,
  MAX_TITLE_LENGTH,
  rankTopSites,
  siteKey,
};
