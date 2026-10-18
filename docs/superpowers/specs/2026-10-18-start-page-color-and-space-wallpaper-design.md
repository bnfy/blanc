# Start Page color backgrounds and Space wallpapers — design

Date: October 18, 2026. Status: **direction A chosen by the owner on October 18, 2026** (Color as a
third wallpaper, plus Match each space's color). Not implemented yet. Follows F49 (PR #945, unreleased), whose spec
(`2026-10-18-custom-wallpaper-design.md`) lists both as later phases:

1. Solid and gradient backgrounds built from the eight Space presets.
2. An optional wallpaper per Space, which the Start Page follows when the
   window's Space changes.

Nothing here may appear on the website or in marketing until it ships in a
public release (`docs/marketing-claims.md`).

## What already exists

- **The Customize popover** (F35/F49): Layout thumbnails, then a Wallpaper
  section: a `Sunrise | Your image` segmented control over a cover preview,
  and only the chosen wallpaper's options below it (the clock switch under
  Sunrise; Change, Remove, Wash and Fade under Your image).
- **Space identity** (`src/renderer/space-identity.js`): eight presets (Sage
  `#426c4c`, Sky `#376694`, Iris `#6757a3`, Rose `#9b4761`, Clay `#974f2a`,
  Sand `#815c02`, Slate `#576471`, Graphite `#3a3a3a`), drawn exactly as
  stored; `paint()` picks white or black ink at 4.5:1 or better (all eight get
  white); `wash()` makes a faint theme tint.
- **Space records** (`src/main/workspaces-model.js`): each Space has `color`
  (any hex, usually a preset) and `symbol`. Spaces live per profile in
  `workspaces.json`, not in Profile Sync. A window is bound to at most one
  Space (the session `workspaceId`); a window outside a Space has none.

## The paint (shared by every direction)

One preset hex, three fills. All are pure CSS; no image is stored.

| Fill | Light theme | Dark theme | Ink |
|---|---|---|---|
| **Soft** | preset mixed 16% into the page background | 36% into the dark background | follows the theme |
| **Solid** | the preset exactly | same | `paint().on` (white for all eight) |
| **Gradient** | a tonal gradient: lighter top-left glow, the preset in the middle, deeper bottom-right | same | `paint().on` |

Solid and Gradient switch the page's text set the way F49's **Dark** wash does
(light text, no clock glow); the Customize popover keeps the app's own
material so its controls read the same on every color. The footer drops its
fog on Solid and Gradient (the color is already calm) and keeps the
`paint().on` ink: white, 6.0:1 on the seven colored presets and 11.4:1 on Graphite. The gradient's lighter glow must be capped so the header date still clears 4.5:1; that is a test vector at implementation. A custom
(non-preset) Space color goes through the same `paint()` guard.

The gradient is derived from the one hex with `color-mix(in oklab, …)`, so no
second color is picked and the eight presets need no new tokens beyond the
existing `space-*` set.

## Three directions

Mock-ups are the real `newtab.html` and `pages.css` with a temporary variant
stylesheet, Billboard layout, 1280×800 at 2×, light theme unless noted.

### A — Color as a third wallpaper (the Chrome/Edge swatch pattern)

`Sunrise | Color | Your image`. Color shows the cover preview, a row of the
eight presets, and **Fill: Soft · Solid · Gradient**. Under a thin rule, one
switch: **Match each space's color** ("In a space, the Start Page takes that
space's color."). With it on, a window in a Space paints that Space's color
with the chosen fill; the swatch row dims there and the hint names the Space.
A window outside a Space shows the chosen wallpaper.

- Settings: synced `newtabWallpaperColor` (preset id or null), synced
  `newtabWallpaperFill` (`soft|solid|gradient`), synced
  `newtabFollowSpaceColor` (boolean). Colors are presets, so they sync as
  ids, like the layout.
- Per-Space wallpaper is the Space's own color; no new field on the Space
  record, nothing to keep in step when a Space is recolored.
- Smallest change: one more segment, one row, one switch.

### B — A gallery, set for all spaces or just this one (the Brave/Safari gallery pattern)

The segmented source control becomes a tile gallery: Sunrise, Time of day,
Your image (+), then the eight presets as gradient tiles, then **Fill**. When
the window is in a Space, the section header gets a scope switch
**All spaces | ▣ Research**; picking a tile under the Space scope saves it for
that Space only, and a caption offers **Use the all-spaces wallpaper**.

- Per-Space wallpaper is any wallpaper, including its own photo.
- Settings: the same synced color/fill keys for "all spaces"; each Space record
  gains an optional `startPage: { source, color?, fill?, image? }`. A
  per-Space photo needs one stored file per Space
  (`userData/wallpaper/<spaceId>.jpg`), cleaned up when the Space is deleted.
- Most flexible, most to explain: the scope switch changes what every tile
  below it means, and the popover grows by two rows.

### C — Space first (the Arc/Zen pattern)

In a Space, the Wallpaper section is headed by the Space (tile, name, "This
space's Start Page") and offers `Sunrise | Space color | Your image`. Space
color uses the Space's own color ("Uses Rose, Side projects' color ·
Change…", which opens the Space's color picker), with **Fill**. Whatever is
chosen is saved for that Space automatically; **Use in every space** copies it
to the rest. Outside a Space the section reads like A, with swatches.

- Per-Space wallpaper by default, no switch; the Space and its Start Page feel
  like one thing.
- Settings: as B for the per-Space record; the outside-a-Space choice uses the
  synced keys.
- Surprising for anyone who sets a wallpaper once and expects it everywhere:
  in a Space it changes only that Space.

## Recommendation

**A.** It keeps the cover-preview structure the owner already chose, adds one
segment and one row, and stays balanced in the popover (the swatch row matches
the Layout row's width and rhythm). "Match each space's color" delivers the
per-Space look that sets Arc and Zen apart with a single synced boolean and
nothing new on the Space record. It is also the most portable: the whole
feature is a pure paint function plus three schema keys.

B's per-Space photos can follow later as a scope switch on top of A if people
ask for different images per Space; nothing in A blocks it.

## Shared rules (any direction)

- **Precedence on a device:** your image (device-local) > Space color (when
  following and the window is in a Space) > color > time of day > Sunrise.
  Picking Sunrise clears `newtabWallpaperColor`; the time-of-day boolean is
  left as it was.
- **Live update:** the Start Page repaints when its window's Space changes
  (switching Spaces, a Space recolored), through the existing `startPage`
  hooks; `pages:start:data` gains `{ spaceColor }` (a hex or null) and the
  page never sees the Space's name or id.
- **Private tabs:** keep Sunrise/time of day only, as today; no Space color.
- **Rollback:** older builds ignore the new keys and show Sunrise or time of
  day. No migration.
- **Fork portability:** the fill rules (gradient stops, ink, footer) go in a
  pure `start-page-paint.js` next to `space-identity.js`; the keys go in
  `settings-schema/schema.json`; the `spaceColor` field goes in
  `browser-api/bridges.json`.
- **Accessibility:** swatches are buttons with the preset name as their label
  and `aria-pressed`; Fill is the existing segmented control.

## Out of scope

Two-color gradients, an eyedropper or free color picker on the Start Page,
grain/noise, animated gradients, and an Island accent color (the Island stays
neutral).
