# Blanc Browser — press fact sheet

Last updated: October 16, 2026 (public Blanc 1.35.0)

## The short version

**Blanc puts the browser in one small Island.** Search, tabs, named groups,
page controls, and slash commands appear when needed and leave the page alone
when they are not.

Blanc is an independent Chromium-based desktop browser from Bananify. It ships
with built-in ad and tracker blocking (with optional full uBlock Origin),
private tabs, Favorites, history, downloads, a command palette, named tab
groups you can reorder by dragging, independent windows, isolated local
profiles, a focused two-page Glance view, optional vertical tabs, Quiet Tabs,
Recently Closed, four Start Page layouts with built-in Mahjong, mouse gestures,
optional dark websites, free Blanc Spaces, tabs you can rename, optional
1Password login fill, end-to-end-encrypted Sync, trusted screen and
system-audio sharing, and a private one-time handoff for bringing open tabs
over from another browser. It does not ship an AI
assistant or a general extension runtime.

## Product facts

| Item | Fact |
|---|---|
| Product | Blanc Browser |
| Current public release | [1.35.0](https://github.com/bnfy/blanc/releases/tag/v1.35.0), released October 16, 2026 |
| Platforms | macOS (Apple Silicon and Intel), Windows x64, and Linux x64 (AppImage) |
| Price | Free |
| Optional support | Blanc Patron subscription, US$30/year or $4/month, plus applicable taxes. It supports development and unlocks nothing: every feature, including Blanc Spaces, is free (since 1.33.0). Founding supporters from the earlier one-time purchase keep their Patron status permanently |
| Browser engine | Chromium through Electron |
| Default search | DuckDuckGo; Google, Bing, Brave Search, and Kagi (Kagi needs a Kagi account) are also available, or any engine through a custom search address with `%s` |
| Interface languages | English, German, Spanish, French, Italian, and Portuguese (Brazil), machine-translated; Blanc does not translate web pages |
| 1Password | Optional login fill from the installed 1Password app on macOS, Windows, and Linux (not Windows on Arm); off by default, and it fills only when asked |
| Blocking | Blanc Blocker by default: reviewed, hash-pinned EasyList + EasyPrivacy snapshots bundled into each release, with browser-level request blocking, cosmetic CSS, and isolated blocker scriptlets. It always protects private tabs. Regular profiles can switch to the bundled full uBlock Origin 1.75.0 on Apple Silicon and native Intel Macs, Windows x64, and Linux x64 |
| Sync | Optional, passphrase-derived end-to-end encryption for Favorites and eligible settings (search engine, blocking state and exceptions, home page, theme, Start Page layout, and dynamic wallpaper); open-tab sharing is a separate per-device opt-in |
| Publisher | Bananify |
| Website | [blanc.day](https://blanc.day) |
| Press/support/security contact | [support@blanc.day](mailto:support@blanc.day) |

## What is distinct

- The **Island** replaces the permanent horizontal tab strip and conventional
  toolbar with one compact, contextual control surface.
- Tabs can remain inside the Island or appear in an optional **vertical rail**.
  The Island remains the only address, search, and command surface in either
  layout.
- Multiple native windows keep independent tab and group workspaces and restore
  separately across launches.
- Named local profiles isolate cookies, site data, Favorites, history,
  downloads, and remembered permissions without requiring an online account.
- **Glance** keeps one current-window tab visible as a temporary reference
  beside the main page without turning Blanc into a general split-view
  workspace manager.
- **Tab names**: give any tab a name of your own (Rename Tab… or `/rename`).
  It stays through navigation, Quiet Tabs, moving the tab to a new window,
  Recently Closed, Blanc Spaces, and relaunch; History and Favorites keep the
  page's own title.
- **Quiet Tabs** frees the memory of background tabs left idle for a delay you
  choose (30 minutes, 1 hour by default, 6 hours, or off) and reloads them when
  you return. **Recently Closed** lets you reopen closed tabs and groups for a
  limited time.
- Tabs and groups can be **dragged into a new order** in the expanded Island or
  vertical tabs, or moved from the keyboard with Option+Shift+Up/Down on macOS
  and Alt+Shift+Up/Down on Windows and Linux.
- Ad and tracker blocking is integrated at the browser session's network layer;
  it is not dependent on the Chrome Web Store or a user-installed extension.
- Blanc deliberately favors a small, coherent product over an AI agent,
  extension marketplace, or configurable dashboard.

## Measured memory

Measured 15 October 2026 on one Apple Silicon Mac with Blanc 1.34.0: six
ad-dense sites (five news sites and Speedtest) open in each browser, fresh profile, no extensions, three runs each, median reported.
The figure is `phys_footprint` summed across every process the browser starts —
not resident set size, which double-counts the engine framework mapped into each
renderer and inflates whichever browser isolates more per site.

| Browser | Memory |
|---|---|
| Brave | 1.5 GB |
| Blanc | 1.7 GB |
| Zen | 4.0 GB |
| Chrome | 5.7 GB |
| Vivaldi | 7.4 GB |

Two qualifications belong with any use of these figures. Brave also
blocks by default, which makes it the fair peer rather than Chrome, and in this
run it used a little less than Blanc. And the gap to Chrome is the blocking: with
Blanc's own blocker switched off the same pages cost 5.4 GB, about the same as
Chrome's 5.7.

Fresh, extension-free profiles make this a comparison of engines and defaults,
not of anyone's real setup. Raw run:
`bench/memory/results/memory-2026-10-15T06-03-46-052Z.md` (the earlier
9 August 2026 run with Blanc 1.1.0 stays in the same folder); the harness that
produced it is `bench/memory/` in the repository.

## Privacy in precise terms

- On a fresh profile, **Search suggestions** and **Help improve Blanc** are
  both presented on by default. Neither may send before the user saves the
  choices; either can be turned off before continuing or later in Settings.
- Search suggestions can send eligible typed prefixes to the selected search
  provider. They are skipped for private tabs, pasted or dropped text,
  URL-like/local input, and sensitive-looking values, and can be disabled.
- Optional usage measurement contains a random install ID, a random per-launch
  session ID, version, platform, architecture, and coarse OS major. It counts
  launches plus a fixed allowlist: the first real Mahjong move and which of the
  four Start Page layouts render, at most once each per app session, and two
  first-day signals sent at most once per install within 24 hours of
  installing (Blanc became the default browser; three web pages were opened). It contains
  no URLs, searches, history, page content, game state, or private-tab feature
  activity and can be disabled in Settings.
- Private tabs use a separate, non-persistent in-memory browser session and stay
  out of Blanc history, session restore, and reopen-closed.
- Sync encrypts data on the device before upload. Open-tab sharing is
  off by default on every device, and private tabs are never included.
- When open-tab sharing is enabled, bounded source-rasterized PNG favicons may
  be uploaded in a separately encrypted sidecar; receiving devices do not
  fetch remote icon URLs merely to draw them.

## Availability note

Public 1.35.0 ships signed and notarized macOS builds for Apple Silicon and
Intel, a signed Windows x64 installer, and a Linux x64 AppImage. A platform is
included in any new release only after its exact artifact passes the native
release gate; each version's [release notes](https://github.com/bnfy/blanc/releases)
and the [platform matrix](./platform-matrix.md) remain the authority for what
that version includes.
