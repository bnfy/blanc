# Blanc for Android: Settings

Status: draft for the owner's review (2026-11-07). Nothing here is built. It refines the A5 row of
`docs/superpowers/plans/2026-11-03-android-port.md` and the "Settings" row of the Android design
(`2026-11-03-android-port-design.md`, §6), which said "a native Blanc settings sheet matching the
iPhone's". On 2026-11-07 the owner asked for Settings designed "in whatever way makes most sense in
mobile Chromium, but still branded as Blanc". This document makes that call and records it as a
divergence (D-row) from the iPhone.

## Why now

Today nothing on Android opens Settings. `/settings` is held back until A5, the Island menu's
"Customize Start Page" and "Blocking is off" items have no destination, and `blanc://settings` typed
in the palette does nothing. The one Settings job already built, Sync, is reachable only through
`/sync`. The owner hit this on 2026-11-07 while trying to turn on Sync for the two-device check.

## The decision: Blanc's Settings on Chromium's settings stack

Blanc's Settings is Chromium's own main settings screen (`MainSettings` in `SettingsActivity`),
re-scoped by Blanc: Blanc's rows and header, the Google and Chrome rows removed, drawn with
Chromium's preference widgets and a Blanc theme. It is not a hand-built dialog like the iPhone's
sheet, and not a `chrome://settings` web page.

Why this is the best fit on Android:

- **It is what an Android person expects.** A full-screen list, the system back gesture (including
  predictive back), edge-to-edge insets, keyboard and TalkBack behavior, and the multi-column layout
  on a foldable or tablet all come from the stack and are already tested by Chromium. A custom sheet
  would re-implement each and own it at every rebase.
- **Chromium's mature pages come with it.** Site settings, Accessibility, Notifications, Downloads
  and Clear browsing data already exist, work, and are kept current by each Chrome rebase. Rebuilding
  them natively is cost with no product value.
- **Blanc's own sections lead.** The iPhone's sections, order and wording come first, so the phone
  still reads as one product. Chromium's pages sit below under "More".

Cost: a small patch (the seam, described under "How the seam works") plus a Blanc theme overlay, and
a gate that stops Google or Chrome wording reaching a screen.

## The root screen

Order follows the iPhone's `SettingsSheet.swift`. Rows marked (A) are Android's own.

