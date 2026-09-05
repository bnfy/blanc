# Website capture provenance — public v1.15.0

The complete verified capture inventory, dimensions, hashes, fixture settings,
and individual UI states are recorded in `website-captures-v1.15.json`.
The exact new/changed website wording and release-tag evidence are recorded in
`website-v1.15-claims.json`. Publication still requires the website review and
deployment gates; capture verification alone is not deployment approval.

## Mahjong — Turtle / Classic

- Published asset: `site/public/feature-captures/mahjong.png`.
- Capture date: September 4, 2026 (America/New_York).
- Source: public v1.15.0, commit
  `d0c2304c7cef12a6fa0d66c559aebb1198a86434`.
- App: the unchanged `Blanc.app` from the published arm64 DMG, mounted read-only.
  Strict deep codesign and Gatekeeper checks passed outside the filesystem
  sandbox; Developer ID team `XYGUCY4498`.
- DMG SHA-256:
  `0b0cccc5504ed5b40d68864667f73453f91ba672092d299812124c8ddc46e57d`.
  Release evidence: `docs/release-incidents/2026-09-02-v1.15.0.md`.
- Isolated sample user-data directory; light appearance; usage measurement and
  search suggestions disabled; no sync account or Patron entitlement added.
  Favorites, history, groups, and block totals elsewhere in this capture session
  are fixture data, not benchmark results or personal browsing data.
- UI selection: Start Page → Mahjong → Boards → Random → Turtle → Classic →
  Start game. No game UI, tiles, or controls were fabricated or retouched.
- Game state: Turtle revision 1, Classic, random seed `931422097`, 144 tiles,
  72 pairs remaining, timer 0:00; no tiles removed, moves, hints, or shuffles.
  Stronger free-tile highlight is off. The Start Page footer remains visible.
- Native window capture: 2560×1600 pixels, without the macOS window shadow.
  Proportionally resized to 1440×900, retaining transparent native corners.
- Asset SHA-256:
  `4abb3c546305805cdf14e8431c155277774b4baad3b1ce2e89e7dce149b8091c`.
- Consumers: homepage Start Page showcase, Start Page guide, Press gallery.
- Replaces the previous Fortress / Daily / Burst capture at the owner's request:
  Turtle's fuller layered arrangement shows the tile artwork more clearly.

### Image claims and qualifications

| Exact wording / visible claim | Release-tag evidence | Qualification | Verdict |
| --- | --- | --- | --- |
| “Turtle / Classic”; “72 pairs left”; “0:00” | `v1.15.0:src/renderer/pages/mahjong.html`, `mahjong-engine.js`, and the native capture | A newly dealt sample game, not a completed game or performance measurement | verified |
| “The layered Turtle board in Classic mode, with 72 pairs and game controls, in Blanc’s Mahjong start page.” | Same release files and capture | Describes the pictured Classic board, not the Daily board | verified |
| “Turtle in Classic mode, one of eight solvable-by-construction boards in the start page.” | `v1.15.0:src/renderer/pages/mahjong-engine.js`, `mahjong-state.js`, release incident | Solvable when dealt; subsequent player choices can leave no available match | qualified |

Mahjong artwork remains subject to the repository's applicable identity-asset
and third-party notices; this record does not grant additional trademark rights.
