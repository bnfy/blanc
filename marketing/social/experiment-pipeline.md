# Blanc social experiment pipeline

Last release check: `v1.10.0`, August 30, 2026.

This pipeline exists to prevent Blanc's small content library from collapsing
into repeated tab-count posts. It is not a publication schedule and grants no
approval to post. Every public action still requires Anthony's explicit
approval in the active Codex thread and a final freshness, duplicate, claim,
brand, crop, and destination check.

## Operating mix

- **Conversation:** casual replies that earn profile visits without pitching.
- **Position:** a clear point of view about a real browser tension.
- **Benefit:** the relief or better experience a person gets, stated before
  the feature that creates it.
- **Proof:** current-release product behavior shown, not merely described.
- **Founder/build:** what Blanc chose and why, without inventing a user story.

No platform should receive the same caption and crop by default. A campaign is
one idea with native executions, not six identical uploads.

## Substack editorial lane

Substack now carries a distinct privacy, power, and browser-incentives lane for
technically literate readers. Its claim ledger, article sequence, Note prompts,
and comparison rules are in
[`substack-privacy-editorial-lane-2026-08-30.md`](substack-privacy-editorial-lane-2026-08-30.md).
The lead thesis is: **a browser's business model is part of the browser**.
Do not describe Blanc's launch ping as opt-in: a fresh install asks before the
first ping, but the choice is presented on and can be disabled before continuing
or later. No draft in that lane is approved for publication.

## Next eight distinct experiments

### 1. Quiet Tabs — free up memory without closing tabs

- **Primary native format:** Instagram and Facebook four-slide carousel.
- **Secondary test:** one short X clip made from a real v1.9.1 interaction,
  only after the carousel has produced a baseline.
- **User tension:** people are often done with a page for now without being
  ready to lose the useful context it represents.
- **Emotional payoff:** stop making the laptop keep every inactive page
  running just to preserve the tabs a person may still need.
- **Hook:** `your laptop has enough to do.`
- **Proof required:** show the Settings delay and one real tab reloading after
  it goes quiet; never imply exact live-state resumption or numeric savings.
- **Evidence:** `v1.9.1:src/main/tab-sleep.js`,
  `v1.9.1:site/src/pages/features/quiet-tabs.astro`.
- **Existing asset:** `quiet-tabs-carousel/`; do not adapt the same frames into
  a Reel without a genuinely new demonstration.

### 2. Island by default, tab rail by choice

- **Primary native format:** Threads question plus a new X side-by-side clip.
- **Secondary test:** Substack Note explaining why Blanc ships both layouts.
- **User tension:** some sessions need a persistent list; others need the page
  to keep the room.
- **Hook:** `the default can be quiet without making the overview disappear.`
- **Proof required:** switch View → Tab Layout → Vertical Tabs and back in the
  current public build, showing that the page does not reload and navigation
  remains in the Island.
- **Evidence:** `v1.9.1:site/src/pages/features/vertical-tabs.astro`.
- **Guardrail:** do not claim Blanc has no vertical tabs or no persistent tab
  view. The Island layout is the default; the vertical rail is optional.
- **Campaign brief:** [`island-or-rail/README.md`](island-or-rail/README.md).

### 3. One shortcut through the whole session

- **Primary native format:** 8–12 second TikTok/Reel recorded from v1.9.1.
- **Secondary test:** GIF or short clip on X and Threads.
- **User tension:** finding a tab, favorite, history item, group, or browser
  command should not require five separate surfaces.
- **Hook:** `cmd-l. type a few letters. go.`
- **Proof required:** one uncut interaction matching an open tab, a favorite,
  and a named group, followed by a slash command. Do not imply semantic or AI
  matching.
- **Evidence:** `v1.9.1:site/src/pages/features/command-palette.astro`.
- **Campaign brief:**
  [`quick-switcher-campaign-brief-2026-08-29.md`](quick-switcher-campaign-brief-2026-08-29.md).
  Storyboard and six platform-native executions are prepared but not approved
  for capture, rendering, or publication.

