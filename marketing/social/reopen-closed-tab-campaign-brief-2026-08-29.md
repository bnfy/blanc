# Reopen Closed Tab campaign brief — August 29, 2026

Status: **prepared for approval; no capture, render, upload, post, reply,
reaction, follow, pin, or profile change is authorized**.

Public product baseline: `v1.9.1`.

Read-only verification:
[`reopen-closed-tab-campaign-preflight.mjs`](reopen-closed-tab-campaign-preflight.mjs).

## Why this is a new lane

Blanc has not published a standalone campaign about recovering a mistakenly
closed page. The hook is not tab overload, the Island, Quiet Tabs, AI, or a
browser comparison. It starts with a familiar mistake and demonstrates a
specific shipped recovery behavior.

The human payoff comes first: **you should not have to reconstruct your place
because one click closed the wrong tab.** The mechanism follows: Reopen Closed
Tab can return an eligible page as the same live page during a short recovery
window, then falls back to a bounded snapshot or URL recovery path.

## Claim ledger

| Proposed wording | v1.9.1 evidence | Qualification | Verdict |
| --- | --- | --- | --- |
| “Closed the wrong tab?” | Familiar user tension; no product claim | Do not dramatize data loss or imply that every close is recoverable. | editorial |
| “Press Command/Control Shift T to reopen it.” | `v1.9.1:src/main/main.js`; `v1.9.1:src/main/tab-context-menu-model.js` | Applies to a recorded recently closed entry in the focused Blanc window. | verified |
| “For about 30 seconds, an eligible page can return as the same live page.” | `CLOSED_GRACE_MS = 30_000`; `parkTabView`; `reopenEntry` adopting `entry.view` in the v1.9.1 tag | Say **eligible** and **about**. Loading, quiet, permission-pending, capture-bearing, popup-family, private, new-tab, or otherwise ineligible pages do not receive this live hold. | verified, qualified |
| “After that, a still-recent entry can rebuild what Blanc safely saved.” | Tagged `downgradeHeldEntry`, snapshot restore, URL fallback, one-hour expiry, and 25-entry cap | Say **still-recent** or **limited**. Do not promise exact form, JavaScript, POST, media, or scroll state after the live window. | verified, qualified |
| “Private tabs never enter Recently Closed.” | Tagged `holdEligibility` refuses private tabs; `buildGroupEntry` and `buildBatchEntry` filter them | Keep the claim scoped to the Recently Closed undo buffer. Saved files and outside observers are separate matters. | verified |
| “Recently closed is an undo buffer, not an archive.” | Tagged one-hour TTL, 25-entry cap, per-window storage, and public v1.9.1 source comments | Use as explanatory copy, not as a promise of permanent recovery. | verified |

Do not use “nothing is ever lost,” “always returns exactly where you left
off,” “recovers every tab,” or “saves your work.” Those are broader than the
release evidence.

## Capture contract

- Use the installed public `v1.9.1` Blanc build, not a development instance.
- Use a temporary clean Personal profile and an ordinary non-private HTTP page
  prepared solely as deterministic page content. The page may contain a
  simple text field and scrollable notes, but it must not imitate Blanc chrome.
- Keep the full Island visible with top margin. Do not redraw, crop, mask, or
  replace any shipped browser UI.
- Close and reopen the page inside the verified 30-second live window.
- Show the entered text still present only because the exact demonstrated page
  qualified for the live hold. The caption and on-screen qualification must
  not generalize that result to every page.
- Record one uncut close → shortcut → return interaction. Speed changes may be
  used only outside the product interaction and must not hide a reload.
- Use only black, white, and neutral grays. The Blanc mark is black on white or
  white on black, never backed by an accent color.
- Titles are sentence case. Headlines use a slightly heavier weight than the
  explanatory line. Keep text inside vertical-platform safe areas and visible
  for at least three seconds.

## Vertical storyboard — 1080×1920, about 17 seconds

### 0:00–0:03.2 — the mistake

Show the ordinary page and the full resting Island.

Headline: **Closed the wrong tab?**

Subtext: `You shouldn’t have to rebuild your place.`

### 0:03.2–0:08.8 — real product proof

Show a short line already entered in the page, close that tab, then display the
native shortcut callout while the Island remains fully visible.

Callout: `⌘⇧T` on macOS or `Ctrl Shift T` in the Windows cut.

No additional marketing text competes with the interaction.

### 0:08.8–0:12.1 — the return

The same eligible page returns with the demonstrated line still present.
Briefly outline the returned Island row in white; do not tint or redraw it.

Headline: **Get the page back.**

