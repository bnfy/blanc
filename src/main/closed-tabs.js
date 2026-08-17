// Pure Reopen Closed Tab policy: which closes may hold a live view, how a
// closed entry is shaped, and what of it a renderer may see. No electron
// import — this file must stay requireable from `node --test` (precedent:
// tab-sleep.js). The clock is injected, never read.
// See docs/superpowers/specs/2026-08-16-reopen-closed-tab-design.md.

/** Held views live this long before degrading to their snapshot (§2.1). */
const CLOSED_GRACE_MS = 30_000;
/** Recently closed is an undo buffer, not an archive. */
const CLOSED_ENTRY_TTL_MS = 60 * 60 * 1000;
/** Per-window entry cap, matching the old recentlyClosedUrls bound. */
const MAX_CLOSED_ENTRIES = 25;
/** At most one live held view per window; a newer close takes the hold. */
const MAX_HELD_VIEWS = 1;

let entrySeq = 0;
const nextEntryId = () => `closed-${++entrySeq}`;

/**
 * Highest tier a closing tab qualifies for. 'refuse' means the close is not
 * recorded at all (§2.1): private tabs, newtab, or no usable URL.
 * The caller computes the family/prompt booleans — this module never sees
 * the tabs Map or the prompt registry.
 */
function holdEligibility(tab, {
  hasSnapshot = false,
  promptPending = false,
  openerAlive = false,
  hasManagedChild = false,
  popupChildCount = 0,
} = {}) {
  const url = typeof tab?.url === 'string' ? tab.url : '';
  if (!url || tab?.private || url.startsWith('blanc://newtab')) return 'refuse';
  if (!hasSnapshot) return 'url';
  const anchorCount = tab.captureRecord?.anchors?.length ?? 0;
  const demoted =
    tab.capturing || anchorCount > 0        // grant truth, not the projection (§5.1a)
    || promptPending                        // prompt-bearing closes are Tier 1 (§5.1b)
    || tab.isLoading                        // an in-flight navigation can't be frozen (§3.4)
    || tab.asleep || tab.sleeping || tab.waking
    || tab.adopted || openerAlive || hasManagedChild || popupChildCount > 0; // §5.6
  return demoted ? 'snapshot' : 'hold';
}

/**
 * Strip pageState from every entry unless the commit was a successful GET.
 * pageState can carry the verbatim POST body of the submission that produced
 * the page; restoring it would resubmit (§2.1.1). The stripping is deliberately
 * applied to EVERY entry, not just the active one — trimSnapshot (tab-sleep.js)
 * guarantees non-active entries carry no pageState, making the two forms
 * behaviorally identical on real inputs. Strip-all is pure defense-in-depth
 * against a future caller that violates that invariant. Runs on EVERY snapshot,
 * held entries included, so a later downgrade needs no extra step.
 */
function sanitizeSnapshot(snapshot, { restorableCommit = false } = {}) {
  if (!snapshot || !Array.isArray(snapshot.entries)) return null;
  if (restorableCommit === true) return snapshot;
  return {
    ...snapshot,
    entries: snapshot.entries.map(({ url, title }) => ({ url, title })),
  };
}

/** One closed-tab entry. `view`/`heldAt`/`wcId` stay null here; only the
 *  impure half may park a live view into them. */
function buildTabEntry(tab, snapshot, slot = {}, now = 0) {
  return {
    kind: 'tab',
    id: nextEntryId(),
    closedAt: now,
    url: tab.url,
    title: typeof tab.title === 'string' && tab.title ? tab.title : tab.url,
    favicon: typeof tab.favicon === 'string' ? tab.favicon : null,
    pinned: !!tab.pinned,
    muted: !!tab.muted,
    groupId: tab.groupId ?? null,
    groupName: slot.groupName ?? null,
    index: Number.isInteger(slot.index) ? slot.index : 0,
    snapshot: snapshot ?? null,
    // Document-scoped fields a Tier 0 adoption must seed back (§3.3).
    // adopted/openerTabId are absent by design: family tabs never hold (§5.6).
    seed: {
      usedMedia: !!tab.usedMedia,
      historyEligible: tab.historyEligible !== false,
      restorableCommit: tab.restorableCommit === true,
      httpEntryCount: tab.httpEntryCount ?? 0,
      deepScrolled: !!tab.deepScrolled,
      // The document is older than its new record; stale async probes and
      // snapshot work must be judged against the document's real generation.
      navEpoch: tab.navEpoch ?? 0,
    },
    view: null,
    heldAt: null,
    wcId: null,
    expiryTimer: null,
  };
}

/** One entry for a whole group close (§2.2). Private members are dropped
 *  from the record (never recorded) though the caller still closes them. */
function buildGroupEntry(group, members, now = 0) {
  return {
    kind: 'group',
    id: nextEntryId(),
    closedAt: now,
    group: {
      id: group.id,
      name: group.name,
      collapsed: !!group.collapsed,
      index: Number.isInteger(group.index) ? group.index : 0,
    },
    activeMemberIndex: Number.isInteger(group.activeMemberIndex) ? group.activeMemberIndex : 0,
    tabs: members
      .filter((m) => !m.private)
      .map((m) => ({
        url: m.url,
        title: typeof m.title === 'string' && m.title ? m.title : m.url,
        favicon: typeof m.favicon === 'string' ? m.favicon : null,
        pinned: !!m.pinned,
        muted: !!m.muted,
        snapshot: m.snapshot ?? null,
      })),
    view: null,
    heldAt: null,
    wcId: null,
    expiryTimer: null,
  };
}

/** Ids of entries whose hold has aged out. Always a downgrade, never a
 *  destroy: every held entry carries its snapshot (§2.1). */
function expireHolds(entries, { now, graceMs = CLOSED_GRACE_MS } = {}) {
  return (entries ?? [])
    .filter((e) => e?.view && Number.isFinite(e.heldAt) && now - e.heldAt >= graceMs)
    .map((e) => e.id);
}

/** Closed-entry ids old enough to leave the undo buffer altogether. */
function expireEntries(entries, { now, ttlMs = CLOSED_ENTRY_TTL_MS } = {}) {
  return (entries ?? [])
    .filter((entry) => Number.isFinite(entry?.closedAt) && now - entry.closedAt >= ttlMs)
    .map((entry) => entry.id);
}

/** The ONLY shape a renderer may see (§4.1). Entries, page state, seeds,
 *  slot metadata, and view references never cross this projection. */
function projectEntries(entries) {
  const pngFavicon = (value) =>
    typeof value === 'string' && value.startsWith('data:image/png;base64,')
      ? value
      : null;
  return (entries ?? []).map((e) => ({
    id: e.id,
    title: e.kind === 'group' ? e.group.name : e.title,
    favicon: e.kind === 'group' ? null : pngFavicon(e.favicon),
    tabCount: e.kind === 'group' ? e.tabs.length : 1,
  }));
}

module.exports = {
  holdEligibility,
  sanitizeSnapshot,
  buildTabEntry,
  buildGroupEntry,
  expireHolds,
  expireEntries,
  projectEntries,
  CLOSED_GRACE_MS,
  CLOSED_ENTRY_TTL_MS,
  MAX_CLOSED_ENTRIES,
  MAX_HELD_VIEWS,
};