### 4. Groups have names, not colors

- **Primary native format:** Instagram carousel and a conversation-first
  Threads post asking what people would name their current group.
- **Secondary test:** fuller Facebook explanation.
- **User tension:** color coding still asks the user to remember what every
  color meant; a name states the task directly.
- **Hook:** `what would you call the tabs in front of you right now?`
- **Proof required:** user explicitly creates or assigns the group. Never say
  Blanc infers a task, chooses a name, or organizes tabs automatically.
- **Evidence:** `v1.9.1:site/src/pages/features/tab-groups.astro`.

### 5. Blocking that is already part of the browser

- **Primary native format:** X/Threads product-proof clip opening the Island
  shield on a real page.
- **Secondary test:** concise Substack Note linking to the technical feature
  page; Facebook can carry the fuller explanation.
- **User tension:** ad blocking should not begin with shopping for a privileged
  extension.
- **Hook:** `the blocker was there before the first page loaded.`
- **Proof required:** describe built-in EasyList/EasyPrivacy blocking as a
  strong default, never a guarantee; do not claim every ad or tracker is
  blocked.
- **Evidence:** `v1.9.1:site/src/pages/features/ad-blocking.astro`,
  `v1.9.1:site/src/pages/features/security.astro`.

### 6. Private tabs that stay out of Blanc's record

- **Primary native format:** black-and-white Instagram/Facebook carousel.
- **Secondary test:** text-first Threads post built around the honest limit,
  `private does not mean anonymous.`
- **User tension:** a private page should not return in local history or after
  restarting the browser.
- **Proof required:** say only that private pages stay out of Blanc history,
  session restore, and reopen-closed. Saved files, websites, networks, and
  employers may still observe activity.
- **Evidence:** `v1.9.1:site/src/pages/features/private-tabs.astro`.

### 7. Your other device is a menu, not a remote control

- **Primary native format:** current-build desktop demo for TikTok/Reels.
- **Secondary test:** Substack product note and X still/GIF.
- **User tension:** retrieving a tab from another device should not rearrange
  that device's session.
- **Hook:** `open it here. leave it there.`
- **Proof required:** remote tabs are opt-in, read-only snapshots; choosing one
  opens a fresh local tab and does not force-open, close, or reorder the source
  device. Private tabs never enter a snapshot.
- **Evidence:** `v1.9.1:site/src/pages/features/sync.astro`.

### 8. Closed the wrong tab? Get the page back

- **Primary native format:** one uncut vertical proof for TikTok/Reels.
- **Secondary test:** four-slide Instagram/Facebook carousel, shorter X clip,
  conversation-first Threads post, and a Substack product Note.
- **User tension:** one mistaken close should not force someone to reconstruct
  the page they were just using.
- **Hook:** `closed the wrong tab?`
- **Proof required:** close and reopen one eligible ordinary page inside the
  tagged 30-second live-hold window, showing the real entered line return in
  the installed public v1.9.1 build. Say “eligible” and “about 30 seconds.”
  Never promise that every page or form state is recoverable.
- **Evidence:** `v1.9.1:src/main/closed-tabs.js`,
  `v1.9.1:src/main/main.js`, and `v1.9.1:site/src/pages/features.astro`.
- **Campaign brief:**
  [`reopen-closed-tab-campaign-brief-2026-08-29.md`](reopen-closed-tab-campaign-brief-2026-08-29.md).
  Storyboard, claim ledger, six platform-native executions, and read-only
  preflight are prepared; no capture, rendering, or publication is approved.

## Measurement rule

For each experiment, record the platform baseline immediately before posting
and check at 60–90 minutes and 24 hours. Track followers/subscribers, reach,
profile visits, replies/comments, reposts/shares, saves, link activity, and
downloads where the platform exposes them. Compare hook + format + outreach,
not raw impressions alone. Retire an asset after use; repeat a winning idea
only with a new proof, hook, or audience question and explicit approval.
