# Homepage first screen: the floating Island

Status: design, approved direction (owner, October 21, 2026, in the release
session). Website only (`site/`). Feature context: Auto-hide the Island, float
style (shipped in public v1.40.0; spec
`docs/superpowers/specs/2026-10-20-floating-island-design.md`).

## Intent

Make a big splash about the floating Island on blanc.day's first screen. The
message, in the owner's words: the Island is already minimal UI compared to
other browsers, and now it can be hidden out of sight completely for a true
full-screen web page experience.

So the first screen says two things in order: Blanc is already "a little less
browser", and with Auto-hide on, the page gets the whole window and the Island
floats back when you reach for it.

## Goals

- The floating Island is the first thing a visitor sees on blanc.day, on the
  first screen, without scrolling.
- A visitor sees the Island hide and float back, the way the real app does,
  and can make it happen with their own pointer.
- The sunrise opening stays.

## Non-goals

- No change to the rest of the homepage (the Start Page scene, the Island
  scene, tools, comparison, questions), apart from what the new first screen
  pushes down.
- No change to the app.
- No new page; the Island feature page is untouched here.

## Anti-goals (a failure even if it works)

- Implying Blanc hides its Island out of the box. Auto-hide is off by
  default; every word presents it as something you turn on.
- A hand-drawn or invented Island. The site rule is that a replica draws only
  what the released app's code draws (`site/CLAUDE.md`).
- Losing the sunrise, or a scroll-to-reveal opening (the owner rejected one on
  October 15, 2026).
- Loading any font or asset from a third party.

## The design (owner decisions)

Chosen in the mockups of October 21, 2026 (direction A "the peek", layout 2
"stacked", handwritten note option 3):

