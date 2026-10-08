# Features page as an Apple-style bento board — design

**Date:** October 8, 2026
**Page:** `site/src/pages/features.astro` → `https://blancbrowser.com/features`
**Status:** direction approved from the interactive prototype (v3); spec awaiting owner review
**Supersedes:** `2026-10-08-features-hub-redesign-design.md` (scenes direction, abandoned before merge)
**Public release the copy describes:** v1.30.1 (`9e337ac583e81bae509cfc970b9d97a81f3287ba`); first verified at v1.30.0, re-pinned after the fix-only v1.30.1 release

## Goal

Replace the 16 identical text cards on `/features` with a compact bento board in the style
of Apple's WWDC feature-summary slides: a visual-first masonry board of 15 tiles around a
Sunrise "Blanc" hero, then a dense grid of 18 small icon tiles. Clicking any tile opens a
popover that grows out of the tile and shows a visual (a still or a short looping demo) with
the explainer text and a link to the feature's own page.

## Design system (measured from Apple's slides)

Measured on three 2000px WWDC 2025 bento slides (iOS, the dense "everything else" grid,
tvOS) and normalised to the board width **W** (max 1220px; `calc(100vw - 48px)` below that).

| Property | Apple | Blanc |
|---|---|---|
| Canvas vs tile | `#EBEBEB` canvas, `#FFFFFF` tiles, ~1.2:1 luminance, **no shadows** | the page background (`--site-bg`) directly behind `#FFFFFF` tiles, no separate band; no shadows |
| Gutter and outer margin | 0.9% W, equal | `calc(W * .009)` (11px at 1220) |
| Corner radius | 2% W | `calc(W * .02)` (24px) |
| Columns | 1 : 1 : 1.36 : 1.36 : 1 : 1 | identical |
| Rows | 12-unit masonry; each column pair stacks its own heights (left 5+3+4, centre 4+4+2+2 / 4+4+4, right 4+5+3) | same, except the right column is 4+4+4 so the two small right tiles fit two-line labels; board `aspect-ratio: 2000 / 1100` |
| Label | one size for every tile, 1.25% W, weight 500, near-black, centred; bottom on white tiles, top (white) on full-bleed tiles | `max(15px, W * .0128)` / 500, `--site-text`; same placement rule |
| Main visual | object or icon ≈ 50% of tile width, centred, generous air | same |
| Display tiles | bold 700, 2.2% W, leading ≈ 1.0, one saturated accent; secondary lines fade in size and opacity | Inter 700 at `W * .022`, Sunrise accent gradient `#C2661C → #7A4512` |
| Hero mark | product name ≈ 7% W | the full-color Sunrise mark (`demo-assets/sunrise-mark.png`, verbatim) at `W * .11` over the Sunrise art, `alt="Blanc"` |
| Colour budget | about one third full-bleed colour or photo tiles | 5 of 15 (Island, hero, Mahjong, Private, Named Workspaces) |
| Dense grid | 6 columns, tile 307:162, gap 1.2% W, radius 1.5% W, colored icon box 18% of tile width top-left, 2-line label bottom-left | identical proportions, but a monochrome ink stroke icon (`max(22px, W * .02)`, no box) top-left; label `max(13.5px, W * .0118)` / 500 |
| Legibility | product UI crops shown at reading size; whole screens only where the device is the picture | mini UI never below 11.5px; whole captures only for Glance and the wallpaper |

Contrast: every label meets WCAG AA for its size against its own tile (dark text on the gold
Named Workspaces tile, white text only on ink or dark photo, with a gradient scrim behind
labels on photos). The accent gradient is used only at display sizes (≥ 24px bold, large-text
AA ≥ 3:1).

Typography: tile labels, display tiles and the dense grid are Inter, as Apple's are SF. The
page H1, every section H2 and every popover H2 stay Newsreader 400 (the site's display rule,
enforced by `test/site/newsreader-reach.test.mjs`).

## Board layout (desktop)

