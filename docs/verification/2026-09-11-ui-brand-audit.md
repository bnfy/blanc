# App UI brand audit — September 11, 2026

The owner requested that app UI stop using the legacy B mark, with an explicit
exception for the B motif inside Mahjong tile artwork as a nod to Blanc's
origins. No Mahjong source or image was changed.

## Changes

- Default-browser and bookmark-import onboarding now use the bundled Sunrise
  tile, with Sunrise Dark selected by `prefers-color-scheme`. Both already-open
  screens switch assets when the theme changes.
- Settings and the native macOS icon catalog now offer only Sunrise and
  Sunrise Dark. Previously saved Paper/Ink and other retired ids use the
  existing sanitize-on-read fallback to Sunrise; invalid writes cannot restore
  a retired choice. Other preferences remain intact.
- Removed the stale Settings hint that Finder keeps Paper; platform artwork
  already uses Sunrise. Toolbar/internal-page favicons, About, and the Mahjong
  header already referenced Sunrise.
- Removed the unused B SVG from the privileged chrome resource allowlist.
  Packaging excludes the B SVG and every retired monogram app-icon PNG.
  Historical source artwork and exports remain in the repository, while all
  Mahjong assets remain included in the app payload.
- The native icon compiler's default artwork is also Sunrise, preventing a
  missing image-name field from silently selecting the legacy B source.

## Verification

- Isolated Electron walkthrough: all six steps completed in light and dark
  appearances; both changed screens were usable at 640×480. Actual image decode
  and `currentSrc` checks verified light/dark selection and live switching.
- Isolated Electron Settings: a saved Ink preference displayed Sunrise;
  only Sunrise/Sunrise Dark were rendered and both could be selected.
- Regression guards scan renderer code for retired asset references/geometry,
  exercise electron-builder's actual file matcher to exclude retired icons
  while retaining Sunrise and Mahjong, validate native icon definitions, and
  check retired settings ids cannot reach UI or be selected again.
- `npm run substrate:check` and `git diff --check` passed.
- Full unit suite: 1,773 passed, zero failed, after preparing the isolated
  checkout's ignored blocker seed. An initial run started before that asset
  existed and failed four compliance checks; the prepared rerun passed fully.

These are source and local-runtime checks. No new signed package or release
was produced, and the installed application was not modified.
