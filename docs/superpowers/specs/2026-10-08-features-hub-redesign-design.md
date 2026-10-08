# Features page redesign — design

**Date:** October 8, 2026
**Page:** `site/src/pages/features.astro` → `https://blancbrowser.com/features`
**Status:** approved direction (C, "Light and dark"); spec awaiting owner review
**Public release the copy describes:** v1.30.0 (`5be79e58d08ca9bcf7cb99b3d8f84c21c654b1c7`)

## Problem

The Features page is 16 text cards of equal weight in a two-up grid. Each card is the
same stack (small kicker, serif heading, grey paragraph, arrow link), so it has no hierarchy,
no imagery, and no motion, and it reads as a default template. Several headings are slogans
("One small control surface. The whole browser.", "a second chance") that the
October 4 explicit-messaging rule in `docs/marketing-claims.md` now forbids: a heading
must name the feature and what it does.

## Decisions already made

| Question | Decision |
|---|---|
| Page's job | Feature first, then index: five large scenes, then a compact visual index of the rest. |
| Overlap with the homepage | New scenes only. The homepage already demos the Island, Start Page wallpaper, tab-group panel, Glance, gestures and the shield sculpture; this page shows what it does not. |
| Visual direction | C, "Light and dark": alternating ink and cream bands for the scenes, a mixed-size tile grid for the index. (Mockup: `.superpowers/brainstorm/…/directions-v2.html`, not committed.) |
| Build technique | Hand-built HTML/CSS mini UIs in Astro components, played by one small script. Not the real app renderer, not video. |
| Copy | Rewrite feature-first. Old reviewed claims are superseded; every new sentence is recorded in a new v1.30.0 claims ledger. |
| Deploy | None. Site deploys are on hold until Blanc Mail is cleared. Work ends at a merged PR. |

## Page structure

Top to bottom. Every element that must survive is listed under **Preserved contract**.

1. **Opening (cream).** Breadcrumb; the approved tagline "A little less browser." as the
   small label; an H1 that names what the page holds; one sentence; a row of chips that
   jump to each feature (anchor links to the ids below, wrapping on narrow screens).
2. **Five scenes, alternating bands.** Ink (`--site-ink-warm` #12100B, gold `--site-gold-on-dark`)
   for scenes 1, 3, 5; cream for 2 and 4. Each scene: feature name label, H2 naming the
   feature and its action, two to three sentences, one qualification line in a smaller
   size, a link to the subpage, a three-step progress control, and the animated stage.
   Copy and stage sit side by side above 720px and alternate sides between scenes.
   1. **Quick Switcher and slash commands** — id `commands` — ink
   2. **Ad and tracker blocking (the shield)** — id `ad-blocking` — cream
   3. **Quiet Tabs** — id `quiet-tabs` — ink
   4. **Reopen Closed Tab** — id `reopen-closed-tabs` — cream
   5. **Private tabs** — id `private-tabs` — ink, using the app's dashed private styling
3. **Index grid of the other eleven** (cream). A four-column grid of tiles in three sizes.
   Every tile has a small decorative illustration (not text alone), an H3 naming the feature
   and its action, one sentence, and is a single link to its subpage.
   - 2×2: The Island (`island`)
   - 2×1: Named Groups (`tab-groups`), Start Page and Mahjong (`start-page`),
     Named Workspaces with its Patron badge (`workspaces`)
   - 1×1: Glance (`glance`), Mouse gestures (`mouse-gestures`), Vertical tabs
     (`vertical-tabs`), Profiles (`profiles`), Sync (`sync`), Security (`security`),
     1Password on macOS (`1password`)
4. **Smaller details** — a slim four-column strip (two columns, then one, on small screens):
   importing Favorites, call controls, recovery and diagnostics, the Plus button.
5. **Patron** — an ink-and-gold band; price, monthly option, Polar link, About link.
6. **Close** — download prompt.

## Scenes: stage contents

Mini UIs mirror the v1.30.0 app's real strings and shapes (verified in
`git show v1.30.0:src/renderer/overlay.html`), drawn in site CSS, not imported from the app.
Sample sites are shown with neutral letter tiles instead of favicons, so no third-party
logos appear. Numbers shown are labelled as sample values where a reader could take them
as measurements.

