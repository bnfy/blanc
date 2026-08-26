# Blanc Browser — press fact sheet

Last updated: August 26, 2026

## The short version

**Blanc puts the browser in one small Island.** Search, tabs, named groups,
page controls, and slash commands appear when needed and leave the page alone
when they are not.

Blanc is an independent Chromium-based desktop browser from Bananify. It ships
with built-in ad and tracker blocking, private tabs, Favorites, history,
downloads, a command palette, named tab groups, independent windows, isolated
local profiles, a focused two-page Glance view, optional vertical tabs, Named
Workspaces for Patrons, and end-to-end-encrypted Profile Sync. It does not ship
an AI assistant or an extension runtime.

## Product facts

| Item | Fact |
|---|---|
| Product | Blanc Browser |
| Current public baseline | [1.9.1](https://github.com/bnfy/blanc/releases/tag/v1.9.1) |
| Press-build platform | macOS on Apple Silicon |
| Price | Free |
| Optional support | Blanc Patron subscription, US$30/year or $4/month, plus applicable taxes; unlocks Named Workspaces on every platform and three cosmetic app-icon colorways on macOS. Founding supporters from the earlier one-time purchase keep their benefits permanently |
| Browser engine | Chromium through Electron |
| Default search | DuckDuckGo; Google, Bing, and Brave Search are also available |
| Blocking | Reviewed, hash-pinned EasyList + EasyPrivacy snapshots bundled into each release; browser-level request blocking, cosmetic CSS, and isolated blocker scriptlets |
| Sync | Optional, passphrase-derived end-to-end encryption for Favorites and eligible settings (search engine, blocking state and exceptions, home page, and theme); open-tab sharing is a separate per-device opt-in |
| Publisher | Bananify |
| Website | [blancbrowser.com](https://blancbrowser.com) |
| Press/support/security contact | [support@blancbrowser.com](mailto:support@blancbrowser.com) |

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
- Ad and tracker blocking is integrated at the browser session's network layer;
  it is not dependent on the Chrome Web Store or a user-installed extension.
- Blanc deliberately favors a small, coherent product over an AI agent,
  extension marketplace, or configurable dashboard.

## Measured memory

Measured 9 August 2026 on one Apple Silicon Mac: six ad-dense news sites open in
each browser, fresh profile, no extensions, three runs each, median reported.
The figure is `phys_footprint` summed across every process the browser starts —
not resident set size, which double-counts the engine framework mapped into each
renderer and inflates whichever browser isolates more per site.

| Browser | Memory |
|---|---|
| Blanc | 1.3 GB |
| Brave | 1.7 GB |
| Zen | 3.2 GB |
| Chrome | 5.6 GB |
| Vivaldi | 5.9 GB |

Two qualifications belong with any use of these figures. Brave lands nearest
Blanc because it also blocks by default, which makes it the fair peer rather
than Chrome. And the gap is not only blocking: with Blanc's own blocker switched
off the same pages cost 4.2 GB, still below Chrome's 5.6.

Fresh, extension-free profiles make this a comparison of engines and defaults,
not of anyone's real setup. Raw run:
`bench/memory/results/memory-2026-08-09T17-33-45-039Z.md`; the harness that
produced it is `bench/memory/` in the repository.

## Privacy in precise terms

- On a fresh profile, **Search suggestions** and **Help improve Blanc** are
  both presented on by default. Neither may send before the user saves the
  choices; either can be turned off before continuing or later in Settings.
- Search suggestions can send eligible typed prefixes to the selected search
  provider. They are skipped for private tabs, pasted or dropped text,
  URL-like/local input, and sensitive-looking values, and can be disabled.
- The optional usage ping contains a random install ID, a random per-launch
  session ID, version, platform, architecture, and coarse OS major. It contains no URLs,
  searches, history, or page content and can be disabled in Settings.
- Private tabs use a separate, non-persistent in-memory browser session and stay
  out of Blanc history, session restore, and reopen-closed.
- Profile Sync encrypts data on the device before upload. Open-tab sharing is
  off by default on every device, and private tabs are never included.
- When open-tab sharing is enabled, bounded source-rasterized PNG favicons may
  be uploaded in a separately encrypted sidecar; receiving devices do not
  fetch remote icon URLs merely to draw them.

## Availability note

The public baseline includes signed and notarized macOS builds, a signed
Windows NSIS installer, and a Linux AppImage. A platform is included in any
new release only after its exact artifact passes the native release gate;
release notes and the [platform matrix](./platform-matrix.md) remain the
authority for the architectures included in that specific version.
