# Billboard clock Font & color — design

Date: October 21, 2026. Status: **implemented as F54** on
`claude/billboard-clock-customization`, unreleased, awaiting the owner's
review of the look. Asked for by the owner with a screenshot of the iOS Lock
Screen's **Font & Color** sheet (four "12" typeface samples over a weight
slider; a row of color swatches over a tone slider; **Glass | Solid**).

Nothing here may appear on the website or in marketing until it ships in a
public release (`docs/marketing-claims.md`).

## What already existed

- **The Billboard layout** (`newtab.html` `#layoutBillboard`): a large clock
  (`#bbClock`, Instrument Sans 500, `clamp(80px, 12vw, 148px)`, the page's
  `--text` with a light glow on the light landscape), the week's blocked count,
  top sites and groups.
- **The Customize popover**: Layout thumbnails, then Wallpaper (F49/F50). It
  is already tall, so the clock's options do not go inside it.
- **Bundled faces** (`src/renderer/pages/`, SIL OFL 1.1): Instrument Sans
  (wght 400–700, wdth 75–100), Inter (100–900), JetBrains Mono (400–800) and
  Caveat. The app ships no commercially licensed font.

## The design

### Way in

Customize gains one line under the layout thumbnails, **Clock font & color…**,
shown only while Billboard is the layout. It closes Customize and opens the
clock's own popover, anchored under the clock (`position-anchor: --bb-clock`,
flipping above it when there is no room), so the clock stays in view and every
change shows on it as it is made, as on iOS. Escape or a click elsewhere closes
it; keyboard focus returns to Customize. Changing away from Billboard closes it.

### The popover (iOS order)

1. **Font & color** heading.
2. **Font**: four buttons, each the numerals "12" drawn in its face —
   Instrument Sans, Instrument Sans Condensed (`wdth` 75), Inter, JetBrains
   Mono — named for screen readers and on hover. Caveat was left out: its
   numerals do not read at clock size.
3. **Weight** slider across the chosen face's own range. The previews follow
   it.
4. **Height** slider, 100–300%: the Lock Screen's stretch (see below).
5. **Color**: **Automatic** first (drawn as the page's text beside its
   background), then the eight Spaces presets, named as in the Spaces menu.
6. **Tone** slider, shown for a preset only: 50 is the preset exactly; left
   deepens it up to 70% of the way to black, right lightens it up to 88% of
   the way to white, so the ends stay a color.
7. **Glass | Solid**.

### Height (the stretch)

Apple's clock grows taller without its strokes thickening. Scaling type
vertically (`scaleY`) would thicken every horizontal stroke and flatten every
curve, so Blanc stretches the figures the way a type designer would draw a
taller cut: each figure is rasterised (twice oversampled) from the clock's own
face, size, weight and spacing, and the extra height goes only to rows that
vertical strokes cross. Such a row matches its neighbours; rows inside a
horizontal bar also match, so they are told apart by width (any ink run wider
than 1.6 stems is a bar or the flat of a curve and never stretches). Among the
eligible rows the stretch favours the most vertical, so a bowl's straight
sides take it, curves keep their shape, and a figure with no vertical row (7's
diagonal) shares it evenly and the diagonal simply steepens. The colon's dots
keep their size and spread apart, three quarters of the stretch between them
and the rest above, landing about a third and four fifths of the way down as on
the Lock Screen. Rows are repeated, never blended, so nothing smears, and the
result is scaled back down to device pixels.

