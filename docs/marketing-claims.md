# Marketing claim verification

This is the required pre-publication check for Blanc articles, social posts,
ads, demos, outreach, comparisons, press copy, and text embedded in imagery.

## The release boundary

Public product copy describes the **current public release**, not whatever is
present in the working tree. Resolve the public version from `AGENTS.md` and
the matching dated record in `docs/release-incidents/`, then inspect the exact
release tag with `git show vX.Y.Z:<path>`. A feature on `main` is not a public
capability until its release evidence says it shipped.

Use this evidence order:

1. Code, tests, and acceptance evidence at the public release tag.
2. The matching dated release-incident record and published release notes.
3. Public site or press copy only when it belongs to that release and agrees
   with the code. Existing marketing copy is not proof by itself.
4. Current working-tree code only for explicitly labelled previews or future
   plans.

Design specs, implementation plans, mockups, drafts, and unreleased branches
never prove a public capability.

## Required check for every asset

Before drafting, extract every falsifiable product or comparison claim. For
each one, record:

- the exact wording;
- whether it describes Blanc, another product, or an opinion/inference;
- the release-tag code, test, release record, or current first-party external
  source that supports it;
- any qualification that must travel with the claim;
- the verdict: `verified`, `qualified`, `aspirational`, or `remove`.

Do not publish while a material claim is `remove`, while an aspiration reads
as a present capability, or while the evidence describes a different release.

## Explicit feature and benefit message gate

**Standing owner direction, October 4, 2026:** Be explicit throughout the
website and all other Blanc communications. Assume readers are new to Blanc.
They should understand which feature is being discussed, what it does and why
it matters without relying on an image, prior page or familiarity with Blanc.
This applies to headings, supporting copy, social posts, email, release notes,
support replies, demos and product messages.

Use this order for feature messaging:

1. **Feature and action:** name the feature and explain what the user can do.
   Pair an unfamiliar product name with its meaning rather than using it alone.
2. **Concrete benefit:** explain the useful result in plain language. A
   familiar problem can provide context, but must not delay naming the feature.
3. **Qualification and action:** preserve material limits and give an honest
   next step.

Prefer “Choose your Start Page layout” to “Start with a view that suits you,”
“View two tabs with Glance” to “Keep a reference beside your page,” and
“Navigate with mouse gestures” to “Let a small movement take you somewhere.”
Warmth and personality are welcome when the meaning remains clear. Do not
replace a feature explanation with an evocative slogan. The approved brand
tagline remains “A little less browser.”

Do not open with a feature inventory and leave the reader to infer the value.
Do not make internal state vocabulary carry the message: words such as
“quiet,” “awake,” “eligible,” or “renderer” need a plain-language consequence
beside them. A reader should not need to understand browser architecture to
know what is in it for them.
Prefer ordinary cause-and-effect language over a coined slogan: “free up
memory without closing the tab” is clearer than “give the memory back.” Name
only the resource the release evidence supports. Do not broaden a verified
memory behavior into claims about generic resources, CPU use, battery life,
heat, speed, or how hard the computer is working without separate evidence.
Do not turn the emotional payoff into an unsupported speed, productivity,
memory-savings, privacy, security, or wellbeing guarantee. The mechanism and
its qualifications remain subject to the release-backed claim gate above.

## Current Blanc capability boundaries

These boundaries describe public v1.30.0; its scope, publication evidence and
pending adjacent public-feed updater handoffs are recorded in
[the release report](release-incidents/2026-10-07-v1.30.0.md). Installed
candidates keep their original source/artifact bindings; hosted verification
does not establish physical-machine outcomes. The v1.27.0 uBO acceptance, the
v1.28.0 duplicate macOS build number, the v1.29.0 updater confirmations,
historical wallpaper/Linux waivers and earlier updater confirmations remain in
their original reports:

- **Optional uBlock Origin:** Public v1.30.0 offers full uBO 1.75.0 on
  Apple Silicon, native Intel Mac, Windows x64 and Linux x64, on official
  Electron 44.5.1. Click the Island shield to choose a blocker and restart
  Blanc to apply it. Blanc Blocker stays the default and protects private
  tabs; Rosetta uses Blanc Blocker. Profile configuration is separate and
  outside Sync. Filter data can update, while executable resources remain
  pinned to reviewed releases. This does not provide general extension-store
  installation. Keep the [support matrix](ublock-origin-support-matrix-2026-10-03.md)
  and its limits beside broader compatibility claims.
  If uBO fails mid-session, Blanc restarts it automatically (at most three
  times per profile in 10 minutes) while holding requests, then offers a
  manual restart; do not claim uBO can never fail or that pages load
  unfiltered while it restarts.
- **About & Trust:** Settings shows facts about the installed build checked
  on the device and links to the release, verification guide, SBOM and
  provenance. It makes no network request. It does not itself verify the
  Sigstore manifest or prove the build is untampered; do not describe it as
  a security audit.
- **Dark websites:** Off by default and device-local. While Blanc is dark it
  darkens http(s) pages that have no dark mode of their own, using the bundled,
  pinned Dark Reader engine; there is no runtime download. Embedded frames
  keep their original colors. Do not claim every site renders correctly dark,
  that it works while Blanc is light, or that it darkens iframes.
