# App Store screenshots: the design

The App Store screenshots for Blanc for iPhone are designed on a Claude Design
canvas, **Blanc for iPhone App Store Screenshots**
(<https://claude.ai/artifact/Axk4cZzuRm1ywRbrnxUbhk>, private to the owner).
`project/` here is a copy of that canvas's own files, exactly as the canvas
holds them: `canvas.json` (the artboards' order and titles) and one
`.dc.html` per screenshot. Direction C, "dawn to day", chosen by the owner on
November 2, 2026: each shot is a step later in one sunrise, from dawn behind
the gold Sunrise on the first to Blanc White on the last; headlines in Blubird
Display, subtitles in Blubird Text, and the real app in a plain dark frame.

`assets.json` maps each `/_blob/<id>` the artboards name to a file in this
repository: the captures in `../captures/`, the desktop's Connect your
iPhone capture in `site/public/feature-captures/`, the Sunrise export in
`site/public/lockup/`, and Blubird in `site/public/fonts/blubird/`, which
`npm run site:fonts` installs and git ignores (the license forbids
redistribution; the owner allowed the canvas's private asset store to hold a
copy).

## Changing the screenshots

- **A caption:** retype it on the canvas (or here). Check it against
  `docs/marketing-claims.md` and the table in `../../app-store-listing.md`.
  Then copy the changed `.dc.html` files from the canvas into `project/` and
  run `npm run ios:app-store-screenshots -- --compose`.
- **A capture:** change `ios/Blanc/BlancUITests/AppStoreScreenshotsUITests.swift`
  or the `-BlancUITestAppStore` seed (`ios/Blanc/Blanc/UITestSeed.swift`) and
  run `npm run ios:app-store-screenshots`. Upload changed captures to the
  canvas as assets and point its artboards and `assets.json` at the new ids,
  so the canvas shows what Apple gets.
- Never draw, retouch or invent app UI: every phone screen is a capture of the
  running app.

The composed PNGs land in `../6.9/` (1320 × 2868) and `../6.3/`
(1206 × 2622), opaque, as App Store Connect requires. Artboards on a canvas
page with the id `cpp-<page>` belong to a custom product page and land in
`../custom-pages/<page>/` instead (see its README).

## The iPad page

The `IPad*.dc.html` artboards (page `page-ipad-13`, 2752 × 2064) are Blanc
for iPad's 13" set, in the layout the owner chose on November 12, 2026: the
caption centered above a large landscape iPad, the skies again dawn to day.
They were written here in the canvas's format and are not on the Claude
Design canvas yet; until they are, the `/_blob/` ids of their captures are
this repository's own (the MD5 of each capture's path), mapped in
`assets.json` like the rest. `npm run ios:app-store-screenshots -- --ipad`
captures `../captures/ipad-13/` and renders these artboards alone into
`../ipad-13/` (`ios-app-store-compose.mjs --only ipad-13`), leaving every
other set's files as they are; `-- --ipad --compose` re-renders from the
committed captures.