At 100% the clock is the typeset text exactly. Above it the clock is drawn
(`src/renderer/pages/clock-art.js`, pure pixel rules plus canvas drawing) and
the typeset text stays in place, out of sight, for screen readers. The drawn
clock is held to half the window's height. Canvas fonts can't take
`font-variation-settings`, so Instrument Sans is drawn from two faces pinned
to the clock's widths (`Blanc Clock Instrument` at 98%, `Blanc Clock
Condensed` at 75%); measured against the typeset clock, the drawing matches it
to a hundredth of a pixel.

### Glass

Real refraction, in the page: the figures are a lens over the Start Page. A
`backdrop-filter` runs an SVG `feDisplacementMap` over whatever is behind the
figures (wallpaper, your image, a color), masked to the figures' shape, with a
little saturation and brightness. The displacement map comes from a blurred
copy of the figures, so the page bends outward across a rounded bevel at every
edge, as through a lens. Over that sits the glass's own light from the same
bevel: a bright rim where it faces the light (above, a little left), a darker
edge facing away, and a faint body in the clock's color. Under
`prefers-reduced-transparency: reduce` it draws as Solid in the same color.

No filter, opacity or transform may sit on the lens's ancestors: each one makes
a backdrop root and the lens would bend nothing. A diagnostic run over a
striped page showed the stripes bent inside the figures.

**Why not macOS's own Liquid Glass.** The system material (macOS 26's
`NSGlassEffectView`) is a native view. Electron 44 exposes no API for it, only
the older window-level `vibrancy`. Using it would mean a native module in the
signed, notarized app; a native view stacked above the page that can't follow
the page's layout, and would draw over the Customize and Font & color popovers
and the utility sheets; clipping that view to glyph shapes; and a macOS-26-only
look with a different one elsewhere. The in-page lens samples the same thing
the system glass would (the page behind the figures), works on every platform,
and stays inside the page's stacking.

### Shadow

Every clock (typeset or drawn, Solid or Glass) carries a shadow so the
figures read over any wallpaper in any color. For Solid it is the opposite of
the ink: light ink gets a dark hairline, a close soft shadow and a wide one;
dark ink gets the same as a light halo. Every figure then has an edge of the
opposite brightness whatever is behind it, as subtitles do. This replaces the
light glow the clock had only on the light theme. Glass gets a dark contact
shadow and a wide soft one, drawn outside the figures only, so the glass stays
clear. Checked over Sunrise, white, black, a dusk photo, saturated red and
stripes, with Automatic, a deep preset and a pale toned preset.

### Settings

Five synced keys, like the layout and the Color wallpaper — they describe the
browser you want, not the device you are on:

| Key | Values | Default |
|---|---|---|
| `newtabClockFont` | `instrument`, `condensed`, `inter`, `mono` | `instrument` |
| `newtabClockWeight` | integer 100–900, drawn inside the face's range | `500` |
| `newtabClockColor` | `auto` or a Spaces preset id | `auto` |
| `newtabClockTone` | integer 0–100 | `50` |
| `newtabClockStyle` | `solid`, `glass` | `solid` |
| `newtabClockHeight` | integer 100–300 (percent) | `100` |

The defaults draw the clock as before, now with the shadow. The weight is saved as chosen
and drawn inside the face's range, so Inter at 200 shows as 400 in Instrument
Sans and comes back as 200 in Inter. Unknown values read as the defaults, and
an older build ignores the keys.

The page writes through one guarded call, `bowserPages.start.setClock(partial)`
(`pages:start:set-clock`, newtab only); each field is validated on its own and
anything else is ignored. The reply, and every `pages:start:status`, carries
the finished clock from the pure `src/main/start-clock-style.js`: the face, the
drawn weight and its range, the color and tone, the ink as one hex (or null for
Automatic), the preset and tone mix (so the page can follow the tone slider
while it is dragged), the style and the presets. Sliders preview while dragged
and save once on release.

### Decisions worth the owner's eye

- **No contrast guard on the clock color.** Elsewhere Blanc keeps text at
  4.5:1, but the clock is display text drawn over any wallpaper (including the
  person's own image), and the color is an explicit choice, as on iOS.
  Automatic keeps the legible default.
- **Private tabs draw the same clock.** Like the layout, the choice says
  nothing about browsing.
- **Billboard only.** No other layout has a clock.

## Out of scope

iOS's direct drag handle on the clock (Height is a slider), its depth effect
(the clock behind the subject), the non-Latin numeral systems and its
rainbow/wallpaper-derived swatch. The
**Automatic** swatch is the closest equivalent to the last.

## As built

- `src/main/start-clock-style.js` — pure rules (no Electron).
- `src/main/settings.js`, `settings-schema/schema.json` — the five keys,
  synced, sanitized on read and write.
- `src/main/pages.js`, `src/main/tab-preload.js`, `browser-api/bridges.json` —
  `start.setClock`.
- `src/main/main.js` — `clock` in the Start Page status.
- `src/renderer/pages/clock-art.js` — the stretch, the glass's refraction map
  and light, and the shadows.
- `src/renderer/pages/newtab.html`, `newtab.js`, `pages.css` — the way in,
  the popover, the refraction filter and the clock's drawing.
- `copy/messages/*.json` — `newtab.clock.*` in every language.
- Tests: `test/unit/start-clock-style.test.js`, `test/unit/clock-art.test.js`,
  `test/desktop/billboard-clock-smoke.mjs` (`npm run
  test:billboard-clock:desktop`, in the parity-guards Electron job).