| Area | Tile | Treatment | Visual |
|---|---|---|---|
| L1 (cols 1–2, rows 1–5) | Glance | white, label bottom | whole `feature-captures/glance` capture, contained |
| L2 (col 1, rows 6–8) | Ad and tracker blocking | white | `blocker-shield-bronze.webp` at 50% width |
| L3 (col 2, rows 6–8) | Mahjong | full-bleed photo, label top white over scrim | `mahjong-v1.21.0.webp`, cover |
| L4 (col 1, rows 9–12) | Private tabs | full-bleed ink, label top white | dashed private pill + "History stays untouched" |
| L5 (col 2, rows 9–12) | Profiles | white, display text | people icon + display line |
| C1 (cols 3–4, rows 1–4) | The Island | full-bleed photo, title bottom white | `revamp/island-roman-rest-800.webp`, cover |
| C2 (cols 3–4, rows 5–8) | Blanc (hero) | full-bleed Sunrise art | `feature-hub/sunrise-hero.webp` + full-color Sunrise mark |
| C3 (col 3, rows 9–10) | Quick Switcher | white, gradient title + label | none |
| C4 (col 3, rows 11–12) | Slash commands | full-bleed ink, label top white | command chips |
| C5 (col 4, rows 9–12) | Start Page layouts | white, fading list | layout names around the display line |
| R1 (col 5, rows 1–4) | Quiet Tabs | white | mini tab list whose background rows dim |
| R2 (col 6, rows 1–4) | Time-of-day Start Page | photo, label bottom over cream fade | dawn wallpaper capture crop |
| R3 (cols 5–6, rows 5–8) | Reopen Closed Tab | white | mini panel with "recently closed" |
| R4 (col 5, rows 9–12) | Named Groups | white | group chips |
| R5 (col 6, rows 9–12) | Named Workspaces (Patron) | gold gradient, dark label | workspace bubble |

Below 900px the board becomes a two-column flow (`grid-auto-rows: 200px`), with L1, C1, C2
and R3 spanning both columns; the dense grid becomes two columns. Side gutters are 16px and
the page never scrolls sideways at 320px.

## Interaction

**Progressive enhancement.** Every tile is an `<a href="/features/<page>">` (or `/download`
for the hero, and the closest guide for small tiles). Without script, a tile is a link.
`feature-bento.js` intercepts plain left clicks and Enter/Space (never modified clicks such as
⌘-click or middle-click) and opens the popover instead.

**Popover.** One shared native `<dialog>` holds one server-rendered `<article>` per feature
(`hidden` until shown), so every explainer is in the page HTML for search engines and the
prose guard. Opening:
- the card grows from the tile's rectangle to the centre with a critically damped spring
  (damping 1.0, response 0.42 s), expressed as a CSS `linear()` easing via the Web Animations
  API; the source tile is hidden while its card is open, so the card reads as the tile;
- the scrim fades in with `backdrop-filter: blur(16px) saturate(140%)`;
- the article content fades in 140 ms after the card starts moving.

Closing (✕, Escape, scrim click) shrinks the card back to its tile from the card's current
on-screen transform, so a close during the opening animation reverses smoothly. Focus returns
to the tile. ← / → (and Previous/Next buttons) move between features in board order, then the
dense grid, wrapping; the content cross-fades 16px in the direction of travel and the "source"
tile updates so a later close returns to the right tile.

**Demos.** Five popovers play a three-step loop every 2.2 s while open: Quick Switcher
(placeholder → matches → commands), blocking (Site protection on nytimes.com → Choose a blocker with Blanc Blocker active → uBlock Origin selected, beside the turning 3D Blocker shield), Quiet Tabs
(loaded → background rows dim → one reloads), Reopen (close → Recently Closed → restored),
private tabs (regular → private pill → history unchanged). Demos stop when the popover closes
or the page is hidden. All other popovers show a still.

**Deep links.** Opening a popover sets the URL hash to the feature id with
`history.replaceState`; closing clears it. Loading `/features#<id>` opens that popover once
the page is ready (after scrolling its tile into view). All existing anchor ids remain on the
tiles, so no-script anchors still scroll to the right place.

**Reduced motion.** No spring, scale or slide: the dialog cross-fades in 180 ms, demos do not
loop (they rest on step 3), the Quiet Tabs tile does not pulse, and the caret does not blink.
`prefers-reduced-transparency: reduce` removes the scrim blur and raises its opacity.

**Analytics.** Tiles carry `data-track="feature_cta_click"`, `data-feature` and
`data-cta-position="feature-hub"`, which is what a navigating click (no script, or a modified
click) records. When the script opens the popover instead, it renames that click
`feature_popover_open` for site.js and then restores the attribute. The popover's link carries
`data-track="feature_cta_click"`, `data-feature` and `data-cta-position="feature-popover"`.
Patron and download links keep their existing attributes.