Subtext: `For about 30 seconds, one eligible page can return without reloading.`

### 0:12.1–0:17.1 — honest limit and action

White field with the approved black Blanc mark.

Headline: **You have time to undo it.**

Subtext: `Missed the live window? Blanc can still reopen a recent page from its URL or safe navigation history. Private tabs never enter Recently Closed.`

Footer: `Blanc is free for macOS, Windows and Linux · blancbrowser.com`

Keep the final card on-screen for five seconds. Extend it again rather than
shrinking the type if a clean mobile preview is not comfortably readable.

## Feed carousel — 1080×1350

Use four consistent monochrome frames with the same margins, type scale, and
real v1.9.1 chrome crop.

1. **Closed the wrong tab?**
   `You shouldn’t have to rebuild your place.`
2. **Press ⌘⇧T.**
   `Blanc can keep one eligible page live for about 30 seconds after it closes.`
3. **Get the page back.**
   Show the same demonstrated line still present in the real returned page.
4. **Missed the live window?**
   `Blanc can still reopen a recent page from its URL or safe navigation history. Private tabs never enter Recently Closed.`

Do not place a logo on every slide. Use the approved mark once on slide four.

## Platform-native copy

### X — short proof clip

> closed the wrong tab and realized it one second later?
>
> hit ⌘⇧T. for about 30 seconds, one eligible page in Blanc can return without reloading.
>
> miss that window? Blanc can still reopen a recent page from its URL or safe navigation history. private tabs never enter Recently Closed.

Do not include a link in the first post. Use the evergreen tracked profile
destination after that separate change is approved.

### Threads — conversation-first proof

> what’s the fastest you’ve ever closed a tab and immediately regretted it?
>
> Blanc keeps a short undo window: for about 30 seconds, one eligible page can come back without reloading. miss that window and Blanc can still reopen a recent page from its URL or safe navigation history.

Use the proof clip only after the question line; do not add a download CTA to
the first Threads post.

### Instagram — four-slide carousel

> Closed the wrong tab? You shouldn’t have to reconstruct your place because of one click.
>
> In Blanc, ⌘⇧T can return one eligible page without reloading for about 30 seconds. Miss that window and Blanc can still reopen a recent page from its URL or safe navigation history. Private tabs never enter Recently Closed.
>
> Follow @blancbrowser to watch the independent browser take shape. Download Blanc from the link in bio.
>
> #browser #indiedev #productivity

### Facebook — carousel with fuller context

> Closing the wrong tab should feel like a small mistake—not the start of rebuilding your work.
>
> Blanc treats Recently Closed as a bounded undo buffer. For about 30 seconds, one eligible page can return without reloading. Miss that window and Blanc can still reopen a recent page from its URL or safe navigation history. Private tabs never enter Recently Closed.
>
> Blanc is free for macOS, Windows and Linux: [tracked campaign URL]

### TikTok — vertical proof

> closed the wrong tab? ⌘⇧T can bring one eligible page back without reloading for about 30 seconds. miss that window and Blanc can still reopen a recent page from its URL or safe navigation history. #browser #tech #productivity

The full explanation and limit must remain in the video because the account
has no dependable clickable website field.

### Substack — product Note

> Closing the wrong tab should not make you reconstruct the page you were just using.
>
> Blanc can keep one eligible recently closed page live for about 30 seconds. Reopen it during that window and it can return without reloading. Afterward, Blanc can still reopen a recent page from its URL or safe navigation history. Private tabs never enter Recently Closed.
>
> It is intentionally an undo buffer, not a hidden archive.

Attach one real before/after still pair or the short proof clip. Link only a
short phrase to the campaign-tracked site destination; do not append a naked
URL and a second CTA.

## Measurement

Record audience counts immediately before publication. Check at 60–90 minutes
and 24 hours for:

- X/Threads: views, replies, reposts, profile visits, and follows;
- Instagram/Facebook: carousel completion where exposed, saves, shares,
  profile activity, and follows;
- TikTok: average watch time, completion, rewatches, shares, profile views, and
  follows;
- Substack: Note views, likes, replies, restacks, profile follows, subscribers,
  and tracked site visits;
- tracked `download_click` and aggregate download movement only with the
  attribution qualifications in `measurement-plan.md`.

The proof succeeds only if at least one platform produces a downstream intent
signal—not merely impressions—within 24 hours.

## Action gate

Approval of this brief authorizes neither the capture nor any public action.
Capture/render approval, creative approval, and platform publication approval
remain separate. Immediately before publication, recheck the product version,
caption, crop, logo treatment, destination, account identity, and duplicate
state in visible Brave.
