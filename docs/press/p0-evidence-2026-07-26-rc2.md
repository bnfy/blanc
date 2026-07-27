# P0 release-candidate evidence — July 26, 2026

Supersedes `p0-evidence-2026-07-24-rc1.md`. `rc.1` is retained for history; the
candidate under evaluation is `rc.2`, and the quiet-day clock restarted at its
publication.

## Candidate identity

- Version/tag: `1.0.0-rc.2` / `v1.0.0-rc.2`
- Immutable source commit: `91e2756610ebd07193ed7fc7e2ccc0fd348f7bb9`
- Published as a GitHub prerelease at `2026-07-26T04:30:52Z`
- Release: <https://github.com/bnfy/blanc/releases/tag/v1.0.0-rc.2>
- Distributed matrix: macOS Apple Silicon only
- Stable updater discovery remains on `v0.22.0`; the candidate is not marked
  Latest and is not offered to Stable users.

## Changes since rc.1

- A right-click context menu on the Island's address field, including Copy
  Clean Link and Paste and Go (#52).
- View Page Source on the page context menu (#51).

Both are additive feature work rather than P0/P1 defect fixes. The clock still
restarts, because the soak must run against the exact bits that ship.

## Stable-channel isolation

Verified against the live public endpoints rather than inferred from the
release flags:

- `https://github.com/bnfy/blanc/releases/latest` resolves to
  `.../releases/tag/v0.22.0`. The candidate did not take the Latest pointer.
- The stable channel's `latest-mac.yml` served from `/releases/latest/download/`
  reports `version: 0.22.0`, so a `0.22.0` install finds no update.
- `rc.2`'s own `latest-mac.yml` reports `version: 1.0.0-rc.2` and is reachable
  only through the prerelease channel.

Note for the record: a running `rc.2` build logs
`latest version: 1.0.0-rc.2` on its own update check. That is the prerelease
channel answering a prerelease client, not evidence that Stable users are
offered the candidate; the three checks above are what establish isolation.

## Source and automation gates

- Design-token, settings-schema, copy, and ad-block substrate checks pass. The
  committed `WKContentRuleList` blocklist matches its pinned sources at 108342
  rules.
- All 280 unit tests pass, 0 fail (259 at rc.1).
- Acceptance wiring resolves all 55 scenarios and 364 steps with no undefined
  or ambiguous steps (52 and 345 at rc.1).
- GitHub Actions on `91e2756`: Pre-release smoke `30187706740`, Parity guards
  `30187904707`, and Site `30187904735` all conclude success.

## macOS trust and packaged behavior

- `codesign --verify --deep --strict` reports the app valid on disk and
  satisfying its Designated Requirement.
- Signing chain is `Developer ID Application: Anthony Loria (XYGUCY4498)` →
  `Developer ID Certification Authority` → `Apple Root CA`, identifier
  `me.bnfy.bowser`, secure timestamp `Jul 26, 2026 at 12:26:15 AM`.
- Gatekeeper accepts the locally built app with
  `source=Notarized Developer ID`, and `stapler validate` succeeds.
- **The published artifact was verified independently of the local build.** The
  public DMG was downloaded logged-out, mounted, and the app copied out of it.
  That copy reports `CFBundleShortVersionString 1.0.0-rc.2`, is accepted by
  Gatekeeper with `source=Notarized Developer ID`, and passes
  `stapler validate`.

## Packaged clean-profile behavior

The packaged `rc.2` app was launched four times against a brand-new, empty
`--user-data-dir`, concurrently with the soak instance on its own profile:

- Cold start from an empty profile succeeds; the single-instance lock is
  per-profile, so the two instances coexist without interfering.
- A seeded `session.json` restores five tabs across two named groups with
  group-local and ungrouped pins intact.
- `tabLayout: "vertical"` from `settings.json` applies at first paint.
- `https` and `blanc://` pages both load; the ad blocker attaches and reports a
  per-tab blocked count in the Island.
- The updater runs and correctly declines to downgrade.
- No crash, hang, or renderer fault across the four launches.

This exercises clean-profile first run. It is not a substitute for the
migration smoke, which remains open below.

## Exact public artifact hashes

```text
831b508856264cc058365f1a3805a5bd4b8b27361657df3101bb16e8ceb7398e  Blanc-1.0.0-rc.2-arm64-mac.zip
a895df42eb8b6f3003be209f907616af418c61b7ec3a769eacfa7f12509dda90  Blanc-1.0.0-rc.2-arm64-mac.zip.blockmap
d2ded273605b4c271cb52af53656da9c237284b8b1bc9ad0bcbd276dfdcdbdb5  Blanc-1.0.0-rc.2-arm64.dmg
2238416c1d5a9bdb9ee64af5e70113182625b63898747cc996f619027c50f96a  Blanc-1.0.0-rc.2-arm64.dmg.blockmap
530e06c5b5f040c3b520d2cbf71d77778517f624262a24ae56bacf8c19645d83  latest-mac.yml
```

All five assets were fetched from
`https://github.com/bnfy/blanc/releases/download/v1.0.0-rc.2/` without
credentials, each returning HTTP 200, and `shasum -a 256 -c` reports OK for
every file against the published `SHA256SUMS`. Published sizes are 138521990
(zip), 146518 (zip blockmap), 139166409 (dmg), 138294 (dmg blockmap), and 519
(`latest-mac.yml`) bytes.

## Reviewer surface

- The `/press` reviewer kit already carries the `v1.0.0-rc.2` identifier.
- The vertical-tabs screenshot gate is **closed**. The stale capture predated
  `03741ec` ("Refine resizable vertical tabs and sidebar controls") and showed
  the superseded rail: inset below the chrome strip, with a hairline right
  border. It has been replaced with a native window capture taken from the
  packaged `rc.2` app, showing the accepted rail — full window height with the
  traffic lights inside it, the inset shadow separator instead of a border, the
  resize edge, named groups with counts, and the pinned section.
- The capture is a 2× native window grab downscaled to 1400×875 and converted
  to sRGB to match the surrounding assets.
- Replacing the asset exposed a latent layout defect in the gallery: the `img`
  `height` attribute stayed a definite length, which made the CSS
  `aspect-ratio` inert and letterboxed every shot inside an over-tall box. All
  four gallery images rendered at their attribute height regardless of aspect.
  Fixed by adding `height: auto`, and the vertical shot's hardcoded
  `aspect-ratio: 1400 / 888` was corrected to `1400 / 875`. All four images now
  render at their natural aspect with no horizontal overflow at 1280px.
- The editorial dimensions are pinned in three places that must agree:
  `test/unit/press-kit.test.js`, the `img` attributes in `press.astro`, and the
  `aspect-ratio` in `site.css`. All three were moved to 1400×875 together.

## Candidate-window gates still open

- **Seven consecutive quiet days.** The clock began at publication,
  `2026-07-26T04:30:52Z`, and completes no earlier than
  `2026-08-02T04:30:52Z`. A P0/P1 fix creates an immutable `rc.N` and resets
  it. As of `2026-07-27T03:56:18Z` the candidate has been quiet for 23h 25m.
- **Active human tester.** The packaged `rc.2` build has run continuously on
  the release Mac against the real user profile since `2026-07-26T04:32:53Z`.
  This satisfies at least one active tester on the one distributed
  platform/architecture, and should be restated at Stable with the observed
  defect count.
- **Same-profile migration smoke** from public Stable `v0.22.0` to the
  candidate has not been re-run for `rc.2`.
- **Cold-online startup, pre-consent, persisted opt-out, corrupt-cache/offline
  recovery, Retry, and Continue-without-blocking** paths have not been re-run
  for `rc.2`.
- **Deterministic Google OAuth compatibility and native DNS smoke** have not
  been re-run locally for `rc.2` beyond what Pre-release smoke `30187706740`
  covers.
- Final Stable links, checksums, release notes, and site staging remain Day 13
  work.