| Scene | Step 1 | Step 2 | Step 3 (rest state) |
|---|---|---|---|
| Quick Switcher | Island panel opens; "lou" is typed | Results appear, labelled by source: an open tab, a Favorite, a history item, a Named Group | Input becomes "/", the command list shows `/private`, `/find`, `/group`, `/allow-ads` |
| Shield | Resting pill with the shield; blocked count ticks from 0 to a sample value | "Site protection" popover opens: "Ad & tracker blocking **on**", switch, count, "Connection" row | Switch turns off, "Changing site protection reloads this page." is shown |
| Quiet Tabs | Five tab rows in a group, all at full strength | After a visible timer, three background rows dim (quiet); the one playing sound stays full | The pointer opens one dim tab; it returns to full strength with a short reload bar |
| Reopen Closed Tab | A tab row is closed and slides out | The Island's Recently Closed list shows that tab, a group entry ("research · 4 tabs") and an older tab | The tab returns to its place in the row list |
| Private tabs | A regular tab with a history list beside it | ⌘⇧N: the pill turns to the private style (dashed) with its private chip; pages are visited | The history list is unchanged, with no new entries; the chip is highlighted as the way out |

## Scene playback

- **Start.** A scene plays when about 60% of its stage is visible (IntersectionObserver on the stage, so tall stacked bands on phones still trigger), steps
  about 2.5 s apart, once, then rests on step 3.
- **Controls.** The three progress segments are `<button>`s labelled with their step
  captions. Choosing one shows that step and stops autoplay for that scene. A replay
  button appears after the last step. Autoplay runs once for about five seconds, so it
  needs no hover pause (WCAG 2.2.2 applies only past five seconds).
- **No scroll-jacking.** Nothing is sticky or tied to scroll position; scrolling is always native.
- **No JavaScript, or reduced motion.** The server renders each stage at step 3 with every
  step caption visible as plain text. Motion state is added only when
  `prefers-reduced-motion: no-preference` and the scene starts below the viewport (the
  same rule as `src/scripts/reveal.js`), so no visitor meets a blank or hidden stage.
  Switching to reduced motion mid-visit settles every scene on step 3.
- **Accessibility.** Stages are `aria-hidden="true"`; the heading, sentences and step
  captions carry the full meaning without the picture. Step changes are not announced
  (decorative). Focus rings follow the site's hairline `:focus-visible` style. Contrast
  meets WCAG AA in both band colours, including the gold label on ink.
- **Tabs in the background.** Playback pauses when `document.hidden`.

## Responsive behaviour

- ≥ 1080px: as described; stage beside copy; four-column grid.
- 720–1079px: stage beside copy at reduced scale; grid becomes three columns, 2×2 tiles become 2×1.
- < 720px: copy above stage; stages scale down as a unit (fixed internal layout sized in container-query units)
  rather than reflowing;
  grid becomes two columns, then one column below 480px. 16px side gutters, no
  horizontal scroll at 320px.

## Files

