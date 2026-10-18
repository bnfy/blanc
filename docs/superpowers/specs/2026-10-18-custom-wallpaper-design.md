# Start Page wallpaper image (F49) — design

Date: October 18, 2026. Status: implemented on `claude/infallible-ritchie-497f5a`, unreleased.

## Why

A user asked for custom wallpapers. Today the Start Page can draw only bundled
art: the static Sunrise, or the four time-of-day phases. This adds the person's
own picture. Blanc is moving to a forked Chromium, so the rules live in a pure
module and every new surface goes through the existing guarded contracts.

## Competitor audit (October 18, 2026)

These are first-party sources where possible. Dia, SigmaOS and Orion are thinly
documented. This is planning input only: none of it may be used in marketing
copy without `docs/marketing-claims.md` sourcing.

| Browser | Own image | Gallery / daily | Theme color | Per-space theme | Notable |
|---|---|---|---|---|---|
| Chrome | yes | collections, "Refresh daily" | swatches + eyedropper | per profile | Customize Chrome side panel |
| Edge | yes | yes, daily | 14 swatches | per profile | AI theme generator recolors the frame |
| Vivaldi | yes | Unsplash daily | full editor, accent from page | private-window theme | only verified theme scheduler; transparency, corner radius |
| Opera / GX | yes | yes; animated live wallpapers | shader themes | — | GX Mods store |
| Brave | yes | yes; solid colors, gradients | Chromium | per profile | sponsored images layered on top |
| Firefox | yes (139) | curated collections | light/dark/colorful | per profile | AMO themes |
| Safari | yes | presets | system accent | per profile | Start Page syncs |
| Arc | — | — | color grid, 3-stop gradient, grain | per Space | maintenance-only |
| Zen | — | — | gradient + noise picker | per workspace | mods registry, live CSS |
| Helium | — | minimal | gray + schemes | — | deliberately plain |
| Orion | yes (v129) | — | accent; tab-color borders (paid) | — | — |

What this means for Blanc:

1. Uploading your own image is table stakes.
2. Per-space theming is what sets the newer browsers apart, and Blanc already
   gives each Space a color and symbol.
3. No browser was found with a readability control. Blanc's automatic wash and
   footer fog keep that decision out of the person's hands.
4. Only Vivaldi schedules its theme, and Blanc already has time-of-day phases.
5. Deliberately out: theme marketplaces, custom CSS, animated wallpapers, and an
   Island accent color (the Island stays neutral).

## Behavior

- **Customize popover.** Below the time-of-day switch is a **Your image** switch,
  with **Change…** and **Remove** once an image is stored. Turning the switch on
  with no image opens the file picker. Turning it off returns to whatever the
  time-of-day switch says. Pressing the time-of-day switch while your image is
  showing switches to the time of day.
- **Settings → General → Start Page image.** It has the same switch and
  Choose/Change and Remove buttons. Errors replace the hint.
- **Accepted files.** JPEG or PNG up to 25 MB, the formats Electron decodes the
  same way on all three platforms. Errors use fixed ids (`too-large`,
  `unsupported`, `unreadable`) with translated text.
- **Stored copy.** The image is fitted inside 3840 px and re-encoded as a JPEG
  at quality 85. Re-encoding drops all metadata. Electron's decoder ignores EXIF
  orientation (we measured this), so the copy gets a one-tag EXIF segment with
  only the original orientation, and Chromium draws it upright. It is stored at
  `userData/wallpaper/current.jpg` (mode 0600, written atomically), and its
  record in `wallpaper.json` holds `{hash, width, height, updatedAt}`.
- **Private tabs** never receive the address and don't offer the control.
- **Legibility.** The photo is centred and cropped to fill. It gets an even
  theme wash (stronger than Sunrise's in light mode, because a photo has no calm
  band behind the text), and the footer gets the neutral day fog and ink.
- **Fade slider** (added after the owner's review of the first build). It shows
  in the popover while your image is on, and runs from 0 (the image as chosen)
  to 100 (the default wash), in steps of 5. It paints live as you drag (a CSS
  multiplier on the wash's alpha) and saves on release to the device-local
  `newtabWallpaperWash`. The footer fog doesn't change, so the footer stays
  readable even at 0; the clock and the lines under it become the person's own
  call.
- **Sync.** The image stays on this device. `newtabCustomWallpaper` is
  device-local. The synced `newtabDynamicWallpaper` is never changed by picking
  your image, so other devices keep their own choice.

- **Wash style** (added after the owner's review, modeled on the overlay
  choices CMS hero banners offer). Above Fade, a **Wash** row offers Auto ·
  Light · Dark · Spotlight, stored in the device-local `newtabWallpaperStyle`.
  Light and Dark override the Start Page's whole color set: text, surfaces,
  footer tint, `color-scheme`, and dropping the clock glow under Dark. Text
  therefore contrasts with the wash even when the app theme is the opposite.
  Spotlight is an oval wash behind the clock and content plus a band behind
  the header, fading to the bare photo at the edges. Fade scales every style.
  `newtab.js` sets `body[data-wallpaper-style]` only while your image is
  showing, so the bundled artwork never sees these overrides.

- **Popover structure** (revised after review). Labelling alone kept the
  clock switch looking as if it applied to your photo ("Dynamic wallpaper",
  then "Change with time of day"). The Wallpaper section is now a choice of
  **Sunrise** or **Your image**, and only the chosen wallpaper's options show.

## Serving

`blanc://` answers requests from any page, so the address holds a random name
generated at each launch (`user-wallpaper-<32 hex>.jpg`), checked before the flat
`PAGES_DIR` resolver and answered from that one file. A guessed name gets the
ordinary not-found response. The `newtab.html` CSP is unchanged, because
`img-src 'self'` already covers it. In a Chromium port this becomes a WebUI
data-source path.

## Fork portability

- `src/main/wallpaper-model.js` has no Electron dependency. It holds the source
  choice, the settings write for each source, size limits, record validation,
  and the EXIF orientation reader and writer. Its unit tests are the vectors.
- `src/main/wallpaper.js` is the Electron adapter: decode, resize, atomic write,
  serving.
- New page capabilities are in `browser-api/bridges.json`
  (`start.*`/`settings.*`: `wallpaper`, `setWallpaper`, `chooseWallpaper`,
  `removeWallpaper`), and the settings key is in `settings-schema/schema.json`.
- The fork prototype's `localStorage` wallpaper preference
  (`prototype/newtab-adapter.js` on the spike branch) should move to these keys.

## Deviations from the first plan

- A device-local boolean instead of a synced three-value enum. That needs no
  migration, keeps a rollback to 1.37 harmless, and leaves the synced key alone.
- No luminance-based ink. The theme wash plus the fixed day fog already
  guarantees contrast for any image.
- No WebP/HEIC. `nativeImage` decodes them on macOS only, and one format list on
  all platforms is simpler to explain.

## Later phases (separate specs)

1. Solid and gradient backgrounds from the eight Space presets. This is pure CSS
   and syncs trivially.
2. A wallpaper per Space, following the active Space, on top of
   `space-identity.js`.
3. A light/dark schedule that reuses `phaseForTime`. It drives `nativeTheme`
   today and `ThemeService` in the fork.
4. Wallpaper sync as a separately budgeted encrypted image store, only if
   people ask for it.