**Accessibility notes.** `aria-haspopup="dialog"` is added by the script, so tiles without
script are announced as plain links. Focus rings are a 1px hairline. A dialog closed by the
browser without a `cancel` event (Chrome's close watcher, e.g. after a deep link) runs the same
cleanup as a normal close. The Quiet Tabs tile's ambient animation runs only while the tile is
on screen.

## Copy

Every sentence is recorded in `docs/website-features-bento-claims-v1.30.json` with evidence
at the v1.30.1 tag. After any copy edit, rerun `npm run site:features-ledger`
(`scripts/build-features-bento-ledger.mjs`), which rewrites that ledger and the reviewed copy
update idempotently. Tile labels name the feature and its benefit (the October 4
explicit-messaging rule overrides Apple's two-word labels where they would leave a coined name
unexplained). Text marked *(kept)* is reviewed wording carried over unchanged.

### Page

- H1: "Everything in Blanc."
- Lead: "Click any feature to see it and read what it does. You decide which tabs belong together; Blanc does not sort or group them for you."
- Board heading (visually hidden H2, Newsreader): "Blanc’s main features."
- Dense-grid H2 (keeps `#small-details-title`): *(kept)* "Smaller details that matter."
- Patron section and download close: *(kept)*.

### Board tiles and popovers

| Tile id → guide | Tile text | Popover H2 | Popover body | Popover note |
|---|---|---|---|---|
| `glance` → glance | View two tabs side by side with Glance | View two tabs side by side with Glance. | Choose another tab from this window to open beside your page. Drag the divider to resize, swap the two sides, or close the reference when you are done. | Glance is never restored after a restart or synced. |
| `ad-blocking` → ad-blocking | Ads and trackers blocked by default | Ads and trackers blocked. Your choice of blocker. | Blanc Blocker works from the first page you open, with nothing to install. Want more control? Switch to the full uBlock Origin from the same shield. | uBlock Origin is available on supported builds and applies after a restart. Private tabs always use Blanc Blocker. The 24 shown was measured on nytimes.com in Blanc 1.30.1. (Split popover: native Island and shield popover left, turning 3D shield above the copy right. Count measured with `scripts/measure-installed-blocked-count.mjs`, recorded in `docs/website-blocking-count-v1.30.1.json`.) |
| `mahjong` → start-page | Take a break to play Mahjong | Play Mahjong from any Start Page. | Every Start Page footer opens Mahjong in its own tab, with eight boards, a Daily deal, hints, undo and records kept on this device. | Mahjong is offline and single-player; nothing is synced. |
| `private-tabs` → private-tabs | Private tabs stay out of history · *History stays untouched* | Private tabs keep your visits out of Blanc’s history. | Press ⌘⇧N or type /private. Pages you visit are not saved to history, are not restored after a restart, and never appear in Recently Closed. The Island changes so you can see you are private, and its chip closes the tab when you are done. | On Windows and Linux, press Ctrl+Shift+N. Private does not mean anonymous: websites, your network or an employer can still see activity, and files you download stay on disk. |
| `profiles` → profiles | Profiles keep work and personal apart | Profiles keep work and personal browsing apart. | Create named profiles, each with its own cookies, site data, Favorites, history, download list and remembered permissions, opening in its own windows. | Settings and Patron are shared by every profile on this device. |
| `island` → island | The Island · *Tabs, search and page controls in one bar* | The Island puts tabs, search and page controls in one compact bar. | Blanc replaces the tab strip and toolbar with one Island in a slim band above the page. Open it to switch tabs, search or run a command, then close it to get back to the page. | The resting Island keeps its own band above the page; the panel opens over the page. |
| `blanc` → /download | (Sunrise mark, alt “Blanc”) | A little less browser. | Blanc is a desktop browser for macOS, Windows and Linux that keeps its controls in one small Island, blocks ads and trackers by default, and stays out of the way of the page you came for. It is free and open source. | Built by Bananify, an independent studio. |
| `commands` → command-palette | Quick Switcher · *Press ⌘L to find any tab* | Press ⌘L to find any tab, or type / to run a command. | The Quick Switcher searches your open tabs, Favorites, history and Named Groups as you type, so you can jump to a page without hunting through a tab strip. | On Windows and Linux, press Ctrl+L. For search text, Enter opens the highlighted result; choose the result showing your exact text to search the web. |
| `slash-commands` → command-palette | Type / to run commands | Type / to run a browser command. | In the Island, type / to see every command, then keep typing to narrow the list: /private opens a private tab, /group moves this tab into a group, /sleep quiets background tabs and /allow-ads lets one site through. | Commands act only when you choose them. |
| `start-page` → start-page | Four Start Page layouts (Ledger, Billboard, Shelf, Tally fade around it) | Choose your Start Page layout. | Pick Ledger, Billboard, Shelf or Tally for new tabs. Billboard brings your frequent sites from local history, and Tally puts a big clock front and centre. | Your layout choice can follow you through Sync; history stays on this device. |
| `quiet-tabs` → quiet-tabs | Quiet Tabs free up memory | Quiet Tabs free up memory without closing the tab. | When a background tab has gone unused for an hour (the default), Blanc releases the memory its page was using and dims it in the Island. Open it again and the page reloads with its address, title and back button. Choose 30 minutes, 1 hour, 6 hours or Off in Settings. | Tabs playing sound, pinned tabs and pages with a half-filled form stay loaded. A quiet tab reloads; it does not resume exactly where the page’s scripts left off. |
| `wallpaper` → start-page | A Start Page that follows the time of day | A Start Page that follows the time of day. | Turn on time-of-day wallpaper in Settings → General, and the Start Page artwork moves through dawn, day, dusk and night with your computer’s clock. | When Sync is on, the on/off choice follows you to your other devices; the artwork always follows each computer’s own clock. |
| `reopen-closed-tabs` → reopen-closed-tabs | Reopen closed tabs, even whole groups | Reopen a closed tab or a whole group, sometimes without a reload. | Press ⌘⇧T, type /reopen, or choose from Recently Closed in the Island. For about 30 seconds, one eligible tab you closed can come back without loading again, which can keep its scroll position and the text you were typing. | On Windows and Linux, press Ctrl+Shift+T. After that window the tab reloads from a saved snapshot or its address. Each window keeps up to 25 entries for an hour, and private tabs are never recorded. |
| `tab-groups` → tab-groups | Named Groups keep tasks together | Named Groups keep a task’s tabs together. | Create a group with /group and a name, or from a tab’s right-click menu. The Island shows the current group’s tabs as dots, and other groups fold away in the ⌘L panel. Drag tabs and groups into the order you want. | You name and fill every group. Blanc never sorts or groups tabs for you. |
| `workspaces` → workspaces | Named Workspaces save whole windows · *Patron* | Named Workspaces save a whole window to return to by name. | Save a window’s tabs and groups as a Named Workspace and switch back to it later by name. A saved workspace keeps itself up to date as you browse. | Creating and saving workspaces needs an active Patron membership. Saved workspaces stay usable if it ends. |

### Dense grid tiles and popovers

| Tile id → guide | Icon | Tile label | Popover H2 | Popover body | Note |
|---|---|---|---|---|---|
| `sync` → sync | lock | Encrypted sync across devices | Sync Favorites and settings across your devices. | Turn on Sync from your Personal profile to carry Favorites and settings to your other devices, and optionally see what each device has open. It is end-to-end encrypted. | History, cookies and private tabs are never synced. |
| `vertical-tabs` → vertical-tabs | rail | Optional vertical tab rail | Show your tabs in an optional vertical list. | Turn on the vertical tab rail for a resizable overview on the left. Drag tabs and groups in the rail to reorder them. The Island stays for search and commands. | The rail is optional; the Island is always there. |
| `mouse-gestures` → mouse-gestures | mouse | Mouse gestures | Navigate with mouse gestures. | Turn them on in Settings, then hold the right mouse button and draw, or hold Alt/Option and drag with one finger on a trackpad. Assign your own patterns to Back, Forward, Reload and more. | Gestures are off until you turn them on, and they stay on this device. |
| `1password` → 1password | key | 1Password fill on Mac | Fill logins from 1Password on macOS. | Turn on the integration in Settings, then press ⌥⌘P on a login form to fill a matching login from your installed 1Password app. | macOS only. Blanc never fills anything automatically. |
| `ublock-origin` → ad-blocking | shield | Full uBlock Origin, optional | Prefer uBlock Origin? Choose it from the shield. | Click the shield on the Island, choose uBlock Origin, then restart Blanc. You get its popup, dashboard, logger, element picker and filter lists for regular tabs. | Private tabs always use Blanc Blocker. Available on supported Mac, Windows and Linux builds. |
| `dark-websites` → ad-blocking | moon | Dark websites | Darken websites that have no dark mode. | Turn on Dark websites while Blanc is dark, and pages without their own dark mode are darkened as they load. Switch it per site from the shield. | Off by default. Embedded frames keep their colors. |
| `passkeys` → security | fingerprint | Touch ID passkeys on Mac | Sign in with passkeys and Touch ID on a Mac. | On a Mac, Blanc can create passkeys secured by Touch ID that stay on your device. | Blanc passkeys do not read passkeys saved in other apps. |
| `drag-to-reorder` → tab-groups | up-down arrows | Drag tabs into order | Drag tabs and groups into the order you want. | In the Island panel or the vertical rail, drag a tab within its group, into another group or out of one, or drag a group header to move the whole group. | On a Mac, press Option+Shift+Up or Down; on Windows and Linux, Alt+Shift+Up or Down. |
| `import` → (support#bookmark-import) | bookmark with arrow | Import your bookmarks | Bring your Favorites with you. | Import bookmarks from a browser profile Blanc detects, or from an HTML file, in Favorites. | Importing happens on your device. |
| `capture` → security | mic | Camera and mic indicator | See and stop camera and microphone use. | The Island shows when a page is using your microphone or camera, and its popover can stop access. | Sites must ask before they can use either. |
| `recovery` → security | restore | Restore after a crash | Choose how to recover after a crash. | After an unclean shutdown, choose whether to restore your tabs or start fresh. | Settings can also export local diagnostics for you to review before sharing. |
| `downloads` → (none; tile links to /support) | download | Resume downloads | Pick up interrupted downloads. | Interrupted downloads offer Resume when they can continue, and Retry when they need to start again. | Not every interrupted download can be completed. |
| `search-engine` → command-palette | search | Choose your search engine | Search with DuckDuckGo, Google, Bing or Brave. | Pick your search engine in Settings. Search suggestions can be turned off at any time. | Suggestions are optional. |
| `pin-mute` → island | pin | Pin and mute tabs | Pin the tabs you keep and mute the ones that play. | Type /pin to keep a tab first in its group, and /mute to silence a noisy one. | Pinned tabs stay loaded. |
| `default-browser` → (download) | globe | Set Blanc as default browser | Make Blanc your default browser. | First-run setup helps you choose a default browser, and Settings has a Make default button at any time. | On Windows, Blanc opens the system Default apps page for you to confirm. |
| `security` → security | cube | Sandboxed pages | Every page runs in a sandbox. | Pages run in Chromium’s sandbox, and sites must ask before using your camera, microphone, location or notifications. | Read the security page for what each protection covers. |
| `signed-releases` → security | check circle | Signed, verifiable releases | Check the download you got. | Mac and Windows releases are signed, Mac builds are notarized, and every release ships a signed checksum manifest you can verify. | The verification guide walks through each step. |
| `themes` → island | half circle | Light, dark or system | A look that follows your computer. | Choose light, dark or system, and Blanc’s own pages change with it. Change it in Settings or with /theme. | Websites that follow the system theme change too. |

Popover links: "Read more about <feature>" to the guide named in the table; tiles with
"(none)" have no popover link; `import` links to `/support#bookmark-import`; `default-browser` links
to `/download`.

## Assets

Only images already published on the site are used, unchanged in content:
`feature-captures/glance.png`, `mahjong-v1.21.0.webp`, `home-wallpaper-dawn-v1.25.0.webp`,
the four Start Page layout captures (popover), `revamp/island-roman-{rest,tabs,command}-800.webp`,
`blocker-shield-bronze.webp`, and `demo-assets/start-page-sunrise.png`.

Two derived files are added under `site/public/feature-hub/` to keep the page light, made with
`sharp` and recorded in a README there: `sunrise-hero.webp` (from `start-page-sunrise.png`,
1600px wide, quality 82) and `glance.webp` (from `feature-captures/glance.png`, 1440px,
quality 85). Framing is CSS-only: `object-fit: contain` for whole captures, `object-fit: cover`
with a per-tile `object-position` class for full-bleed photos.
Images below the first screen use `loading="lazy"` and carry `width`/`height`.

Before merge, each reused capture is compared against v1.30.0; any that now misrepresents the
interface is replaced or removed rather than shipped.

**Capture review (October 8, 2026).** Every reused image is already published on another live
page (guides, press page or homepage). `glance.png` (v1.15.0) is kept: the Glance header it
shows (Make main, Change, Close) is identical at v1.30.0, and the rest is website content.
`profiles.png` and `workspaces.png` (v1.15.0) are not used in popovers: the first shows the
pre-Sunrise Settings sheet, the second shows a v1.15.0 version string and the older Start Page.
Their popovers use small replicas built from v1.30.0 strings instead (`settings.html`,
`settings.js`, and the `/workspace` hint in `overlay.js`). Refreshing those guide-page captures
is a separate task.

## Components and files

| File | Responsibility |
|---|---|
| `site/src/pages/features.astro` | Page, all copy (tile text and popover articles as literal markup). |
| `site/src/components/bento/BentoTile.astro` | Board tile: an `<a>` with area class, tone, label position; slots `visual` and default (label). |
| `site/src/components/bento/BentoSmall.astro` | Dense-grid tile: `<a>` with icon and label. |
| `site/src/components/bento/BentoIcon.astro` | The 19 monochrome stroke icons (original geometry; Apple's Touch ID SF Symbol is not licensed for web use). Only the Profiles tile's mark sits on a dark tile. |
| `site/src/components/bento/FeaturePop.astro` | One popover article: visual slot, label, H2, body slot, link. |
| `site/src/components/bento/demos/*.astro` | Five demo stages (Switcher, Shield, Quiet, Reopen, Private) using `data-step` / `data-at` / `data-dim`. |
| `site/src/styles/features-bento.css` | All page styles and tokens above; imported only by `features.astro`. |
| `site/src/scripts/feature-bento.js` | Popover open/close/navigation, hash, demo loop, reduced motion. |
| `site/public/feature-hub/*` | Two derived images + README. |
| `site/src/styles/site.css` | Remove hub-only rules (`.feature-hub-*`, `.feature-number`, `.feature-row-end`, `.feature-label`, `.feature-patron*`, `.feature-hero--hub`). |
| `docs/website-features-bento-claims-v1.30.json` | New claim ledger. |
| `docs/website-revamp-claims-v1.27.json` | Supersede replaced Features-page claims; append the reviewed copy update. |
| `test/site/features-bento.test.mjs` | New Playwright suite. |
| `test/site/feature-expansion.test.mjs` | Update the hub link assertion. |
| `test/unit/website-feature-evidence.test.js` | Ledger test for the new file. |

## Preserved contract

- `title`, `description`, `ogDescription`, `path`, `page`, `current`, BreadcrumbList JSON-LD,
  `<main id="main-content">` unchanged.
- Every existing id remains: `features-title`, `island`, `1password`, `start-page`, `glance`,
  `ad-blocking`, `private-tabs`, `commands`, `mouse-gestures`, `reopen-closed-tabs`,
  `tab-groups`, `workspaces`, `vertical-tabs`, `quiet-tabs`, `profiles`, `sync`, `security`,
  `small-details-title`, `feature-patron-title`, `feature-close-title`. Each guide id sits on
  its tile; the dense-grid sandbox tile carries `security`. Popover articles use `pop-<id>`.
- Links to all 16 guides remain on the page (in tiles without script and in popovers).
- Patron and download sections and their tracking attributes unchanged.

## Testing

- `npm run test:unit`: prose guard, ids and metadata (`site-navigation.test.js`) and the
  ledgers (`website-feature-evidence.test.js`).
- `npm run site:build`, then the Playwright suites against `astro preview` on 4322:
  - `features-bento.test.mjs`: ids; every tile is a link to its guide with tracking attributes;
    with script disabled, tiles navigate and every popover article is in the HTML; with script,
    clicking a tile opens the dialog showing that article, Escape closes it and focus returns
    to the tile; ← / → move to the neighbouring feature; ⌘-click is not intercepted;
    `/features#glance` opens Glance; with reduced motion the card has no transform animation
    and demos rest on step 3; computed tokens match the design system at 1220px (label font
    size, gutter, radius, no `box-shadow` on tiles); no horizontal overflow at 320, 390, 768,
    1280, 1440.
  - `feature-expansion`, `newsreader-reach`, `masthead`, `footer`, `crawl-hygiene`.
- Visual review at 1440 and 390 against the v3 prototype, with before/after crops.

## Out of scope

Feature guide pages, the homepage, navigation menus, site dark mode, deployment (site
deploys are on hold for Blanc Mail).