| File | Change |
|---|---|
| `site/src/pages/features.astro` | Rewritten markup and copy. |
| `site/src/components/features/FeatureScene.astro` | New. Band wrapper: label, heading, copy, qualification, link, step controls, `<slot>` for the stage. Props: `id`, `tone` (`ink`/`cream`), `side`, step captions, link and tracking data. |
| `site/src/components/features/scenes/*.astro` | New. Five stage components (`QuickSwitcherStage`, `ShieldStage`, `QuietTabsStage`, `ReopenStage`, `PrivateStage`). Each renders all three states in markup; CSS shows the one named by `data-step`. |
| `site/src/components/features/FeatureTile.astro` | New. Tile: size, label, heading, sentence, href, tracking data, `<slot name="art">`. |
| `site/src/styles/features-hub.css` | New, imported only by `features.astro` (as `home.css` is by the homepage). Uses the site tokens in `site.css`; no inline styles. |
| `site/src/scripts/feature-scenes.js` | New, about 3 KB. Playback, controls, reduced-motion and visibility handling. |
| `site/src/styles/site.css` | Remove hub-only rules (`.feature-hub-*`, `.feature-number`, `.feature-row-end`, hub variants of `.feature-patron`/`.feature-close`) after confirming no other page uses them. |
| `docs/website-features-hub-claims-v1.30.json` | New claims ledger (shape of `docs/website-reorder-claims-v1.30.json`). |
| `docs/website-revamp-claims-v1.27.json` | Move each replaced Features-page claim (opening, scene and tile wording among `website-115-012`…`033` and `onepassword-126-022/023`) to `supersededClaims` stubs pointing at the new ledger. Kept wording (`website-115-034`…`042`) stays. Append a reviewed copy update for `features.astro` recording the new prose. |
| `docs/website-reorder-claims-v1.30.json` | Supersede or re-point its two Features-page claims to the new wording. |
| `test/site/feature-expansion.test.mjs` | Update the hub link-order assertion to the new structure and order. |
| `test/unit/website-feature-evidence.test.js` | Add a test for the new ledger, matching the reorder ledger's test. |
| `test/site/features-hub.test.mjs` | New Playwright checks (see Testing). |

## Preserved contract

- `title`, `description`, `ogDescription`, `path="/features"`, `page`, `current` unchanged;
  BreadcrumbList JSON-LD unchanged; `<main id="main-content">`.
- New ids `overview`, `more-features`, `more-features-title` and `details` are added. Every existing id stays on the page: `features-title`, `island`, `1password`,
  `start-page`, `glance`, `ad-blocking`, `private-tabs`, `commands`, `mouse-gestures`,
  `reopen-closed-tabs`, `tab-groups`, `workspaces`, `vertical-tabs`, `quiet-tabs`,
  `profiles`, `sync`, `security`, `small-details-title`, `feature-patron-title`,
  `feature-close-title`. External anchors such as `/features#glance` keep working.
- Every link to the 16 subpages, the Patron checkout and `/download`, with the same
  `data-track`, `data-feature` and `data-cta-position` values as today
  (`feature-hub` for scene and tile links, the existing values for Patron and close).
- "Smaller details that matter." stays as the `#small-details-title` heading (a test reads it).
- The page continues to pass the Newsreader, masthead, footer and canvas checks in `test/site/`.

## Copy

Every sentence below is new or moved and must be recorded in
`docs/website-features-hub-claims-v1.30.json` with evidence at the v1.30.0 tag before merge.
Final wording may be tightened during implementation; any change is re-checked the same way.
Text marked *(kept)* is existing reviewed wording carried over unchanged.

### Opening
- Label: "A little less browser." (approved tagline)
- H1: "Blanc's features, and what each one does for you."
- Sentence: "Five you will use every day are shown up close. The rest follow, one line each. You decide which tabs belong together; Blanc does not sort or group them for you."
- Chips: Quick Switcher · Blocking · Quiet Tabs · Reopen · Private · Island · Groups · Glance · Gestures · Start Page · Workspaces · Sync

### Scenes

**1. Quick Switcher and slash commands** (evidence: `src/renderer/overlay.js`, `copy/slash-commands.json`, `spec/` F-entries for the panel)
- H2: "Press ⌘L to find any tab, or type / to run a command."
- "The Quick Switcher searches your open tabs, Favorites, history and Named Groups as you type, so you can jump to a page without hunting through a tab strip. Type / to see browser commands such as /private, /find, /group and /allow-ads."
- Qualification: "On Windows and Linux, press Ctrl+L. For search text, Enter opens the highlighted result; choose the result showing your exact text to search the web."
- Steps: "Type a few letters." · "Matches come from tabs, Favorites, history and groups." · "Type / for commands."

