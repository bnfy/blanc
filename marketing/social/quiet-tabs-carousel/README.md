# Quiet Tabs campaign — free up memory without closing tabs

A new benefit-first campaign explaining why Blanc's shipped Quiet Tabs behavior
matters without reusing the tab-count, Nico, Same 12 Tabs, or Island-demo
assets. The reader benefit comes first in everyday language: people should not
have to close tabs they still need merely to free memory. Quiet Tabs can unload
eligible inactive pages while their tabs remain available.

## Assets

- Feed carousel: `quiet-tabs-carousel-{1..4}-1080x1350.png` for Instagram and
  Facebook.
- Native vertical cut: `quiet-tabs-vertical-1080x1920.mp4` for TikTok and
  Instagram/Facebook Reels; 16.5 seconds, H.264, 30 fps, no audio.
- Vertical cover: `quiet-tabs-vertical-cover-1080x1920.png`.

The vertical cut keeps all headline, timing controls, Island evidence, CTA,
and the mark inside the left/center safe area so TikTok and Reels controls do
not cover them.

The wake scene uses the shipped expanded-Island anatomy rather than a generic
status card. Its Quiet Tab is a normal favicon-and-title row with the whole row
at 50% opacity; no Quiet badge, glyph, or “page unloaded” label is invented.
A temporary monochrome video annotation draws around that row and pulses to
direct attention, without presenting the outline as part of Blanc's UI.

## Brand execution

- Blanc paper/ink palette only: white, black, and neutral grays.
- The Blanc mark appears black on white only. Never place it on, inside, or visually against an accent-colored shape.
- Headlines use the website's centered, sentence-case hierarchy; explanatory
  subtitles sit below in muted gray. All caps is reserved for small mono
  utility labels and annotations.
- Every slide is exactly 1080×1350 with consistent margins and typography.

## Claim ledger

Public release checked: `v1.9.1`.

| Wording | Type | Evidence | Verdict / qualification |
| --- | --- | --- | --- |
| “You shouldn’t have to close tabs just to free up memory.” | User tension / editorial hook | Normative statement, not a product capability claim | Safe; do not broaden it into verified CPU, heat, battery, speed, or wellbeing effects. |
| “Blanc can unload eligible inactive pages.” | Blanc capability | `v1.9.1:src/main/tab-sleep.js`; `v1.9.1:spec/acceptance/quiet-tabs.feature` | Verified best-effort wording. “Can” and “eligible” must remain because safety checks may refuse a tab. |
| “That can free memory without closing their tabs.” | Emotional payoff / Blanc capability | `v1.9.1:src/main/main.js`; `v1.9.1:spec/acceptance/quiet-tabs.feature` | Verified: acceptance checks that a renderer process is released while the same tab remains. Do not promise a numeric saving. |
| “Need one again? Click the dimmed tab to wake it up.” | User action | `v1.9.1:src/main/main.js`; `v1.9.1:spec/acceptance/quiet-tabs.feature` | Verified: Quiet Tab rows are dimmed in the panel and vertical rail, and activating one wakes its tab. |
| “Blanc reloads the page. The tab stays within reach.” | Blanc behavior | `v1.9.1:src/main/main.js`; `v1.9.1:spec/acceptance/quiet-tabs.feature` | Verified; do not imply exact resumption of every live page state. |
| Forms, playing media, pinned tabs, and permission-waiting tabs stay awake. | Eligibility exclusions | `v1.9.1:src/main/tab-sleep.js`; `v1.9.1:test/unit/tab-sleep.test.js` | Verified examples, not an exhaustive list. |
| Delay choices are off, 30m, 1h, and 6h; `/sleep` checks eligible background tabs without waiting for the delay. | Setting and command behavior | `v1.9.1:src/main/tab-sleep.js`; `v1.9.1:src/main/main.js` | Verified. The command still preserves every ordinary eligibility and safety check. |
| “Keep your tabs. Free up memory.” | Emotional payoff / editorial shorthand | Supported by the retained tab/session behavior above | Safe when paired with “eligible” and the reload qualification; do not convert it into a numeric memory-savings claim. |