| Section | Rows |
|---|---|
| **Header** | The Sunrise mark, "Blanc" and the version. Not a row. |
| **Browsing** | Search engine (DuckDuckGo, Google, Bing, Brave, Kagi; default DuckDuckGo; syncs as `searchEngine`). Default browser (opens Android's role request). |
| **Appearance** | Theme (System, Light, Dark; syncs as `theme`). Island position, Top or Bottom (A). Start page ▸ (layout, wallpaper, clock; see Staging). |
| **Privacy** | Blocker on/off (syncs as `adblockEnabled`) with the exceptions list ▸. Clear site data. Measure usage (the launch ping's consent). |
| **Sync** | One row showing "Connected" or "Not connected". It opens the existing Sync sheet (`SyncSheet.open`), the same one `/sync` opens. |
| **More** | Site settings, Accessibility, Notifications, Downloads (Chromium's pages, restyled by the theme). Language opens Android's per-app language screen. |
| **About** | Version and build, Website, Privacy policy, Support, Open-source licenses, Show welcome again. |

Removed from what Chrome ships: the settings promo card, Sign in, Google services, Safety Hub,
Address bar, Tabs, Homepage, Glic, Developer (kept in debug builds only) and "About Chrome". Passwords
and autofill appear when A6 builds them. Inside the pages kept under More, any row that points at a
Google service (Safe Browsing's data sharing, the sync-and-services link, Privacy Guide) is hidden
the same way A0 hid them elsewhere.

## Ways in

Same destinations as the iPhone's `SettingsDestination`: root, privacy, sync, start page.

- The palette's Settings page shortcut and `/settings` (turn `Kind.SETTINGS` on in `SlashCommands`).
- The Island menu: Customize Start Page opens Start page; "Blocking is off everywhere" opens Privacy.
- `blanc://settings`, with the iPhone's fragments (`#sync`, `#privacy`, `#start-page`), typed or
  tapped from any Blanc page. The Start Page's own "Sync with your Blanc" card opens the Sync sheet
  directly through `start.openSettings('sync')`.
- Chromium's own app menu stays hidden, as in A1. Settings is never reached through Chrome UI.

## Branding

- A Sunrise theme overlay on `SettingsActivity` using the generated token values: `sunrise-bg`,
  `sunrise-surface`, `sunrise-surface-raised`, `sunrise-border`, `sunrise-text`, `sunrise-text-dim`,
  `sunrise-accent`, each in light and dark, so a "More" page looks like Blanc, not Chrome. The
  neutral Island colors are unchanged (CLAUDE.md: the Island and its frame stay neutral).
- The header carries the Sunrise mark from `assets/sunrise-mark.svg`. No Chrome logo, no Google
  imagery, no "Chrome" or "Google" in any reachable string.
- Copy comes from `copy/messages/` with the iPhone's `settings.*` keys, in all six languages. A
  Chromium string kept under More follows its own translation until Blanc replaces it.
- Typeface: the system's, unless native Blanc views already ship Instrument Sans. Task 1 checks and
  records it; no font is added just for this.

## Staging

Settings is large because of the Start page. Its handlers (`start.setLayout`, wallpaper, clock) aren't
implemented on Android yet; the Start Page runs on a smaller set. So:

1. **A5a, Settings shell.** The root, the theme, the ways in, and every row whose feature already
   exists: Sync, Blocker and exceptions, Theme, Search engine, Island position, Clear site data,
   About, and Chromium's pages under More. This unblocks the two-device check and is a small PR.
2. **A5b, Start page appearance.** Layout, wallpaper and clock, with the page-side handlers.
3. **A5c, First minute.** Default-browser role, Language, Measure usage and the launch ping with
   onboarding (the rest of the ladder's A5 row).

## Behavior rules

- A change writes through at once and, for the three synced keys, goes to the runner like any other
  edit (`SyncedSettings`; search engine joins its `KEYS`). A value the phone can't show survives
  untouched (Review Focus 5 of A4 still holds).
- Blocker off is the same switch as `/block-ads` and the Island menu, and re-checks open tabs.
- Search engine sets Blanc's own `searchEngine` and the default of any Chromium search surface that
  remains (the page context menu's "Search for"). Chromium's Google default no longer shows.
- Private tabs: Settings is the same screen; changes don't record history.
- Back goes up one level; from the root it returns to the tab it came from.

## Tests and gates

- Robolectric: row order and visibility per state, every destination opens the right screen, the Sync
  row reflects status, each synced key calls the runner.
- Emulator (`chromium/tests/android/`): open each reachable screen, dump its text, and fail on
  "Chrome", "Google", "Sign in" or an English string in a non-English run. Screenshots of the root and
  one Chromium page in light and dark go in `STATUS.md`.
- Existing gates (outbound, patches, desktop lane byte-identical) stay green; the desktop lane is
  untouched.

## Divergence (D-row)

**Android Settings uses Chromium's settings stack** where the iPhone's is a bespoke SwiftUI sheet. Same
sections, order and wording for Blanc's rows; Chromium supplies navigation, back and the pages under
More. Reason: the system's own behavior and Chromium's tested pages, at a lower rebase cost than a
custom screen. This supersedes the 2026-11-04 line "native sheet matching the iPhone's".

## Decisions

1. **Chromium's stack, not a custom sheet.** Owner, 2026-11-07 ("Yes, plan A5a").
2. **Chromium's Site settings, Accessibility, Notifications and Downloads stay under More.** Claude's
   call (the owner didn't answer this one; it was the recommended option). Reversible: hiding More is
   one list in `SettingsLayout`.

## How the seam works (refined after reading the tree, 2026-11-07)

Every route to Settings (the registry's `""` and `"/"` mappings, `SettingsHostFragment`'s
`instanceof MainSettings` checks, the multi-column layout's `getMainSettings()`) names the class
`MainSettings`, and `MainSettings.createPreferences()` / `updatePreferences()` are tangled with
sign-in, sync-service and homepage observers. So Blanc keeps the class and its logic and adds one
step at the end of those two methods: Blanc's code removes the rows Blanc doesn't offer, adds its own
rows and header, and reorders. Chromium's own update paths keep working on the hidden rows, since
`mAllPreferences` still holds them. This is a patch of a few lines, not a new root fragment.
