# Meet the island — desktop candidate

Based on freshly fetched origin/main, separate from the website delivery.
The existing step introduces one idea: “Tabs, search and navigation, all in one
place.” Its illustration is captured from the actual quiet Island renderer and
scales uniformly. The only hint is the current platform's shortcut: ⌘L on Mac,
Ctrl+L on Windows/Linux. Its accessible name spells out the modifier.

The capture shows an ordinary HTTPS page with three tabs: Back, Forward, tab
dots, the site favicon, domain, New Tab, blocker shield, the real separator,
Reload, Favorite and Close. Light and dark assets retain the native geometry,
colors and icons. Conditional activity, such as downloads and private browsing,
is absent from this ordinary browsing state. A screen-reader caption describes
the controls; the static image adds no interactive controls or tab stops.

This supersedes both the annotated tutorial and the simplified sketch. The
invented Reading list title, overflow annotation and detailed +N explanation
remain removed. Detailed discovery remains in the website demo.

The six sections, onboarding state machine, consent saving, IPC, preferences,
stored fields and actual resting Island are untouched. newtab.js only formats
the shortcut using its existing platform flag. This is an unreleased candidate;
normal desktop release and applicable platform checks remain required.

## Capture provenance

Run `node scripts/capture-onboarding-island.mjs` from the repository root to
regenerate both images. It launches the real chrome renderer with a disposable
profile, locally fulfilled page responses and the bundled Sunrise favicon.
Only the document and strip backgrounds are made transparent for the crop;
Island DOM, geometry, colors and icons are unchanged.

`island-capture.json` records the renderer source hashes, image hashes, visible
controls and measured geometry. The renderer sources match the public v1.26.0
baseline, but these are local development captures, not captures of an installed
public package. Native smoke checks detect source or asset drift and verify
that the image keeps its aspect ratio and selects the correct theme.

## Validation of the complete quiet Island

Lint, 15 focused unit checks, four existing onboarding acceptance scenarios /
21 steps, and the native Settings Help smoke passed. Native checks cover
light/dark rendering, 320/390px widths, actual 200% zoom, the accessible caption,
platform shortcut and fresh/replayed-tour consent persistence. Screenshots:
/private/tmp/blanc-real-island-onboard/. Logs:
/private/tmp/blanc-real-island-*.log.
