# iOS port: what a mobile user asked for, and where it lands

**Date:** 2026-10-23
**Status:** Decisions taken by the owner (2026-10-23); nothing here is built.
**Feeds:** the revised ladder in
[`2026-10-21-ios-port-revisit.md`](2026-10-21-ios-port-revisit.md) §6 (which
points here), `spec/features.md` (F41), `spec/parity-matrix.md`.

---

## 1. The request

On Threads (2026-10-23), a person who uses mobile browsers a lot listed what
would make Blanc on iPhone attractive to them:

1. Sync with Spaces across devices.
2. Something like Arc Search's "Browse for Me", with AI summaries of articles.
3. A minimal, customizable UI, with a choice of where buttons and controls sit.
4. Pin pages on the phone to send them to the laptop, to pick up where you left
   off.
5. A built-in ad blocker.

This is one person's list, not a survey. It is recorded because it lines up
with the companion positioning decided on 2026-10-21 ("your Blanc, in your
pocket": items 1 and 4), and because it asks for one thing that positioning
rules out (item 2).

## 2. Decisions, on the revised ladder

| # | Request | Decision | Where it lands |
|---|---------|----------|----------------|
| 4 | Phone → laptop | **Tab Sync on iPhone, plus an explicit Send to device.** | **M7** (Profile Sync on iOS), which already holds both, §3. |
| 1 | Spaces across devices | **Spaces sync, end-to-end encrypted, off by default**, reversing F41's "Spaces never sync". The phone shows them read-only first. | A **desktop Spaces sync** step before **M10** (groups and Spaces from sync, read-only); editing on the phone stays under *Later*, §4. |
| 3 | Customizable UI | **One setting: the pill sits at the bottom (default) or the top**, as Safari offers. No rearrangeable buttons. | *Later* (after the beta), §5. |
| 5 | Ad blocker | Already in the prototype (M5) and on by default; not the pitch, per the revisit's positioning. | M5; the full filter pipeline stays under *Later* (M15). |
| 2 | AI summaries | **Declined.** The companion is positioned as AI-free (revisit §6, `docs/marketing-claims.md`). | Not planned, §6. |

## 3. Phone → laptop (M7)

M7 already delivers this; the request confirms its scope. What it has to cover
for this need, in order:

- **Sync on the phone first.** The prototype has no Profile Sync: its settings
  bridge answers every Sync call with "disabled". M7 adds joining with the
  eight-character device code (name and passphrase as the fallback), the
  derived key kept only in this phone's Keychain (never a file, `UserDefaults`
  or iCloud Keychain), and a client for the existing v1 sync Worker.
- **Tab Sync (F27) on iPhone.** With sharing on, the phone publishes its open
  tabs and the laptop lists them in the ⌘L panel's Other devices drawer, the
  Quick Switcher and the start page; the phone lists the laptop's. Read-only,
  opt-in, never private tabs. This alone answers most of "pick up where you
  left off".
- **Send to device**, on both platforms: one page sent to a chosen device of
  the same sync account, shown there in a short "From iPhone" list in the ⌘L
  panel and on the start page until opened or expired. It never opens a tab by
  itself (F27's "nothing force-opens remotely" holds). Likely a small
  per-device encrypted inbox in the Profile Sync store; the tab relay
  (`cloudflare/tab-import-worker`) is a one-time handoff for the
  Firefox/Safari companions and is not reused. M7's own spec settles it.

## 4. Spaces across devices (desktop step, then M10)

M10 shows "groups and Spaces from sync" on the phone, but Spaces don't sync
today (F41). So a desktop step comes first:

- **Desktop Spaces sync** (before M10). Spaces join Profile Sync as a new,
  separately budgeted encrypted store beside Favorites, settings and Tab Sync.
  Shape to settle in its own spec:
  - **Opt-in, off by default**, per device; Personal profile only, as for the
    rest of Profile Sync.
  - **What travels:** each space's name, colour, symbol, order and its saved
    tabs and groups (URL, title, group, pin). Never private tabs, page state,
    snapshots or the two resident recently-left sets.
  - **Two devices editing one space:** a clock per space (the device-names
    pattern, `src/main/device-names.js`), so edits to different spaces never
    clobber each other. Whether the same space's tab list merges or the latest
    save wins is the spec's main open question.
  - **Opening a space another device also has open** takes a copy of its saved
    tabs and never closes anything on the other device.
  - **Deletion** syncs through Recently deleted (7 days).
  - The v1 Worker stores only ciphertext and can't merge, so all merging is on
    the device. Size limits follow the existing per-store budgets.
  - **Open question: showing a space as "open on another device".** Saved
    Spaces can't tell whether a remote window is still open: a device that
    quits, sleeps or loses its network leaves its last save behind. Showing it
    needs presence of its own (each device publishing which space its windows
    show, on a heartbeat, hidden once stale or retracted on quit); F27's
    24-hour heartbeat is far too coarse. **Default: no such indicator.** The
    spec either defines that presence, with its staleness and offline rules,
    or leaves it out.
- **M10 (phone, read-only).** A space appears on the phone as a saved set of
  tabs and groups with its mark (symbol and name on its colour); opening it
  opens those tabs. Editing, and the phone's own spaces, stay under *Later*
  with editing groups.

## 5. Pill position (Later)

One device-local setting, **Pill position: Bottom (default) / Top**. Only the
pill and its expanded panel move. Back and forward stay WebKit's page-edge
swipe gestures (D7, `allowsBackForwardNavigationGestures`), which belong to the
page, not the pill, and don't change with the setting. Not synced: it suits a
hand and a phone, not a person. Choosing which buttons the pill shows, or
their order, was declined: every option makes the minimal pill harder to
explain and test. It is a single setting, so it can move before the beta if
testers ask for it. On the Duo's inner display (D30) the setting applies to the
regular-width pill the same way.

## 6. AI summaries (declined)

The revisit (§6) positions the iPhone app as AI-free, and Blanc's public
claims say it is not an AI or agent browser (`docs/marketing-claims.md`). A
"Browse for Me" feature would contradict both, need a privacy review of where
page text goes, and new marketing rules. Revisit only if the owner changes the
positioning; an on-device summary (nothing leaving the phone) would be the
starting point then.

## 7. What can be said publicly

Nothing here is built. Until a release ships it (`docs/marketing-claims.md`),
replies may say the requests were recorded and which ones Blanc plans to look
at, but not promise a feature, a date, or that Spaces will sync.
