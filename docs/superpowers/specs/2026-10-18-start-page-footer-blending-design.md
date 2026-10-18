# Start page footer blends with the wallpaper

Date: 2026-10-18. Status: approved and implemented.

## Problem

The start page footer (`#layoutFooter`, `.ledger-footer`) is a fixed band
painted with one flat color per theme, `--start-footer`:
`rgba(248, 242, 232, 0.82)` in light, `rgba(23, 19, 15, 0.84)` in dark and
`rgba(16, 13, 11, 0.88)` in private, plus `backdrop-filter: blur(14px)`
(`pages.css`, the `.ledger-footer` rule near line 3074).

The wallpaper behind it is not one color. It is one of four photographs
(`start-page-sunrise|day|dusk|night.png`), each with its own fog at the
bottom, and each passed through a theme overlay that is lightest at the bottom
(light: 4% cream at the bottom). So the footer reads as a separate slab:

- a cream bar over the blue night and dusk fog in light theme;
- a brown bar over blue fog in dark and private themes;
- a visible top edge everywhere, because the band's color stops at a hard line
  and the 24 px `::before` fade appears only while content runs underneath;
- the band never changes when the dynamic wallpaper changes phase.

## Goal

At rest, the footer has no visible band: its text and pills sit directly on
the wallpaper, which darkens or lightens toward the bottom just enough to keep
the text readable. When content scrolls underneath, a frosted area appears
that fades in from the top instead of starting at a line, and its tint is the
wallpaper's own color, not a theme constant.

Out of scope: footer content, layout, the wallpaper artwork, the four
layouts' content areas, the Customize popover and checklist popover surfaces.

## Design

### 1. The legibility scrim moves into the wallpaper

Each wallpaper paint gets one more gradient at the top of its background
stack, a bottom scrim (`--start-wallpaper-scrim-image`):

```css
linear-gradient(to top,
  var(--start-wallpaper-scrim) 0,
  var(--start-wallpaper-scrim) calc(var(--start-footer-h, 72px) * 0.5),
  transparent calc(var(--start-footer-h, 72px) + 120px))
```

It is added to both places that paint the wallpaper: the static
`.ledger-body` background (all three theme blocks) and
`.start-wallpaper-layer`. Because the scrim is part of each layer, it
crossfades with the artwork during the dynamic wallpaper's 2 s fade for free,
and it never has an edge: it is the same picture, shaded.

### 2. A tint per phase and theme

`--start-footer-tint` is defined per phase and theme, sampled from each
photograph's bottom fog and composited with that theme's overlay at the
bottom stop, then moved toward white (light theme) or the theme background
(dark, private) only as far as the footer ink needs to reach 5:1. Twelve
values: four phases × light, dark, private. They follow
the existing pattern: the default (sunrise) on `.ledger-body` in each theme
block, and the dynamic phases on `.start-wallpaper-layer[data-wallpaper-phase=…]`,
like `--start-wallpaper-evening-overlay` today.

Sampled with Electron's `nativeImage` (average of each photograph's bottom
8%):

| Phase | Light tint | Dark tint | Private tint |
| --- | --- | --- | --- |
| Sunrise (dawn, and the static page) | `#f8ede2` | `#4f4944` | `#3e3a37` |
| Day | `#f4f1ee` | `#4d4a46` | `#3d3b3a` |
| Dusk | `#bca6ae` | `#3a2c31` | `#261c20` |
| Night | `#9fabc3` | `#262d3d` | `#191d28` |

Ink: light `#6b6257` for sunrise and day and `#3f3830` for dusk and night;
dark `#cfc2b0`; private `#ccbba6`. Inside the footer, `--text-dim` is set to
the ink, so the links, pills and footer popovers follow it; it only ever
raises their contrast.

The footer itself reads the tint through `body[data-wallpaper-phase]`, which
`newtab-wallpaper.js` already sets. To keep the footer's frosted area in step
with the 2 s artwork crossfade, `--start-footer-tint` is registered with
`@property` (`syntax: '<color>'`, `inherits: true`) and transitioned on
`body` over 2 s with the same easing, and not at all under
`prefers-reduced-motion`.

### 3. The footer is transparent at rest

`.ledger-footer` drops `background` and `backdrop-filter` at rest. Its text
color comes from a new `--start-footer-ink`, which defaults to `--text-dim`
and is darkened or lightened per phase only where the contrast check (below)
needs it. The pills (Finish setup, Patron, What's new) and the Customize
button keep their own fills, so they become the only objects in the footer.

### 4. A feathered frosted area only while content runs underneath

The footer's `::before`, which used to be a 24 px fade in the flat
`--start-footer` color above the footer, now covers the footer and reaches
28 px above it (`inset: -28px 0 0`, behind the footer's content):

```css
background: color-mix(in srgb, var(--start-footer-tint) 72%, transparent);
backdrop-filter: blur(14px);
mask-image: linear-gradient(to bottom, transparent 0, #000 28px);
```

It fades in over 160 ms when `body.has-underflow` (already toggled by
`newtab.js`) is set, as before. Reaching above the footer, rather than
growing the footer's padding, keeps the measured `--start-footer-h` steady,
which would otherwise change the body's padding and could toggle
`has-underflow` back and forth.

### 5. What stays the same

- `prefers-reduced-transparency: reduce` and `prefers-contrast: more` keep
  a solid `--onboarding-surface` footer, with no frost layer.
- The startup card still hides the footer.
- The narrow footer (≤ 1040 px, two rows, 86–104 px) works unchanged because
  the scrim height follows `--start-footer-h`, which `newtab.js` measures.
- `--start-footer` is removed; nothing reads it.

## Legibility rule

Footer text is 10–11.5 px, so `--start-footer-ink` must reach 4.5:1 against
the composited bottom of every phase in every theme. A unit test enforces it
from the tokens in `pages.css`, and the visual pass checks the same twelve
combinations by eye.

## Alternatives considered

- **Keep the band, tint it per phase.** Fixes the color mismatch but keeps
  the hard top edge and the slab look; not "seamless".
- **Repaint the wallpaper inside the footer** (`background-attachment: fixed`
  plus blur). Duplicates the dynamic wallpaper's two-layer crossfade logic in
  a second place and still needs a scrim for legibility.
- **Progressive blur with stacked masked layers.** Looks best in theory but
  costs several `backdrop-filter` layers on every start page; the single
  feathered layer is enough at 54–104 px tall.

## Also in this change: the brand row lines up with the footer

At wide windows the Sunrise mark and date sat inside the content measure
(1080 px plus gutters, centered), well right of the footer's first item. The
brand row is now full width with the footer's own edge inset, one token
`--start-edge: clamp(24px, 4vw, 58px)`, so the mark's left edge and the
footer's first item match at every width where the footer is one row.
