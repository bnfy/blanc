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
4. **Color**: **Automatic** first (drawn as the page's text beside its
   background), then the eight Spaces presets, named as in the Spaces menu.
5. **Tone** slider, shown for a preset only: 50 is the preset exactly; left
   deepens it up to 70% of the way to black, right lightens it up to 88% of
   the way to white, so the ends stay a color.
6. **Glass | Solid**.

### Glass

Text cannot blur what is behind it, so the glass is drawn rather than sampled:
a translucent fill of the clock's color, lit from above (`background-clip:
text` over a gradient that runs from near-white through the color at about
half opacity to a brighter lower edge), a 1 px bright rim (`-webkit-text-
stroke`), and a soft drop shadow. Under `prefers-reduced-transparency: reduce`
it draws as Solid in the same color.

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

The defaults draw the clock exactly as before. The weight is saved as chosen
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

iOS's clock size, depth effect (the clock behind the subject), the
non-Latin numeral systems and its rainbow/wallpaper-derived swatch. The
**Automatic** swatch is the closest equivalent to the last.

## As built

- `src/main/start-clock-style.js` — pure rules (no Electron).
- `src/main/settings.js`, `settings-schema/schema.json` — the five keys,
  synced, sanitized on read and write.
- `src/main/pages.js`, `src/main/tab-preload.js`, `browser-api/bridges.json` —
  `start.setClock`.
- `src/main/main.js` — `clock` in the Start Page status.
- `src/renderer/pages/newtab.html`, `newtab.js`, `pages.css` — the way in,
  the popover and the clock's drawing.
- `copy/messages/*.json` — `newtab.clock.*` in every language.
- Tests: `test/unit/start-clock-style.test.js`,
  `test/desktop/billboard-clock-smoke.mjs` (`npm run
  test:billboard-clock:desktop`, in the parity-guards Electron job).