**2. Ad and tracker blocking** (evidence: `src/main/adblock.js`, `settings-schema/schema.json` default, `src/renderer/overlay.html` shield popover)
- H2: "Block ads and trackers from the first page, with a switch for each site."
- "Blanc Blocker is built in and on by default, using EasyList and EasyPrivacy. Click the shield on the Island to see how many requests it blocked on this page and whether the connection uses HTTPS, or to turn blocking off for just this site."
- Qualification: "Blocking reduces ads and known tracking; no blocker removes all of them. The count shown here is a sample. Prefer uBlock Origin? Choose it from the same shield on supported builds, then restart Blanc."
- Steps: "The shield counts blocked requests." · "Click it for site protection." · "Turn it off for one site; the page reloads."

**3. Quiet Tabs** (evidence: `src/main/tab-sleep.js`, `settings-schema/schema.json`, `docs/marketing-claims.md` Quiet Tabs boundary)
- H2: "Quiet Tabs free up memory without closing the tab."
- "When a background tab has gone unused for an hour (the default), Blanc releases the memory its page was using and dims it in the Island. Open it again and the page reloads with its address, title and back button. Choose 30 minutes, 1 hour, 6 hours or Off in Settings."
- Qualification: "Tabs playing sound, pinned tabs and pages with a half-filled form stay loaded. A quiet tab reloads; it does not resume exactly where the page's scripts left off."
- Steps: "Every tab is loaded." · "Unused background tabs go quiet." · "Open one and it reloads."

**4. Reopen Closed Tab** (evidence: `src/main/closed-tabs.js`, `src/main/main.js` hold/restore, `docs/marketing-claims.md` Reopen boundary)
- H2: "Reopen a closed tab or a whole group, sometimes without a reload."
- "Press ⌘⇧T, type /reopen, or choose from Recently Closed in the Island. For about 30 seconds, one eligible tab you closed can come back without loading again, which can keep its scroll position and the text you were typing."
- Qualification: "On Windows and Linux, press Ctrl+Shift+T. After that window the tab reloads from a saved snapshot or its address. Each window keeps up to 25 entries for an hour, and private tabs are never recorded."
- Steps: "Close a tab." · "Find it in Recently Closed." · "It comes back in place."

**5. Private tabs** (evidence: `src/main/main.js` private session, `src/main/tab-view.js`, privacy page)
- H2: "Private tabs keep your visits out of Blanc's history."
- "Press ⌘⇧N or type /private. Pages you visit are not saved to history, are not restored after a restart, and never appear in Recently Closed. The Island changes so you can see you are private, and its chip closes the tab when you are done."
- Qualification: "On Windows and Linux, press Ctrl+Shift+N. Private does not mean anonymous: websites, your network or an employer can still see activity, and files you download stay on disk."
- Steps: "A regular tab is recorded." · "Open a private tab." · "History stays unchanged."

### Index tiles

Section heading (H2, `#more-features-title`): "More Blanc features."


