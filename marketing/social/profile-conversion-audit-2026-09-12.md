# Blanc profile conversion review — September 12

Live Brave inspection around 12:48–13:00 EDT. Proposals below are **not applied**.

| Channel | Verified current state | Proposed minimal change |
| --- | --- | --- |
| X | 13 followers. Bio describes people who keep too much open and the disappearing tab strip. Website is a t.co link to the existing homepage. No pinned indicator observed on the newest posts. | Preserve the current benefit; add the continuing editorial promise through the new pinned introduction after approval. Use the prepared tracked homepage URL. |
| Threads | 22 followers. Benefit-led bio, browsers topic and an existing tracked homepage link using `utm_medium=social`. | Keep the working link. Test the new follow promise in a post before changing the bio. |
| Instagram | 102 followers. Same benefit-led bio. First link label is **Get Blanc Browser for Mac**, pointing to homepage with `utm_source=ig&utm_medium=social&utm_content=link_in_bio`. Second link is Facebook. | Change first link label to **Get Blanc Browser**: public v1.16.2 includes all three desktop platforms. Preserve the tracked destination initially. Proposed bio below. |
| Facebook | 22 followers. Existing benefit-led About; homepage link; **Same 12 Tabs** is Featured. | Preserve About. Replace the stale Featured creative only after the new introduction is approved; do not remove it before a replacement is ready. |
| TikTok | 25 followers, 7 cumulative likes, six public videos. Bio: “keep your tabs. lose the tab strip.” No dependable website field observed. | Proposed bio below; keep every video self-contained and do not imply caption URLs are clickable. |
| Substack | 2 external subscribers; dashboard 3 includes 1 Author. Bio already promises product notes, release stories and design thinking. | Keep the bio; deliver the promised useful weekly article. Do not confuse the separate follower count with subscribers. |

## Exact proposed copy

Instagram bio (124 characters):

> A different desktop browser. Practical browsing ideas and the design decisions behind Blanc. Follow the build. Try it below.

TikTok bio (78 characters):

> Practical browsing ideas. The design decisions behind Blanc. Follow the build.

X pinned introduction (text-only; publication approval required):

> What makes a browser worth switching to?
>
> We’re exploring that at Blanc: practical browsing ideas, honest design tradeoffs, and what people need from the tools they use every day.
>
> Follow for the next idea. Tell us the one thing your browser has to get right.

Facebook Featured replacement: use the approved first design discussion from the new batch. No product trailer is substituted while launch media remains gated.

Proposed X homepage URL: `https://blancbrowser.com/?utm_source=x&utm_medium=organic_social&utm_campaign=profile&utm_content=bio`.

## Verification and experiment

The “desktop browser” description and macOS/Windows/Linux availability are backed by `git show v1.16.2:package.json` and `docs/release-incidents/2026-09-11-v1.16.2.md`, inspected September 12. The publishing promise is a new editorial commitment, not a shipped software claim.

After approval, read each field back character-for-character and verify link navigation. Compare the next seven days' profile visits and attributed follows with the preceding available period. Do not assign individual follows to a bio edit without attribution evidence. Do not normalize functioning Meta tracking links during this experiment: that would add another variable.
