# Blanc on iPhone Duo — design spec

**Date:** 2026-10-21
**Status:** Draft for the owner. Nothing here has shipped; Blanc has never shipped a mobile app.
**Builds on:** [the iOS plan](2026-10-21-ios-port-revisit.md) §6 (companion positioning, the M6.5 → beta ladder).
**spec/:** adds divergence **D30** (foldable inner display) and moves the iOS cells of F34 Glance and F53 Split View from N/A to PLANNED, as D11 anticipated ("unless a future tablet/foldable contract adopts them explicitly").

## 1. Why the Duo matters to Blanc

iPhone Duo is Apple's first foldable: a 5.4" outer display and a 7.6" inner
display, announced September 9, 2026, on sale October 23, from $1,999
([Apple Newsroom](https://www.apple.com/newsroom/2026/09/apple-unveils-iphone-duo/),
[specs](https://www.apple.com/iphone-duo/specs/)). Third-party estimates put
2026 sales at 5–10 million (Counterpoint, Omdia, TrendForce, via press); Apple
has published none. A small, expensive device, but its buyers skew toward the
power users Blanc is built for.

Three things make it more than "a bigger iPhone" for Blanc:

1. **The inner display is regular × regular, like an iPad** (Apple Tech Talk
   [111461](https://developer.apple.com/videos/play/tech-talks/111461/)). That
   is enough room for the desktop ideas the phone contract marks N/A today:
   two pages side by side (F53), a reference page floating over the current one
   (F34), and the ⌘L panel's groups and tabs as a column.
2. **It fits the companion positioning.** "Your Blanc, in your pocket" is
   strongest when unfolding the phone shows something that looks and works like
   desktop Blanc: your synced groups, Spaces and tabs, on a screen big enough
   to use them.
3. **Almost nobody has done it yet.** The only browser found with a
   Duo-specific update is Perplexity Comet (October 20, 2026). Reviews at
   launch criticise apps that appear letterboxed on the inner display
   ([CNN](https://www.cnn.com/2026/10/21/tech/apple-iphone-duo-review)). These
   are search findings, not a survey; re-check before any public claim.

## 2. Platform facts the design rests on

From Apple's Tech Talks 111461/111463/111464/111466 and the HIG page
[Designing for iPhone Duo](https://developer.apple.com/design/human-interface-guidelines/designing-for-iphone-duo).
Point sizes are inferred from pixels at 3x and must be read at runtime, never
hard-coded.

| | Outer display | Inner display |
|---|---|---|
| Size, pixels | 5.4", 1398 × 2034 | 7.6", 1878 × 2670 |
| Points (inferred) | about 466 × 678 | about 626 × 890 |
| Size class | compact width, regular height (portrait) | regular × regular |
| Orientation | as the app declares | ignores the app's supported orientations |
| Camera | Dynamic Island, moved to a side strip in iOS 27 | under-display camera, an `.occlusion` reserved region |

- **Folding resizes the scene; it never relaunches the app.** The app sees a
  trait change and new bounds.
- **The fold is a reserved region.** It is a `.division` region with width
  while the phone is part-folded and inactive when flat
  (`GeometryProxy.reservedRegions(kind:)`, iOS 27.1). Scrolling content may
  cross it; controls should not sit on it.
- **Hinge state is for interaction, not layout.** `.onHingeChange` reports
  `closed`, `partiallyOpen` or `fullyOpen` plus the angle; Apple says to lay
  out with size classes and `ArrangementView` instead.
- **The SDK decides how much screen the app gets.** An app built against an
  older SDK appears letterboxed at iPhone size on the inner display; an iOS 27.0
  build extends partly; only an **iOS 27.1 SDK** build is edge to edge on both
  displays. Xcode 27.1 also adds the iPhone Duo simulator (open, close, fold,
  rotate, Split View).
- **The system offers Split View of two apps or two windows of one app** on
  the inner display (no Slide Over). New windows open only on the inner display.
  Multiple windows need the app's iPad multi-scene support.
- **Web content gets no fold signal.** Safari gives pages no fold event or
  media query; a page just sees a resize.

## 3. Design principles

1. **One app, two layouts, chosen by size class, never by device.** Compact
   width is the iPhone layout everywhere (every iPhone, the Duo's outer display,
   the inner display in system Split View). Regular width is the "unfolded"
   layout (the Duo's inner display, and an iPad later for free). No
   `if isDuo`, no per-pose layouts (HIG).
2. **Folding never costs state.** Unfolding or folding keeps every tab,
   scroll position, form, playing video, open palette text and the focused
   pane. Each `TabModel` owns its `WKWebView`, so a layout change re-parents
   web views; it must never reload one.
3. **The Island stays the Island.** Both layouts use the same pill, palette,
   Quick Switcher and slash commands (F1, F6, F7). The inner display gets more
   of the desktop's surfaces, not a different product.
4. **Controls avoid the fold.** When the phone is part-folded, the pill, the
   split divider's handle and any floating card stay out of the `.division`
   region. When it is flat, the crease is ignored.
5. **Keep positions stable across poses** (HIG): the pill is bottom-centre in
   both layouts, so a thumb finds it in the same place after unfolding.

## 4. The two layouts

### 4.1 Compact (outer display, every iPhone): what exists today

The page full screen, the Island pill floating at the bottom, the palette as a
sheet. Unchanged by this spec except for the iOS 27.1 SDK edge-to-edge work in
§6 (the status bar and Dynamic Island now sit in a side strip; insets are
asymmetric).

### 4.2 Regular (inner display): Blanc unfolded

```
┌──────────────────────────────────────────────┐
│ ┌──────────────────┐ ┊ ┌───────────────────┐ │
│ │                  │ ┊ │                   │ │
│ │   pane A         │ ┊ │   pane B          │ │
│ │   (focused)      │ ┊ │                   │ │
│ │                  │ ┊ │                   │ │
│ │                  │ ┊ │                   │ │
│ └──────────────────┘ ┊ └───────────────────┘ │
│        ╭──────────────────────────────╮      │
│        │ ● ● ○  example.com  🛡  ⟳  ＋ │      │
│        ╰──────────────────────────────╯      │
└──────────────────────────────────────────────┘
          ┊ = the fold (.division region when part-folded)
```

- **The pill** stays bottom-centre, with a capped width (about 560 pt,
  derived from the readable-content width, not a constant) instead of
  stretching edge to edge. It may show more than the compact pill: back and
  forward buttons (there's room; D7's edge swipe still works), and up to eight
  tab dots with the desktop's `+N` rule instead of the compact cap of three.
- **The palette opens in place** as a panel growing up from the pill (the
  desktop's `'panel'` mode), not a bottom sheet. Same three modes: tabs at
  rest, slash commands after `/`, Quick Switcher while typing.
- **Split View (F53).** Two tabs side by side, 50/50, kept as one item, made
  from a tab's context menu (**Split with ▸**) or Glance's **Keep as split**.
  It follows desktop's model (`src/main/split-model.js`): the focused pane is
  always the active tab, so the Island and every current-tab command follow
  the focus; tapping a pane focuses it; each pane is a rounded card with a
  1 pt border, darker when focused; a small corner tab shows each pane's site
  and a ×. The divider can be dragged; when the phone is part-folded it snaps
  to the fold, so each pane gets one half of the book. Two panes only on the
  Duo; desktop's three-column and grid layouts don't fit a 7.6" screen.
- **Glance (F34).** **Open Link in Glance** from a link's context menu opens a
  card floating over the page, as desktop's floating Glance does: header with
  **Open as tab**, **Keep as split** and ×, the page inside, default frame
  centred and about 80% of the page area, never on the fold.
- **The side list (later, §7).** An optional leading column showing what the
  ⌘L panel shows: Spaces, groups (synced from desktop, read-only until editing
  arrives), ungrouped tabs, Recently closed and Other devices. Off by default:
  the desktop is Island-first and vertical tabs are an option there too (F28).

### 4.3 Folding with the regular layout open

| From inner (regular) | To outer (compact) |
|---|---|
| A split | The focused pane fills the screen; the split stays one item and returns on unfolding, as when a desktop window is too narrow |
| A Glance card | The Glance closes, as desktop closes it on a tab switch; its page stays open as a tab only if the person chose **Open as tab** |
| The palette panel | Becomes the bottom sheet with the same text and mode |
| The side list | Hidden; its state returns on unfolding |

Unfolding reverses each row. System Split View on the inner display gives
Blanc compact width, so Blanc then uses the compact layout with no special
case.

## 5. Postures (later)

Part-folded postures are interaction, not layout (Apple):

- **Book** (held like a book, fold vertical): the split divider snaps to the
  fold (§4.2); a single page simply spans it.
- **Tabletop** (fold horizontal, bottom half flat): when the page is playing
  video full screen, the video stays on the top half and the Island moves to
  the bottom half. Only for video at first; ordinary pages span the fold.
- **Tent and standing:** nothing special.

## 6. Engineering

- **SDK.** Build with Xcode 27.1 and the iOS 27.1 SDK; the deployment target
  stays iOS 18.4. Every iOS 27.1 API (`reservedRegions`, `onHingeChange`,
  `ArrangementView`) sits behind `if #available(iOS 27.1, *)`. CI must use
  Xcode 27.1 or later and run the XCTests on an iPhone Duo simulator as well
  as an ordinary iPhone.
- **Layout switch.** `ContentView` reads `horizontalSizeClass` and chooses the
  compact or regular container. Both containers render the same `WebView`
  representables over the same `TabModel` web views, so switching re-parents
  and never reloads.
- **Split model.** Port the pure rules of `src/main/split-model.js` (make,
  remove, dissolve, focus, contiguity in tab order) to a Swift `SplitModel`
  with unit tests, as `AddressNormalizer` ports `normalizeAddressInput`.
  Splits persist in `SessionStore` like desktop's `splits` + `splitIds`
  column; private tabs are never saved.
- **Fold avoidance.** A small `FoldAvoidance` helper turns the `.division`
  regions in a `GeometryProxy` into exclusion rects for the pill, the divider
  handle and the Glance card, with an empty result below iOS 27.1.
- **Multiple windows (later).** Adopting `UIApplicationSupportsMultipleScenes`
  lets people put two Blanc windows side by side in system Split View. Each
  scene then needs its own workspace (desktop's per-window runtime, F32). That
  is a larger change and comes after the beta.
- **Not doing:** polyfilling the web's Viewport Segments or Device Posture
  APIs for pages, or any device-model checks.

## 7. Where it lands in the plan

| Step | Delivers | When |
|---|---|---|
| **Duo-1** | iOS 27.1 SDK build, edge to edge on both displays; the regular layout's pill and in-place palette; fold continuity (no reloads, palette text kept); fold avoidance; CI on the Duo simulator | Right after M6.5, before M7, because a letterboxed app on launch week's most-reviewed phone undercuts everything after it |
| **Duo-2** | Split View (two panes) and floating Glance on the regular layout; the Swift `SplitModel`; splits in the session | With M10, before the TestFlight beta |
| **Duo-3** | The side list from synced groups and Spaces; tabletop video; multiple windows | After the beta |

Acceptance for Duo-1, checked on the Duo simulator and then a real device
before any claim:

- Unfold with three tabs, one playing video and one with a half-filled form:
  nothing reloads, the video keeps playing, the form keeps its text.
- Fold with the palette open and text typed: the sheet shows the same text.
- No black bars on either display; no control under the camera or on the fold
  when part-folded.
- An ordinary iPhone and the outer display look exactly as before.

## 8. Claims

Under `docs/marketing-claims.md`, nothing about the Duo may be said publicly
until a released build is verified on the device. "Designed for iPhone Duo"
and any comparison with Safari or Comet on the Duo need that release, its
evidence and a current first-party source for the other browser.