1. **Layout, stacked.** On a 1440×900 screen, from the top: the sunrise mark
   (smaller than today's), the headline on one line, a handwritten note, the
   lead, the Download button and "See how to switch", then a wide Blanc window
   below them whose top half is on the first screen. Scrolling shows the rest
   of the window, then the existing page continues.
2. **The sunrise stays** and still plays once on load, as it does today
   (2.2 s, `prefers-reduced-motion: no-preference` only).
3. **The headline stays "A little less browser."** Owner: don't add "Now, none
   at all" to the main headline. Instead it appears as a smaller handwritten
   note: **"now, none at all"** in **Reenie Beanie**, tucked above the end of
   the headline, slightly rotated, in the site's gold, with a quick
   hand-drawn underline flick. Reenie Beanie is under the SIL Open Font
   License; it is self-hosted with the site's other fonts, never loaded from
   Google.
4. **The window shows the peek.** A real web page fills the window edge to
   edge with the Island hidden. A pointer drifts to the window's top edge; the
   Island floats down over the page (on macOS with the window's buttons, which
   since #1003 come and go with the Island), stays a moment, then slides away
   as the pointer moves back into the page. It loops slowly.

## Calls I made (the owner can change these)

- **The page in the window** is The Met's page for Van Gogh's *Wheat Field
  with Cypresses*, the same page as the v1.40 What's New captures, captured
  from the **published v1.40.0 app** with Auto-hide on (float style) and the
  Island hidden, on a scratch profile, at Retina density (at least 2 device
  pixels per CSS pixel), recorded in a capture ledger like
  `docs/website-captures-v1.40.0.json`. A new capture is needed: the page must
  fill the window to its top edge with nothing drawn over it.
- **The Island is drawn from the app's own markup and CSS** at build time,
  with the site's existing extractor (`nativeIslandArt` in
  `site/src/lib/native-island-art.mjs`, the same path as
  `NativeIslandHero.astro`), over the captured page, plus the float view's
  own shadow (`--shadow-island-float`). Its sample state (the site, the dots,
  the blocker count) matches the captured page, and is a fixed illustration
  state, as the existing figures say.
- **The window frame and its buttons come from real captures**, never drawn.
  macOS draws the traffic lights and the window's corners, not the app's
  markup, so they can't come from the extractor. Two native window captures
  of the published app (`screencapture -l`, which keeps the window's corners)
  give the pixels: one with the Island hidden (the window as shown at rest)
  and one with it revealed, from which the traffic lights are cut and shown
  and hidden with the drawn Island. `NativeWindowFigure` draws only the strip
  and page, so it is not the frame here.
- **Motion.** The loop: rest about 1.6 s with the Island hidden, the pointer
  moves to the top edge (about 1 s), the Island slides in over the app's
  reveal time, rests about 2.6 s, then slides out as the pointer leaves. The
  pointer is a drawn arrow inside the window, never the visitor's.
- **Visitors can bring it down themselves.** When the visitor's own pointer
  reaches the window's top band, the loop pauses and the Island floats in;
  when the pointer moves into the page, it slides away and the loop resumes
  after a pause. Keyboard focus on the window does the same (the Island shows
  while the window has focus), so the demo isn't pointer-only.
- **Reduced motion:** no loop. The window shows the Island resting over the
  page.
- **Without scripting:** the window shows the Island resting over the page
  (the static layout), as every keyframe on the homepage ends on its static
  layout.
- **Narrow screens:** the whole window scaled down as one piece, never
  cropped, rearranged or icon-only (Blanc is desktop-only; `site/CLAUDE.md`).
  At phone width the Island is small; that is accepted, since the phone
  homepage's job is "Send to my computer".
- **The lead** becomes shorter, something like: "Tabs, search and commands
  live in one compact Island. Turn on Auto-hide and it slips out of sight;
  point at the top edge and it floats back." It keeps the facts the current
  lead carries that the page needs elsewhere (free for macOS, Windows and
  Linux; blocking on from the first launch) if no other sentence on the first
  screen does. Final wording is shown to the owner with the screenshots.
- **Accessibility.** The window is an illustration with a text alternative
  that says what it shows (a page filling the window, the Island floating
  back in). The live region does not announce each loop. The handwritten note
  is real text (not an image), so it is read and selectable.

## Facts the copy rests on

- **The note holds on every platform.** Since #1003 (shipped in v1.40.0, the
  owner's choice of "Hide with the pill"), the window's buttons hide and come
  back with the floating Island on macOS, Windows and Linux; the Windows and
  Linux VM checks of October 20 confirmed it. (CLAUDE.md's Floating Island
  paragraph still says Windows and Linux keep their controls on screen the
  whole time; that sentence is stale and is corrected in the same PR.) The
  only thing left on screen is the invisible 6 px drag band. The ledger
  records "now, none at all" as a claim tied to the float-style evidence
  (`src/main/island-autohide.js` `floatViewsShown`, D29, the release notes),
  with no platform qualifier.
- Every visitor sees the macOS window, as every other figure on the
  homepage shows; the copy makes no platform-specific claim.

## Constraints

- Every sentence on the homepage must be recorded in a claims ledger
  (`test/unit/website-feature-evidence.test.js`); new sentences go in a
  ledger against public v1.40.0 evidence, as `docs/website-v1.40-claims.json`
  does, and any replaced sentence moves unchanged to `supersededClaims`.
- `docs/marketing-claims.md` → Auto-hide the Island bounds the copy: opt-in,
  device-local, float by default since v1.40.0; reveal from the top edge or
  ⌘L; on native Wayland the band above a floating window can't reveal it.
  The copy makes no platform-specific claim.
- Site type: headings and text in Blubird; the app's UI in the window in the
  app's face (Instrument Sans, Inter for counts); the note in Reenie Beanie.
- The first screen must still end on the headline and Download for visitors
  who never scroll, at common laptop sizes (1440×900, 1280×800, 1280×720).
- The existing page tests and the scroll-motion test keep passing; the
  homepage share card (`og-image.png`) is unchanged unless the owner asks.

## Left to the builder

- Exact sizes and spacing, the sunrise's new size, and how the window's
  bottom half meets the next section.
- How the loop is timed and eased in detail, within the motion above.
- How the native Island is composed over the capture (shadow root like
  `NativeIslandHero`, or the `NativeWindowFigure` frame).
- Font subsetting for Reenie Beanie (only the note's characters are needed).
- The capture script (adapt `scripts/capture-installed-island.mjs` or write
  one like `capture-installed-glance.mjs`).

## Review

The owner approves before/after screenshots of the first screen (at
1440×900 and 1280×720, and a phone width), plus a short screen recording or
frame sequence of the loop, before the website-only PR merges.