- **Local certificate warnings:** Only local and private-network addresses
  offer Advanced and a way to continue, for that origin and certificate until
  Blanc quits; the choice is never saved or synced. Public sites keep the hard
  stop. Do not describe this as a general certificate bypass.
- **Downloads:** Interrupted downloads offer Resume when Chromium can continue
  them and Retry (http/https) otherwise. Retry restarts from the source URL;
  do not promise that every interrupted download can be completed.
- **Island:** Blanc replaces the permanent horizontal tab strip and
  conventional toolbar with a compact Island. Its resting controls occupy a
  reserved 68px band above the page; its expanded panel overlays the page.
  Do not claim the resting Island floats over the web content or reserves no
  toolbar space. The user opens its panel for navigation, switching, search,
  and commands. Blanc does not understand what the user is working on.
- **Quick Switcher search:** For search text, Enter opens the highlighted
  result, which can be a strong match from tabs, Favorites, history or groups.
  The user can choose the exact-text web-search result explicitly. Do not
  promise that Enter always searches the typed text. Address-shaped input
  navigates unless the user explicitly selects a result.
- **Fresh optional connections:** Search suggestions and usage measurement
  are preselected on in fresh-install setup. Optional sends are gated until
  the user saves their choices; either can be turned off before continuing
  or later in Settings. Saved choices are retained on upgrades. Do not imply
  these features default off or that optional means no network connections.
- **Mouse gestures:** Mouse gestures are disabled by default and configured in
  Settings → General. A physical mouse uses right-button drag; a trackpad uses
  Alt/Option plus a one-finger click-and-drag. Four default directions map to
  Back, Forward, New tab, and Close tab. The user can draw patterns of up to
  three directions and assign Back, Forward, Reload, New tab, Close tab,
  Reopen closed tab, Previous tab, Next tab, or Open Island. The setting and
  assignments are device-local. Do not imply semantic gesture inference,
  touch-screen gestures, or that right-button input works as a trackpad
  trigger on every platform.
- **New-tab shortcut:** The resting Island's Plus creates one regular,
  ungrouped tab and focuses its address field. It stays bare beside the slash
  keycap and is hidden in vertical-tabs mode, where the rail already has a New
  tab control. Do not describe it as creating private or grouped tabs.
- **Named Groups:** The user explicitly creates or assigns a tab to a named
  group through `/group` or the grouping UI. Blanc does not infer group names,
  categorize tabs semantically, or organize them automatically.
- **Drag to reorder:** Since v1.30.0 the user can drag tabs and group headers
  in the expanded Island and in vertical tabs, or use Alt/Option+Shift+Up and
  Down on a focused row or header. A drag can move a tab within its group,
  into another group or out of it, and reorder whole groups; it never changes
  pinned state, and releasing over a page does nothing. Ordering is entirely
  user-directed. The owner hand-tested it on macOS; Windows and Linux are
  covered by hosted automated pointer tests only, so do not claim
  hands-on verification there.
- **Favorites folder picker:** v1.25.0 keeps the move picker above neighboring
  rows and inside the window, with internal scrolling for long folder lists
  and a visible new-folder field. Escape closes the picker and returns focus
  to its move button; a second Escape closes Favorites. Group headings use
  plain labels and count badges. These claims are verified by the exact-tag
  `src/renderer/pages/bookmarks.js`, `src/renderer/pages/pages.css`, and
  `test/desktop/favorites-folder-picker-smoke.mjs`, the published release notes,
  and the 12-layout macOS/Linux regression evidence in the release report.
- **Named Workspaces:** Active Patrons can explicitly save a window or create a
  blank named workspace. A bound workspace saves its tabs and groups as the
  user browses and can later replace the current window's set. This is not
  automatic task detection, an AI workspace, or an agent session.
- **Quiet Tabs:** Eligible inactive background tabs may give back their
  renderer memory and are rebuilt or reloaded when revisited. Dirty,
  uncertain, active, recording, or otherwise ineligible tabs remain awake.
  A quiet tab reloads; it does not promise exact resumption of all live page
  state.
- **Reopen Closed Tab:** Blanc records eligible ordinary tabs in a bounded,
  per-window Recently Closed undo buffer. At most one eligible closed page per
  window may keep its same live view for about 30 seconds; reopening it during
  that window can avoid a reload. After the live hold ends, a still-recent
  entry may fall back to its safe navigation snapshot or URL. Entries expire,
  the buffer is capped, and private tabs never enter Recently Closed. Do not
  promise exact state recovery, permanent retention, or recovery of every tab.
- **1Password on macOS:** The optional integration depends on the installed
  1Password app and account. Blanc may show a small device-local hint when the
  visible page has a current-password field, and Settings can verify the saved
  1Password account identifier. The hint uses bounded structure-only page
  metadata, never field values or page text, and does not contact 1Password.
  Credential lookup and fill remain explicit user actions. This is not
  automatic fill, a general extension runtime, or a Blanc password manager.
