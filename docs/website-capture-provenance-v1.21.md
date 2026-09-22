# Website capture provenance — public v1.21.0

`website-captures-v1.21.json` is the machine-readable source for the refreshed
four-layout Start Page set and standalone Mahjong capture. It supplements the
immutable v1.15 capture record; it does not rewrite the historical captures or
their provenance.

The images were captured September 22, 2026 from installed public Blanc 1.21.0
(bundle build 1210, arm64) in `/Applications/Blanc.app`. Strict deep `codesign`
verification passed immediately after capture. The observed publisher was
`Developer ID Application: Anthony Loria (XYGUCY4498)`, Team ID `XYGUCY4498`,
and the app carried a stapled notarization ticket. The executable SHA-256 was
`40c07d6461b1ad56ad85b6def27733f36295b02b50f3cd7e20d31652d4a38ede`.

The reproducible `npm run capture:start-page:installed` helper launched that
app in a disposable user-data directory with usage measurement and search
suggestions disabled. It seeded four synthetic Favorites, six synthetic
history-ranked sites, two named groups holding four quiet tabs, and a synthetic
Monday–Tuesday blocked-request total of 328. These fixtures contain no real
browsing, account, Patron, Sync, or participant data. The helper selected each
of the four shipped footer layouts, then used the shipped footer link to open
Mahjong in a managed tab. The Mahjong state is Daily Bridge in Burst mode at
0:00 with 50 pairs left, score 0, and an empty Burst rack. Every page was
captured at 1440×900; the helper did not retouch layout, copy, controls, or
tiles.

Published asset candidates:

- `ledger-v1.21.0.png` — `65ba9b375627714384fa1a2deb21f257b5d0c5e9e7105c900317b590e73567d6`
- `billboard-v1.21.0.png` — `3e0107aa2317451e747122b05ad2979f0996a64a80a60e10a2feaad876575dbd`
- `shelf-v1.21.0.png` — `0b3872b8348f96b3d55a3d01d8f4c2f44ed5dbc13601a06626ca60f4f56dadeb`
- `tally-v1.21.0.png` — `85e70e93eb0258727889575a3921b0bcf15691967b0a56385931a8011847377e`
- `mahjong-v1.21.0.png` — `675203949417c5d9492be8e17ccf337a7e2578896ebbd9730319ee1acff81efc`

All paths are beneath `site/public/feature-captures/`. Publication still
requires explicit owner approval of the finished images and their exact
captions.
