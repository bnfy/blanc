# iOS port: what a mobile user asked for, and where it lands

**Date:** 2026-10-23
**Status:** Decisions taken by the owner (2026-10-23); nothing here is built.
**Feeds:** `docs/superpowers/specs/2026-07-07-ios-port-roadmap-design.md` (§12
points here), `spec/features.md` (F1, F27, F41), `spec/parity-matrix.md`.

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
with what Blanc already is (items 1, 4, 5), and because it asks for one thing
Blanc deliberately isn't (item 2).

## 2. Decisions

| # | Request | Decision | Where it lands |
|---|---------|----------|----------------|
| 5 | Ad blocker | Already in the iOS app. | M5 (merged): bundled EasyList + EasyPrivacy as a `WKContentRuleList`, on by default, a protected/paused shield (D13). M15 replaces it with the full filter pipeline. |
| 1 | Spaces across devices | **Spaces come to iPhone and sync, end-to-end encrypted, off by default.** Reverses F41's "Spaces never sync". | New milestones M17 (desktop Spaces sync) and M18 (Spaces on iPhone), §3. |
| 4 | Phone → laptop | **Tab Sync on iPhone first, then an explicit Send to device.** | M19 (F27 on iPhone) and M20 (Send to device, desktop and iPhone), §4. |
| 3 | Customizable UI | **One setting: the pill sits at the bottom (default) or the top**, as Safari offers. No rearrangeable buttons. | Folded into M16 (polish), §5. |
| 2 | AI summaries | **Declined for now.** Blanc stays a non-AI browser (`docs/marketing-claims.md`). | Not planned, §6. |

## 3. Spaces across devices (M17, M18)

Today a space is a named, saved set of one window's tabs and groups, kept per
profile on one device (F41). Making it cross-device is two pieces of work, in
this order:

- **M17 — Spaces sync on desktop.** Sync has to exist before a phone can take
  part, and the desktop is where Spaces live today. Spaces join Profile Sync as
  a new, separately budgeted encrypted store beside Favorites, settings and Tab
  Sync. Shape to settle in its own spec:
  - **Opt-in, off by default**, per device, like Tab Sync's sharing toggle;
    Personal profile only, as for the rest of Profile Sync.
  - **What travels:** each space's name, colour, symbol, order and its saved
    tabs and groups (URL, title, group, pin). Never private tabs, page state,
    snapshots or the two resident recently-left sets.
  - **Two devices editing one space:** a clock per space (the device-names
    pattern, `src/main/device-names.js`), so edits to different spaces never
    clobber each other. Whether the same space's tab list merges or the
    latest save wins is the spec's main open question.
  - **A space open in a window elsewhere** is shown as open there; opening it
    here takes a copy of its saved tabs, never closes the other window's tabs.
  - **Deletion** syncs through Recently deleted (7 days), so a delete on one
    device can be undone on another.
  - The v1 Worker stores only ciphertext and can't merge, so all merging is on
    the device. Size limits follow the existing per-store budgets.
- **M18 — Spaces on iPhone.** A parity row that is `—` today becomes
  `PLANNED`. On a phone a space is a saved set of tabs and groups that swaps in
  place, with the same mark (symbol and name on its colour) at the pill's
  leading edge. iPhone has one window, so "a space is in at most one window"
  becomes "the phone shows one space at a time". Import from Arc (F45) stays
  desktop-only.

**Depends on:** M8 (tab groups on iPhone), since a space holds groups, and M19's
pairing flow if it lands first (it is the same sync account).

## 4. From phone to laptop (M19, M20)

- **M19 — Tab Sync (F27) on iPhone.** Already specified and shipped on desktop,
  `PLANNED` on iOS. With sharing on, the phone publishes its open tabs, and the
  laptop lists them in the ⌘L panel's Other devices drawer, the Quick Switcher
  and the start page; the phone lists the laptop's the same way. Read-only, opt-in,
  private tabs never included. Joining uses the existing eight-character
  device code (a QR form may be added on the phone). This alone answers most
  of "pick up where you left off": open the laptop, find the phone's tab.
- **M20 — Send to device.** An explicit action, on both platforms, that sends
  one page to a chosen device of the same sync account, where it shows up
  without a search: a short "From iPhone" list in the ⌘L panel and on the start
  page, cleared when opened or after a set time. It never opens a tab by
  itself (F27's "nothing force-opens remotely" holds). The mechanism is the
  spec's call; the likely one is a small per-device encrypted inbox in the
  Profile Sync store. The tab relay (`cloudflare/tab-import-worker`) is a
  one-time handoff for the Firefox/Safari companions and is not reused for
  this.

## 5. Pill position (in M16)

One device-local setting, **Pill position: Bottom (default) / Top**. The pill,
its expanded panel and the edge-swipe navigation (D7) follow it; nothing else
moves. It is not synced: it suits a hand and a phone, not a person. Choosing
which buttons the pill shows, or their order, was declined: every option makes
the minimal pill harder to explain and to test, and Blanc's direction is
minimal by default.

## 6. AI summaries (declined for now)

Blanc's public claims say it does not provide an AI or agent browser, and its
Named Groups and Spaces are user-directed (`docs/marketing-claims.md`,
`CLAUDE.md`). A "Browse for Me" feature would change what Blanc is, need a
privacy review of where page text goes, and new marketing rules. It is not in
the plan. Revisit only if the owner changes Blanc's positioning; an on-device
summary (nothing leaving the phone) would be the starting point then.

## 7. Sequencing

The roadmap's rule stands (§1 there): plan the next milestone in detail and
re-decide the order at each boundary. These four are appended as M17–M20 after
the parity arc, not ahead of it, because the iOS app is not tester-ready yet:
the internal `blanc://` pages still render as desktop layouts on a phone. Two
of them are cheap to pull earlier if testers ask for them: M19 needs no
desktop work, and the pill position is a single setting.

## 8. What can be said publicly

Nothing here is built. Until a release ships it (`docs/marketing-claims.md`),
replies may say the requests were recorded and which ones Blanc plans to look
at, but not promise a feature, a date, or that Spaces will sync.
