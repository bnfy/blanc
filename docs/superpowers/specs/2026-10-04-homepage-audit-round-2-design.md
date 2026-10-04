# Homepage audit, round 2 — design

**Status:** approved by the owner 2026-10-04.
**Date:** 2026-10-04.
**Baseline:** branch `claude/homepage-audit-fixes` at `aa72b752` (PR #513,
open), which sits on `main` at `d96798fc` (#491). `main` has since gained
`8ec73891` (#512, test-hook timers), which touches no site files. Line
references below are to `aa72b752`.
**Source:** the Oct 4 homepage audit run in the cloud session
`session_019YLtVfD6YJE7eYf36gS1Jr` against `d96798f`, rendered at 1440, 1280,
820 and 390px, in dark mode, with reduced motion, without JavaScript, on a
throttled (~1.6 Mbps) network, with keyboard Tab and axe-core (0 violations).

## 1. Goal

Finish the audit. Round 1 (#513) fixed findings 1–4. This round covers what is
left: phone visitors, small fixes, page weight, readable screenshots on phones,
and the copy changes the owner chose. It adds no app features and changes no
app code.

## 2. Status of the audit findings

| Finding | Status |
|---|---|
| 1. Wallpaper section has no heading | Fixed in #513 |
| 2. Dark-mode switch hidden in the demo; OS setting ignored | Fixed in #513 |
| 3. Blocking undersold (hero, privacy heading and lead) | Copy fixed in #513; "0 ads blocked" captures need the owner (§9) |
| 4. Patron outweighs the download | Order and size fixed in #513; Patron-active captures need the owner (§9); lapse paragraph handled in E5 |
| 5. Phone visitors have nowhere to go | Milestone A |
| 6. Screenshot text unreadable on phones | Milestone D |
| Medium — navigation, hero, closing | Milestone B (except Features link → E7); "Ready to try Blanc?" as `h3` fixed in #513 |
| Medium — switching story, density, repetition | Milestone E; duplicate "Choose your…" headings fixed in #513 |
| Performance | Milestone C |
| Polish | B (target sizes, theme colour, dead script) and C (dead CSS); mixed-release captures in §9 |

## 3. Decisions made by the owner (2026-10-04)

| Topic | Decision |
|---|---|
| Scope | All remaining groups: A+B, C, D and E. |
| Phones | **Share sheet + copy.** On a phone the hero download button becomes "Send to my computer". It opens the phone's share sheet with the download link and falls back to copying it. No data collected; no Worker or privacy-page change. |
| Header | **Keep the solid header; fix the doc.** `site/CLAUDE.md` changes to say the homepage header is solid from the start. |
| Patron lapse paragraph | **Keep it beside the price, tighten the wording** (E5). The policy test stays as is. |
| Phone screenshots | **No device frame + a focused crop** below 760px. |
| Content | All four: switching story, hero lead, trust copy, tighten + navigation. |
| Delivery | **Stacked PRs in order:** #513 → A+B → C → D → E. |

## 4. Delivery

- One PR per milestone, each branched from the one before:
  `claude/homepage-audit-round-2` (this spec, then A+B) → C → D → E.
- After a predecessor squash-merges, merge `main` into the next branch (never
  rebase or force-push), re-run its checks, and push.
- Each PR carries its own claims-ledger updates, tests and a dated note in
  `docs/website-revamp-review.md`.
- Any PR that introduces a new visual choice gets a rendered capture from the
  real site, and an explicit owner yes, before it is pushed.
- Merging never deploys. Production stays a separate `npm run site:deploy`
  with the usual Production/`main`/SHA verification.

## 5. Milestone A+B — phone visitors and small fixes

### A. Phone visitors (finding 5)

**Who counts as a phone.** A new `isHandheld` check, separate from the
existing `os` value in `site/src/scripts/site.js:81-86`:

- the user agent matches `Android|iPhone|iPad|iPod`, or
- it says `Macintosh` and `navigator.maxTouchPoints > 1` (iPadOS reports a
  desktop Mac user agent; today it is treated as `mac`).

`os` keeps its current meaning, so desktop download behaviour does not change.

**What changes on a phone.**

- **Hero button** (`index.astro:93`, the only `data-download-cta`): the label
  becomes "Send to my computer". A short line under it reads "Blanc is a
  desktop browser for macOS, Windows and Linux."
- **Click:** prevent navigation, then
  1. call `navigator.share({ title, text, url })` with
     `https://blancbrowser.com/download`;
  2. if the visitor cancels (`AbortError`), do nothing;
  3. if share is missing or fails for another reason, write the URL with
     `navigator.clipboard.writeText` and announce "Link copied" in a polite
     live region next to the button;
  4. if the clipboard also fails, follow the link to `/download`.
- **`/download`:** a phone-only notice at the top with the same button and
  line. Desktop visitors never see it.
- **No JavaScript:** the button stays a plain link to `/download`.

**Measurement.** The existing consent-gated `download_click` event must not
fire on the share path, because nothing is downloaded. No new analytics event
is added in this round.

**Structure.** The logic lives in a new module,
`site/src/scripts/handheld-download.js`, exporting
`isHandheld(navigator)` and `initHandheldDownload({ document, view })`. It
takes injected globals, like the existing `home-appearance.js` and
`wallpaper-preview.js` modules, so it can be unit-tested.

**Tests (new `test/unit/website-handheld-download.test.js`):** detection for
Android, iPhone, iPadOS desktop UA with touch, a Mac without touch, and
Windows; the share → cancel → copy → navigate fallback chain; the live-region
message; no `download_click` on the share path; desktop untouched.

### B. Small fixes

| # | Fix | Where |
|---|---|---|
| B1 | Style the desktop header "Download" as a pill, like it is on phones. It currently looks like every other link because `.revamp-nav .site-nav-cta` strips its button style. Include the dark-mode variant. *New visual choice: capture before push.* | `revamp.css:201`, `home-appearance.css` |
| B2 | When the hero button downloads directly, say so: "Download for Windows" or "Download for Linux". macOS keeps "Download Blanc" → `/download`, because Apple Silicon and Intel can't be told apart from the user agent. | `site.js:136-141` |
| B3 | The closing platform labels look clickable but aren't. Make each one a link to its card on `/download`: macOS → `#download-options` (two Mac cards), Windows → `#dl-win`, Linux → `#dl-linux`. | `index.astro:626` |
| B4 | Make the homepage's initial theme colour match what the script sets. The header is solid white, so light is `#ffffff`; it is currently `#F8F2E8` until the script runs. Check other page profiles in the plan. | `BaseLayout.astro:37` |
| B5 | Give standalone text links a target of at least 24×24px (WCAG 2.5.8): "About Blanc", "Support", trust links, closing links, footer links. Shared footer, so every page benefits. | `home.css`, `revamp.css` |
| B6 | Delete `site/src/scripts/hero-wallpaper.js`; nothing imports it. | — |
| B7 | `site/CLAUDE.md`: the homepage header is solid from the start (owner decision). | `site/CLAUDE.md` |

**Checks for A+B:** the new unit tests plus the existing site, claim, trust and
Patron tests; site and SEO build; layouts at 1440, 768, 390 and 320px, light
and dark; real-device-width check of the share flow in a mobile-emulated
browser, with share missing so the copy fallback runs.

## 6. Milestone C — page weight

**Baseline (audit, `d96798f`):** 2.3 MB before the first scroll, 4.5 MB total;
on ~1.6 Mbps the headline painted at ~1 s and the page finished at ~11.6 s.
The first task in C is a repeatable measurement script (root `playwright`) for
bytes before first scroll at 1440×900 and 390×844, total bytes after a full
scroll, and throttled load time. The before and after numbers go into the
review doc.

**Goals:** at 390px, at most 1.2 MB before the first scroll; at least 40% less
in total at both widths. The outcome is recorded either way. A miss is reported
with the reason, not hidden.

| # | Change | Notes |
|---|---|---|
| C1 | Load only the visible wallpaper scene; fetch others when selected or next in autoplay. Today all eight (~315 KB) load at once. | Keep `wallpaper-preview.js`'s decode generations and failure handling intact; extend its tests. |
| C2 | Phone-sized images: generate 800w (and where useful 1200w) WebP variants of the large homepage images and serve them with `srcset`/`sizes`. | A script in `site/scripts/` with a `--check` mode so outputs can't drift from sources. Keep the Display P3 ICC profile. |
| C3 | Serve a WebP display copy of `feature-captures/ledger-v1.21.0.png` (780 KB). | That PNG is hash-pinned in `docs/website-captures-v1.21.json`. Keep it unchanged as the full-size link and record the derived copy with its source hash. |
| C4 | Load Inter once. `BaseLayout.astro` and `NativeIslandHero.astro` both import it. | Confirm the cause before changing. |
| C5 | Fetch the shield fallback image once (the audit saw two requests). | Confirm the cause first. |
| C6 | Remove CSS rules whose selectors match nothing in the built site (audit: `.masthead-plan`, `.control-crop`, `.route-list` and repeated `.beat`/`.hero-copy` definitions). | Only selectors proven unused against every built page, not just the homepage. |

Device frames on phones are handled by D, which also stops phones downloading
them (`champagne-desktop-v2.webp`, 726 KiB; `space-black-laptop-v2.webp`,
585 KiB).

## 7. Milestone D — readable screenshots on phones (finding 6)

Below 760px the homepage stops showing device frames and shows a focused crop
of the part that matters, at a readable size.

| Surface | Crop |
|---|---|
| Wallpaper laptop (`index.astro:129-250`, 8 scenes) | Clock, date and favorites row, one crop per phase and appearance, so the slider and theme still swap scenes |
| Start Page layouts (desktop frame, `index.astro:491`) | The layout's main content block |
| Island captures (`island-roman-*`) | The Island bar itself |
| Tab groups (`tab-groups-native.webp`) | The grouped rows |

- **Readable means** the smallest UI text in a crop renders at 11 CSS px or
  more on a 390px viewport.
- **Provenance:** crops are cut by a script from the exact release captures.
  A JSON manifest records each source path and SHA-256, the crop rectangle,
  and the output SHA-256. A unit test checks the manifest against the files,
  so crops cannot drift. After the owner's recapture session (§9), re-running
  the script regenerates them.
- Phones never request the frame images. The plan chooses the mechanism
  (`<picture>` with a media query, or lazy images under `display: none`) and
  proves it in the network log.
- Alt text matches the full capture's description and says it is a detail.
- Each crop is a new visual choice: capture before push.

## 8. Milestone E — content (drafts for owner approval)

Every line below is a draft. Nothing in E ships until the owner approves the
exact wording. Each draft cites wording that is already verified in
`docs/website-revamp-claims-v1.27.json`, or code at `v1.27.0`. Shipping a line
means retiring the old ledger entry with a reason and adding the new one.

**E1. Hero lead** (replaces `revamp-copy-010`)

> Tabs, navigation and page controls fold into one compact Island in a slim
> band, leaving the rest of the window to the page. A desktop browser for
> macOS, Windows and Linux.

Evidence: the same groups as `revamp-copy-010`. This describes the layout and
makes no comparison with other browsers.

**E2. Switching story** (new section between "Everyday browser tools" and the
closing download)

> Kicker: Switching to Blanc
> Heading: Bring your bookmarks and tabs.
> - **Bring your bookmarks.** Import Favorites from a detected browser profile
>   or an HTML bookmarks file. (from `website-115-036`, `website-115-049`)
> - **Bring your tabs.** Bring Your Tabs reads the saved session of a
>   Chromium-based browser profile you choose on this device. (from
>   `trust-125-322`)
> - **Prefer a sidebar?** Switch to vertical tabs in View → Tab Layout. The
>   setting stays on this device. (from `revamp-copy-130`, `revamp-copy-135`)
> - **Make it your default.** First-run setup helps you choose a default
>   browser. (from `website-115-036`)

Each item links to its guide or support answer; the plan confirms the anchors.

**E3. Who builds Blanc** (replaces `revamp-copy-058`)

> Built by Bananify, an independent software studio.

From `trust-125-295`. No personal name or city in marketing copy.

**E4. What Blanc sends** (restructures `revamp-copy-033` and
`revamp-copy-034`, same facts)

> Private tabs and data settings.
> Open a private tab when you choose. Optional connections start only after
> you save your setup choices.
> **What Blanc sends**
> - Usage measurement, preselected: pseudonymous launch and fixed feature-use
>   events to Blanc’s collector, with an optional Google Analytics mirror. No
>   URLs, searches or page contents.
> - Search suggestions, preselected: an eligible prefix you type in the Island
>   goes to your selected search provider.
> - Turn either off before saving, or later in Settings.
>
> Blocking reduces known ads and tracking; coverage is not universal.
> Connections, defaults and security evidence →

The search-suggestion line is from `trust-125-312`; "Turn either off…" is from
`revamp-copy-005`. The list uses the section's body size rather than today's
12px small print.

**E5. Patron lapse paragraph** (replaces `revamp-copy-062`)

> Creating a named workspace requires an active Patron subscription. Renaming
> and removing existing workspaces continue to work if it lapses, and they stay
> openable, switchable and automatically updated.

This still matches both `public-truth.test.js` patterns for `index.astro`
(lines 202–213). The lifetime-supporter sentence is dropped here; it remains in
Support (`support-questions.json`), About, Download and the Workspaces guide.

**E6. Tighter tools section** ("Everyday browser tools", currently ~2,130px
tall)

> 1Password small print (replaces `revamp-copy-053`): Off by default. Needs the
> 1Password app and account on macOS. Setup and shortcuts →
>
> Quiet Tabs small print (replaces `revamp-copy-056`): Quiet pages reload when
> you return to them.

The bodies stay as they are. "When you ask" already covers explicit fill, and
"eligible inactive background pages" covers which pages stay awake. The plan
also proposes a denser layout for this section, which is a visual choice
needing capture before push.

**E7. Features link** — point the header's "Features" at the `/features`
overview instead of `/#features`. `site/src/data/navigation.mjs:3`; update
`site-navigation.test.js` if it pins the old value.

## 9. Owner-machine tasks (outside these PRs)

These need the owner's Mac and public v1.27.0, in one capture session:

- Recapture the wallpaper and gesture screenshots from a real week of browsing,
  so they no longer show "0 ads blocked this week".
- Recapture with Patron active, so the "Upgrade to Blanc Patron" pill
  disappears (about 13 captures; the app hides it when Patron is active).
- Bring every homepage capture to v1.27.0 (today they span v1.21.0, v1.25.0
  and v1.27.0).

After the session, update the capture manifests and re-run D's crop script.

## 10. Out of scope

- An "email me the link" form (would need the Worker, rate limits and a privacy
  change). Can be specced separately later.
- A transparent header (owner chose solid).
- Moving the Patron lapse paragraph off the homepage (owner chose to keep it).
- New analytics events.
- Deploying the site.

## 11. Risks

- **Stacked branches and squash merges.** After each squash-merge, merging
  `main` into the next branch can surface conflicts where the same lines
  changed twice. Mitigation: merge rather than rebase, and re-run every check.
- **iPad detection.** `maxTouchPoints > 1` with a Mac UA also matches a
  touch-screen Mac if one ever ships. The fallback is harmless: the visitor
  gets the share sheet and the link.
- **Claims drift.** Every copy change in A and E updates the ledger in the same
  commit, and the existing ledger tests fail on drift.
- **Image provenance.** Derived images (C2, C3, D) must never replace the
  pinned release captures; they are recorded with their source hash.
