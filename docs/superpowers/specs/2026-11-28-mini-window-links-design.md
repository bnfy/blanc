# Mini Window: links from other apps (#1734, part 3)

**Status:** design approved approach; not built.
**Asked for:** #1734 item 3, from Koen's feedback on #1138: "as some other
browsers do, if I click a link in any other app, it opens in a mini window,
from which I can then again move it if I want to." Parts 1 (Move to Space,
v1.53.0) and 2 (switch to tabs and Spaces) make the mini window a place to
look, then keep, file or let go. This part lets links from other apps start
there.

## What it does

- **A setting, off by default:** Settings → General, beside the mini window
  shortcut: **Open links from other apps in a mini window**, with the help
  line "Links that match a rule still go where the rule says." Device-local
  (`miniWindowForLinks`, never synced), like the shortcut.
- **With it on,** a web link handed over by the OS (macOS `open-url`, a
  Windows or Linux command line at launch or through `second-instance`) that
  matches no link rule opens in a mini window instead of the frontmost
  ordinary window:
  - the most recently focused mini window of the link's profile, as a new
    tab, while one is open (several links in a row share it);
  - otherwise a new mini window, on the display under the pointer, whose
    blank start tab the link takes the place of (no empty tab beside it).
  The mini window comes forward, or opens without focus for a background
  open, as the handoff already does for any window.
- **The profile** is the one the link would have used: the most recently
  focused ordinary window's (`miniWindowProfileId`).
- **Unchanged, and first as today:** tab handoff (Blanc's own tab-transfer
  links), link rules (F60: a matching rule still sends the link to its
  profile, Space or private tab), local HTML files (the static preview), and
  links clicked inside Blanc.
- Everything else about the mini window is as before: it is never saved,
  closes after an hour unused, and offers Open in Blanc, Move to Space and the
  switcher.

## Approaches considered

1. **A fallback in the existing link handoff (chosen).** `createExternalUrlHandoff`
   already checks rules (`routeFor`) and then asks `getRuntime` for a window.
   With the setting on, that fallback is a mini window. One seam, so queueing
   before Blanc is ready, startup argv, background opens and bringing the
   window forward keep working.
2. **A branch at each arrival point** (`open-url`, argv, `second-instance`).
   Bypasses the handoff's queueing; links at launch or during startup could
   be lost or misplaced. Dropped.
3. **A built-in last link rule** with a mini-window destination. Link rules
   are a saved, validated list of up to 50 with an editor; a setting disguised
   as a rule leaks into both. Dropped.

## Decisions

- **D1. Rules first** (owner, November 28, 2026): a matching link rule wins;
  the mini window takes only links no rule claims.
- **D2. Approach 1** (owner, November 28, 2026).
- **D3. Reuse the open mini window; Settings → General; device-local** (builder's
  calls, proposed November 28, not disputed).

## Shape (for the plan)

- Settings: `miniWindowForLinks` boolean, default `false`, in
  `settings-schema/schema.json` (substrate) and `settings.js`, written through
  the `setSettings` whitelist, outside `SYNCED_KEYS`; a switch in
  `pages/settings.html` / `settings.js` beside `miniWindowShortcut`.
- Pure choice in `src/main/mini-window.js`:
  `miniWindowForLink(runtimes, profileId) => runtime | null` (the most
  recently focused live mini window of that profile; focus order from
  `runtimeFocusSerials`).
- main: the handoff's `getRuntime` without a destination returns
  `miniLinkRuntime(preferred)` when the setting is on: the reused mini window,
  or a new mini runtime made without its start tab (so `ensureWindow`'s start
  tab and the link's tab don't both appear; or the unused start tab is closed
  once the link's tab is in). Off: `resolveExternalRuntime` as today.
- Copy (all six languages): the label and help line above.

## Tests

- Unit: `miniWindowForLink`; the setting's default, whitelist and
  device-local status; the handoff's fallback choice.
- Acceptance: F61-12 (setting on: a link from another app opens in a mini
  window with no blank tab beside it, and a second link joins it), F61-13 (a
  matching rule still wins), and F61-3 unchanged (setting off: an ordinary
  window).
- The fork: the same on `chromium/next` afterwards (the fork's native
  external-link path).
