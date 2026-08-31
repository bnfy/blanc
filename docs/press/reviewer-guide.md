# Blanc 1.0 — five-minute reviewer guide

This guide applies to Blanc 1.0.0-rc.2 for Apple Silicon. Distribute it only
after that exact candidate has been signed, notarized, stapled, hashed, and
published. For the product's explicit boundaries, read
[known limitations](./known-limitations.md).

## Before opening Blanc

1. Download `Blanc-1.0.0-rc.2-arm64.dmg` and `SHA256SUMS` from the unlisted
   reviewer page.
2. Verify the DMG hash against the checksum file.
3. Drag Blanc to Applications and launch it normally. The build should open
   without a Gatekeeper bypass.

## Minute 1 — first launch

The local Blanc chrome should appear even while its blocker prepares. On a
fresh profile, review the compact privacy card before continuing:

- live search suggestions may send eligible typed prefixes to the search
  provider you select;
- usage measurement contains only the documented install/session/version/
  platform/architecture/coarse-OS fields plus fixed Mahjong-play and rendered
  start-page-layout events; product events are excluded from private tabs.

Neither path should send before the choices are committed. If filter
initialization fails, Blanc presents **Retry** and **Continue without blocking**
instead of hanging or silently weakening protection.

Both controls start enabled; either can be turned off before continuing.

## Minute 2 — the Island

Open two or three ordinary sites. The top of the window has no horizontal tab
strip or conventional toolbar. The resting Island shows the active context;
click it or press **Command-L** to expand search, tabs, local matches, and
commands over the page.

Try:

- typing part of an open tab's title to switch locally;
- typing `/` to see commands;
- `/group review` to name the current tab's group;
- `/private` to open a private tab;
- `/find` to open the compact find capsule.

New in rc.2, right-click the expanded Island's address field. Alongside the
standard editing items it offers two Blanc actions:

- **Copy Clean Link** copies the visible address with known tracking
  parameters removed. Load a URL carrying `utm_*` values or a `fbclid`/`gclid`
  and confirm they are gone while every other parameter survives byte-for-byte
  in its original order. The item is disabled when the field does not hold an
  http(s) URL.
- **Paste and Go** navigates to the clipboard through the same pipeline as a
  typed address — search-versus-address detection and OS hand-off for
  `mailto:`-style links included — then closes the Island. Compare it against
  pasting manually and pressing Enter; the two paths should agree.

## Minute 3 — optional vertical tabs

Choose **View → Tab Layout → Vertical Tabs**, use Settings → General → Tab
layout, use the sidebar button in the expanded Island footer, or press
**Command-Option-V** (**Ctrl-Alt-V** elsewhere). The Island remains centered
over the website pane in a safe-area gutter tinted from the active website,
while the rail runs all the way to the top. The Island remains the only
address/search/command surface. The rail should preserve existing tabs, pins,
named groups, private state, loading/audio state, and ordering without
reloading the active page.

Exercise the rail:

- drag its right edge wider or narrower, then double-click to reset to 248px;
- hover a truncated tab title and confirm it scrolls to reveal the hidden end;
- switch and close a tab;
- middle-click a row to close it;
- fold and unfold a named group;
- drag a tab within the same pinned/group bucket;
- use Arrow keys, Home/End, and Enter/Space on focused rows;
- use the rail's sidebar icon to turn vertical tabs off.

## Minute 4 — blocking and private state

Visit an ad-supported page. If Blanc blocks requests, the shield count shows
how many. Use `/allow-ads` if you want to confirm the per-site exception path.
The count is a request count, not a guarantee that every ad or tracking method
was removed.

In a private tab, look for the dashed/hollow treatment and explicit `private`
chip. Private tabs use a separate in-memory session and do not enter Blanc
history, session restore, or reopen-closed. Closing the chip is the quick exit.

## Minute 5 — the utility sheet and restraint

Open Favorites, History, Downloads, Settings, or Shortcuts. These utilities
appear as a temporary sheet over the current page rather than consuming tabs.
Dismiss with Escape or the scrim.

Also new in rc.2: right-click a page's background and choose **View Page
Source**. Blanc opens Chromium's own syntax-highlighted source view in a new
tab rather than navigating the current one, so Back never loses your place.
The item appears for http(s) pages only — local files and Blanc's own
`blanc://` pages are deliberately out of scope. On a normal tab the Island
carries a source chip to close the view; on a private tab the existing
`private` chip already does that job.

That interaction is the product thesis in miniature: browser tools should be
present when requested and absent when the page is the task.

## Useful shortcuts

| Action | Shortcut |
|---|---|
| Search, switch, or command | Command-L |
| New tab | Command-T |
| New private tab | Command-Shift-N |
| Close tab | Command-W |
| Reopen closed tab | Command-Shift-T |
| Find in page | Command-F |
| Settings | Command-, |

## Feedback

Please include the RC version, macOS version, Mac model, exact steps, expected
result, and observed result. Send product, press, and private security feedback
to [support@blancbrowser.com](mailto:support@blancbrowser.com); put
**Security** in the subject for vulnerabilities.
