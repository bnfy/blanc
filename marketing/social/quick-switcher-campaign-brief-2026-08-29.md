# Quick Switcher campaign brief

Status: storyboard and copy prepared; **not approved for capture, rendering, or
publication**.

Read-only capture preflight:
[`quick-switcher-campaign-preflight.mjs`](quick-switcher-campaign-preflight.mjs).

Public product baseline: `v1.9.1`.

Campaign working title: **You know it’s in here somewhere.**

Conversion lesson carried forward: the August 28 Quiet Tabs Reel reached
96.3% non-followers but produced no profile activity or follows. This campaign
must not stop at feature comprehension. Its final two beats must state the
personal payoff and give the viewer a reason to follow Blanc.

This is a new content lane. It must not reuse Same 12 Tabs, Tab Count
Confession, Nico, Quiet Tabs, or the “open tabs are not a personal failure”
creative.

## Audience tension and payoff

**Tension:** A person remembers that a useful page is open or saved, but not
whether it is an open tab, favorite, history item, or part of a named group.

**Payoff:** They can get back to the page without manually scanning a tab
strip or opening several separate browser surfaces.

**Shipped mechanism:** Command/Control L opens Blanc’s command palette. Typing
a few letters can match open tabs, favorites, browsing history, and named
groups. Typing `/` reveals browser commands.

**Qualification:** Matching is typed-text matching, not semantic search or AI.
The campaign must never say Blanc understands the task, remembers intent, or
finds something from a vague description.

## Claim ledger

| Proposed claim | Type | Release evidence | Qualification | Verdict |
| --- | --- | --- | --- | --- |
| “Press Command or Control L.” | Blanc capability | `v1.9.1:site/src/pages/features/command-palette.astro`; `v1.9.1:src/main/main.js` palette shortcut wiring | Use the platform-appropriate key glyph in the visual. | verified |
| “Type a few letters to find an open tab, favorite, history item, or named group.” | Blanc capability | `v1.9.1:src/renderer/overlay.js`, `switcherResults()`; the v1.9.1 command-palette feature page | It is typed-text matching. Do not call it semantic, intelligent, or AI search. | verified |
| “Type `/` for browser commands.” | Blanc capability | `v1.9.1:src/renderer/overlay.js`, shipped `commands`; `v1.9.1:copy/slash-commands.json`; the v1.9.1 feature page | Show only commands actually present in the release. | verified |
| “Find it without opening separate tab, favorites, and history views.” | User benefit | The Quick Switcher returns those local sources in one palette and focuses/opens the selected result | Phrase as a workflow benefit, not a speed or productivity guarantee. | verified |
| “No AI assistant.” | Blanc capability | `docs/marketing-claims.md`; v1.9.1 public baseline | Do not imply that “no AI” makes Blanc objectively safer, more private, or faster. | verified |

Removed claims:

- “Blanc remembers where you left everything.” The software searches current
  records; it does not model intent or memory.
- “Search your whole browser.” Too broad: downloads, settings, page content,
  and every browser surface are not all part of the Quick Switcher corpus.
- “Instantly find anything.” “Anything” and the performance guarantee are not
  release-backed.

## Vertical storyboard — TikTok and Reels

Format: 1080×1920, 16–18 seconds, monochrome. Use a real installed `v1.9.1`
capture from a temporary clean profile. Keep the Island fully visible with top
margin and reserve TikTok’s right-side control area. Headlines use sentence
case at a slightly heavier weight than subtext. Each reading card remains on
screen for at least 3 seconds.

### Beat 1 — 0:00–0:03.5

Black background, white type.

Headline:

> You know the page. Not where you left it.

Subtext:

> An open tab? A favorite? Something from yesterday?

### Beat 2 — 0:03.5–0:11.5

Real Blanc `v1.9.1` screen capture. Show the current page, press `⌘L` on macOS,
and type `docs`. The prepared clean profile should produce visible, truthful
results from these sources:

- one open tab with “Docs” in its real title;
- one real favorite with “Docs” in its title;
- one real history item with “Docs” in its title;
- one user-created named group called `docs`.

Do not redraw or composite the product UI. A restrained external keyboard
overlay may show `⌘L`, and a monochrome animated outline may call attention to
the result-source labels without covering them. Turn search suggestions off in
the temporary profile so the demonstration stays focused on local results.

On-screen caption above the capture:

> Press ⌘L. Type part of the name.

### Beat 3 — 0:11.5–0:15.0

Black background, white type.