| Tile | H3 | Sentence |
|---|---|---|
| Island | "The Island puts tabs, search and page controls in one compact bar." | "It replaces the tab strip and toolbar with a slim band above the page. Open it to switch tabs, search or run a command." |
| Named Groups | "Named Groups keep a task's tabs together." | "You name each group and choose its tabs, then fold the others away. Drag tabs and groups into the order you want." (second sentence is existing claim `reorder-130-013`) |
| Start Page | "Choose your Start Page layout, then play Mahjong." | "Pick Ledger, Billboard, Shelf or Tally. Every Start Page footer opens Mahjong, with eight boards and a Daily deal." |
| Named Workspaces (Patron) | "Named Workspaces save a whole window to return to by name." | "Active Patrons can save a window's tabs and groups, kept up to date as they browse. Saved workspaces stay usable if membership ends." |
| Glance | "View two tabs side by side with Glance." | "Open another tab beside your page for a moment, then resize, swap or close it." |
| Mouse gestures | "Navigate with mouse gestures." | "Turn them on in Settings, then hold the right button and draw, or use Alt/Option with a trackpad drag." |
| Vertical tabs | "Show your tabs in an optional vertical list." | "A resizable rail on the left, while the Island stays for search and commands. Drag tabs and groups in the rail to reorder them." (second sentence is existing claim `reorder-130-014`) |
| Profiles | "Profiles keep work and personal browsing apart." | "Each has its own cookies, site data, Favorites and history." |
| Sync | "Sync Favorites and settings across devices." | "Opt-in and end-to-end encrypted, from your Personal profile." |
| Security | "See how Blanc protects the page you are on." | "Sandboxed pages, signed releases, explicit site permissions and Touch ID passkeys on Mac." |
| 1Password (macOS) | "Fill logins from 1Password on macOS." | "Turn it on in Settings, then press ⌥⌘P on a login form." |

### Smaller details, Patron, close
- *(kept)* the four "Smaller details" articles and the "Smaller details that matter." heading.
- *(kept)* Patron copy and price; *(kept)* close heading "A quieter browser is a small download away."

## Claims and copy-guard work

1. Create `docs/website-features-hub-claims-v1.30.json`: `publicRelease` v1.30.0,
   `sourceSha`, `releaseEvidence` `docs/release-incidents/2026-10-07-v1.30.0.md`, one
   evidence group per feature (paths that exist at the tag, plus the qualification that
   must travel with it), and one claim per new sentence with `exactWording`, `source`,
   `evidenceGroups`, `verdict` (`verified` or `qualified`). Kept text keeps its existing claim.
2. In `docs/website-revamp-claims-v1.27.json`, move each replaced Features-page claim
   to `supersededClaims` as `{id, historicalLedger, reason}` (the `reddit-499` precedent),
   naming the new ledger in `reason`.
3. Append one reviewed copy update to the existing `features.astro` entry in
   `retainedFeaturePages.reviewedCopyUpdates` so the prose guard in
   `test/unit/site-navigation.test.js` compares against the reviewed new prose.
4. Re-point or supersede the reorder ledger's two Features-page claims. Confirm whether
   any test reads `docs/website-1password-claims-v1.26.json` against current source; if so, treat it the same way.
5. The reorder test requires every sentence about dragging tabs or groups on this page
   to be recorded; the Named Groups tile sentence must appear in a ledger.

## Testing

- `npm run test:unit` (prose guard, claim ledgers, navigation) — all green.
- `npm run site:build` and the site Playwright suite in `test/site/`.
- New `test/site/features-hub.test.mjs`:
  - all 16 subpage links present, in order, with their tracking attributes;
  - all preserved ids present;
  - with JavaScript disabled, every stage is at step 3 and every step caption is visible;
  - with `reducedMotion: 'reduce'`, no scene ever sets a step other than 3 and no animation runs;
  - with motion allowed, scrolling a scene into view advances it to step 3, and clicking
    step 1 shows step 1 and stops autoplay;
  - no horizontal overflow at 320, 390, 768, 1280 and 1440px widths.
- Visual check in the browser at 1440px and 390px, ink and cream bands, before/after crops
  per the before/after proof format.
- `npm run lint` if any first-party JS lint scope covers `site/src/scripts`.

## Out of scope

- Feature subpages, the homepage, navigation menus and their descriptions.
- Site dark mode (the page stays on the site's cream theme; ink bands are part of the design).
- Deploying. The PR merges; deployment waits for the Blanc Mail hold to clear.