## Proposed platform copy

### Instagram

> you shouldn’t have to close tabs just to free up memory.
>
> Quiet Tabs can unload eligible inactive pages instead. their tabs stay in place. open one again and Blanc reloads the page. pages with unfinished forms, media, pins, or pending permissions stay live.
>
> keep your tabs. free up memory.
>
> download Blanc — link in bio
>
> #browser #productivity #indiedev

### Facebook

> You shouldn’t have to close tabs just to free up memory.
>
> Quiet Tabs can unload eligible inactive pages instead. Their tabs stay in place. Open one again and Blanc reloads the page. Pages with unfinished forms, media, pins, or pending permissions stay live.
>
> Keep your tabs. Free up memory.
>
> https://blancbrowser.com/features/quiet-tabs

### TikTok / Instagram Reels / Facebook Reels

> you shouldn’t have to close tabs just to free up memory. Quiet Tabs can unload eligible inactive pages instead, then reload one when you open its tab again. #browser #productivity #techtok

### X / Threads

> you shouldn’t have to close tabs just to free up memory.
>
> Quiet Tabs can unload eligible inactive pages instead. their tabs stay in place; open one again and Blanc reloads the page.
>
> keep your tabs. free up memory.
> blancbrowser.com/features/quiet-tabs

### Substack Note

> You shouldn’t have to close tabs just to free up memory.
>
> Quiet Tabs can unload eligible inactive pages instead. Their tabs stay in place; open one again and Blanc reloads the page.
>
> Keep your tabs. Free up memory.
> https://blancbrowser.com/features/quiet-tabs

## Alt text

Four-slide monochrome carousel explaining that a laptop does not need to keep every inactive page running. It shows that Blanc can unload eligible inactive pages to free up memory without closing their tabs; the page reloads when revisited; pages with forms, media, pins, and permission prompts remain live; and users can choose a 30-minute, 1-hour, or 6-hour delay, turn the feature off, or use the `/sleep` command.

Vertical video: Monochrome animation opening with “You shouldn’t have to close
tabs just to free up memory,” then showing browser-tab cards collapsing into
Blanc's Island. Text explains that Blanc can unload eligible inactive pages
without closing their tabs, reload a page when its tab is opened again, and
let users choose a 30-minute, 1-hour, or 6-hour delay, turn the feature off, or
use `/sleep` without waiting for the delay.

Run `node marketing/social/quiet-tabs-carousel/render.js` from the repository root to regenerate all four PNG and SVG slides.
Run `node marketing/social/quiet-tabs-carousel/render-vertical.js` to
regenerate the MP4 and vertical cover.

## Export verification

Verified August 28, 2026 after the benefit-first rewrite:

- Video: 1080×1920, H.264, `yuv420p`, 30 fps, 16.500 seconds.
- Video SHA-256:
  `e0196ecb804b579ab27b67a5b71c66ee993ab0dc33e98416667ea683b02a2e57`.
- Cover SHA-256:
  `d241d014b321802eb4ba805f4aa025473a523c82db33c49a9cf64c29051192fa`.
- All four carousel slides are 1080×1350; the vertical cover is 1080×1920.
- All four carousel slides and representative frames at 2.2, 6.1, 10.1, and
  14.3 seconds were visually checked. Text is legible and unobstructed, controls
  remain inside the safe area, titles and subtitles use the centered
  sentence-case website hierarchy at weight 600 with only a 25px optical shift
  away from the native control rail, subtitles remain closely related to their
  headlines, the palette is monochrome, the mark is black on white with no
  accent treatment, and the wake scene matches the released expanded Island's
  field, row, and footer hierarchy. The Quiet Tab row is dim-only at 50%
  opacity, matching `v1.9.1:src/renderer/styles.css`.