Headline:

> Stop hunting through your browser.

Subtext:

> Tabs, favorites, history, and named groups appear together.

### Beat 4 — 0:15.0–0:18.0

White background with the approved black Blanc mark; no accent treatment.

Headline:

> Get back to what you meant to do.

Subtext:

> Follow @blancbrowser to watch us build the other option.

Footer:

> Free for macOS, Windows, and Linux · blancbrowser.com

## Platform-native executions

### TikTok

Use the vertical proof with the opening card shortened to the first line in the
native cover. Caption:

> you know the page. not where you left it. press ⌘L, type part of the name, and stop hunting through your browser. follow @blancbrowser to watch us build the other option. #browser #productivity #tech

No website claim in the caption because TikTok does not expose a dependable
website field for the current account. Add TikTok’s AI label only if the final
asset contains generated material; a pure product capture and typographic
cards do not require a false AI label.

### Instagram

Use the vertical proof as a Reel with a native cover reading:

> You know it’s in here somewhere.

Caption:

> You know the page. You just don’t remember where you left it.
>
> In Blanc, press ⌘L and type part of the name. Open tabs, favorites, history, and named groups appear together, so you can stop hunting through separate parts of your browser and get back to what you meant to do.
>
> Follow @blancbrowser to watch us build the other option. Download Blanc from the link in bio.
>
> #browser #productivity #indiedev

### X

Use an 8–10 second 1080×1350 crop of the real interaction, not the reading
cards from the vertical cut. Caption:

> you know the page exists. somewhere.
>
> press ⌘L and type part of the name. open tabs, favorites, history, and named groups appear together—so you can stop hunting and get back to it.

No link in the first post. Put the tracked download link in a self-reply only
if the post earns meaningful interaction.

### Threads

Use the same current-build proof with a conversation-first prompt:

> what do you usually do when you know the page is open but can’t remember where you left it?
>
> Blanc’s answer is ⌘L, then part of the name: open tabs, favorites, history, and named groups in one place. less hunting; back to what you meant to do.

Do not add a download link to the first post. The profile already carries the
tracked site link.

### Facebook

Use the vertical proof as a native Reel. Caption:

> You know you had the page open. You may even remember part of the title. What you don’t remember is where the browser put it.
>
> Press Command or Control L in Blanc and type part of the name. The Quick Switcher brings matching open tabs, favorites, browsing history, and named groups together, so you can stop hunting and get back to what you meant to do.
>
> Blanc is free for macOS, Windows, and Linux: [campaign-tracked URL]

### Substack

Publish a Note with a still from the real result list and the short proof clip:

> You know it’s in here somewhere.
>
> That small browser feeling—remembering the page but not whether it is open, favorited, or buried in history—is why Blanc gives those places one keyboard entrance.
>
> Press Command or Control L, type part of the name, and choose the result. It is simple typed-text matching, not an AI assistant trying to infer what you meant. Less hunting; back to the page you wanted.

Link only the words “how the Quick Switcher works” to the release-backed
feature page or a campaign-tracked Blanc URL.

## Production gate

Before capture or publication:

1. Confirm `/Applications/Blanc.app` is still public version `1.9.1`.
2. Launch only with a temporary clean profile; do not expose personal history,
   favorites, accounts, downloads, or group names.
3. Create the four `docs` examples manually and verify every result label in
   the real UI.
4. Capture the full Island with top margin and no clipped overlay edge.
5. Verify the mark is black on white or white on black only.
6. Re-read every embedded line against the claim ledger.
7. Obtain explicit approval for the storyboard before rendering, and separate
   explicit approval immediately before any public upload or post.

The read-only preflight must pass immediately before the capture session. It
verifies the installed app version, the tagged source types and labels, the
six-row blend, distinct staging URLs, and the predicted visible result order.

## Measurement

Record each platform’s live follower/subscriber count immediately before
publication. Check at 60–90 minutes and 24 hours. Track views/reach, average
watch time and completion where exposed, profile visits, follows, replies,
shares/reposts, saves/favorites, link activity, and attributed downloads. The
primary test is whether a concrete “find my page” payoff converts more profile
visitors to followers than another abstract browser-positioning post. Because
the Quiet Tabs Reel already proved that non-follower reach can coexist with
zero conversion, this campaign does not pass on views alone: it must produce
at least one downstream intent signal—profile activity, a follow, a tracked
feature-page visit, or a tracked download click—within 24 hours. This is a
campaign decision threshold, not an industry benchmark.