- **Mahjong:** Mahjong opens from every start-page footer into its own managed
  tab and offers eight solvable-by-construction boards. Daily rotates across the
  eight layouts. Device-local state remembers the last layout, mode, and deal,
  can offer to continue an unfinished board from another tab, and keeps records
  and daily streaks. The game also includes scoring, timed combos, automatic
  clears, hints, shuffle, undo, and sound controls. Do not describe it as
  online multiplayer, cloud-synced, or
  AI-generated.
- **Call audio buffering:** Automatic, Stable, and Resilient are receive-buffer
  choices for WebRTC calls. Stable targets about 400 ms and Resilient about one
  second, trading responsiveness for more tolerance of choppy playback. Do not
  promise that either mode eliminates every crackle or fixes source-side,
  network, Bluetooth, driver, or hardware faults.
- **Time-of-day wallpaper:** Free and off by default. The start page's Customize popover or
  Settings → General enables bundled Sunrise artwork for dawn (05:00–08:00),
  day (08:00–17:00), dusk (17:00–20:00), and night (20:00–05:00), using the
  device's local clock without location permission or artwork requests.
  It works across all four layouts and private tabs, with two-second fades
  and immediate changes for reduced motion. Optional Sync carries only the
  preference; each device computes its own phase. Physical Windows/Linux
  appearance and lifecycle acceptance was waived, not passed.
- **Linux AppImage:** v1.24.0 removes the host FUSE 2 library dependency and
  fixes sandbox-disabling packaged desktop arguments. Existing integrated
  shortcuts need reintegration. The launcher can still disable Chromium's
  sandbox when its user-namespace capability probe fails. Do not claim that
  every Linux launch is sandboxed or that Michael's machine was verified.
- **Billboard frequently visited sites:** Billboard ranks ordinary browsing
  history on the device and keeps its favicon artwork and hidden-tile choices
  local. Private tabs do not contribute or receive this row. Do not describe
  the feature as synced, account-based, remotely retained, or semantically
  organized.
- **Screen and system-audio sharing:** A site request opens Blanc's centered
  confirmation before capture begins. The user chooses a surface, separately
  approves computer audio, and can stop each share from the Island while its
  tab is in the background. Linux continues into its system chooser. Direct
  and legacy desktop-capture paths remain denied. Do not claim that every
  platform has an identical chooser or broaden tested conference behavior
  beyond the dated release evidence.
- **App icons:** Public v1.21.0 offers Sunrise and Sunrise Dark. Public copy
  must not present app icons as a paid benefit.
- **AI:** Blanc ships no AI assistant or agent browser. It does not understand
  assignments, detect semantic task boundaries, automatically organize tabs
  by meaning, or isolate automated browsing work from a person's session.
- **Bring Your Tabs and open-tab handoff:** Both are available in public
  v1.21.0. They are complementary, not interchangeable. Bring Your Tabs
  starts inside Blanc, reads a user-selected Chromium profile's saved session
  locally, supports selection and Named Group editing, and can preserve eligible
  source groups and pins. The one-time handoff starts in ChatGPT or the
  Firefox/Safari companion and copies only URL, title, order, and active-tab
  status from one live source window into the current Blanc window. It has a
  100-tab limit and a simpler review screen; it does not transfer groups or
  pins. Copy must preserve those distinctions, excluded private/internal tabs,
  and the fact that OpenAI processes selected
  metadata on the ChatGPT path while Firefox/Safari encrypt locally. Do not call
  either path account sync, migration of sessions or logins, an automatic
  import, or an AI browser feature.

Canonical evidence locations include `src/main/main.js`,
`src/renderer/overlay.js`, `src/main/tab-sleep.js`, the matching public release
tag, `site/src/pages/features/`, and the dated release record. Re-check them;
do not copy this file as a substitute for verification after the product
changes.

## Language that requires rejection or qualification

Do not use present-tense wording such as:

- "Blanc understands the assignment/task/context";
- "Blanc automatically organizes or groups your tabs";
- "Blanc gives every task its own AI workspace";
- "Blanc isolates agent browsing from your browser";
- "Quiet Tabs resumes every page exactly where you left it";
- unqualified superiority, privacy, security, or memory claims.

An editorial opinion may discuss what browsers *should* do, but the transition
to Blanc must state what Blanc actually does today and must not imply that the
opinion is an implemented capability.

## External comparisons

Use current first-party documentation for another product's behavior,
availability, price, privacy, or architecture. Record the source and access
date. If the source supports only part of the statement, narrow the copy.
Clearly label inferences. Never infer architecture from a screenshot, launch
post, third-party summary, or the name of a feature.

## Imagery and demos

Text inside an image is a product claim and follows the same gate. Product UI
must come from the current public build or a clearly labelled preview build.
Do not let generated imagery invent controls, automatic behavior, names, or
states that Blanc does not ship.

Visual identity follows `docs/brand-usage.md`, including its explicit
website-only Sunrise palette and mark treatments. Outside those website
exceptions, the Blanc mark is black on white or white on black and is never
placed on, inside, or visually backed by an accent-colored treatment.
