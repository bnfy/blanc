# Blanc Chromium extension spike

This experiment answers two questions against an independently built, branded
Chromium derivative:

1. Can it install, prompt for, run, update, and persist extensions from the
   live Chrome Web Store?
2. Can the current Blanc Island run inside the real Chromium browser window
   while Chromium retains its native tab and extension model?

It does not replace the shipping Electron application. Normal prototype windows
now use the Island as their only browser chrome. Chromium's native tab strip,
address toolbar and bookmarks bar are hidden. A single native Extensions button opens a searchable view inside the expanded
Island. Selecting a row invokes the real Chromium action, preserving popup anchors,
permission handling and the real tab model. macOS close/minimize/fullscreen
buttons remain native, with inset placement.

## Pinned baseline

- Chromium: `156.0.8078.36`
- macOS: Apple Silicon
- Source checkout: `/Users/anthonyjloria/Projects/BlancChromium/src`
- Output: `out/BlancPrototype`

The header behind the Island follows the active page's rendered top edge,
including scrolling, animated backgrounds, Blanc's wallpaper and extension
pages. It uses Electron's dominant-color treatment with native pixel sampling;
only the 68px header is filled, so expanded panels remain transparent around
their edges. Private windows retain the private theme.

The macOS bundle uses **Sunrise Dark** for Dock testing, derived from the shipping
Icon Composer Sunrise layers and the `sunrise-dark` definition. `mac-icon.mjs`
compiles and caches its adaptive `Assets.car` and `.icns` fallback; unchanged
artwork preserves source timestamps. Prototype startup also refreshes the
running application's icon from its bundle to replace stale local Dock artwork. `BlancDK` is the catalog
name; it intentionally has the same length as Chromium's original `AppIcon`,
so the plist-size build flag does not change.

## Prepare and build

Keep the existing checkout, `out/BlancPrototype`, build arguments, and Siso cache.
Do not run setup hooks, regenerate GN arguments, clean the output, or update
Chromium/depot_tools/Xcode as part of a routine edit/build cycle. Intentional
security and toolchain upgrades are separate maintenance work with a reviewed
rebuild cost; this is not a reason to postpone security updates indefinitely.

For HTML/CSS/JavaScript and existing allowlisted assets, update the disk-served
assets and reload the page (relaunch for Island host changes). No C++ build:

```sh
node experiments/chromium-extension-spike/prepare.mjs \
  /Users/anthonyjloria/Projects/BlancChromium/src --assets-only
```

Native bridge, resource allowlist and window changes need compilation. Prepare
then use the guarded incremental build, from the Blanc repository:

```sh
node experiments/chromium-extension-spike/prepare.mjs \
  /Users/anthonyjloria/Projects/BlancChromium/src
node experiments/chromium-extension-spike/build.mjs \
  /Users/anthonyjloria/Projects/BlancChromium/src --build
```

The guard checks the recorded Xcode/SDK identity, Chromium Clang version and
revision, and exact `args.gn` digest before invoking Siso. It fixes
`DEVELOPER_DIR` for the invocation and disables depot_tools auto-updates. A dry
run uses the same Siso backend and saves `out/BlancPrototype/blanc-build-plan.log`.
More than 1,000 planned actions stops before compilation; an unparseable or failed
plan also stops. Pending GN regeneration stops too: review the environment, run
`gn gen out/BlancPrototype` without changing arguments, then repeat preflight so
the estimate uses the regenerated graph. Pending buildflag-header generation also
stops: Siso does not execute generators during a dry run, so a small reported
count can hide dependent compilation. Review the change and generate only the
flag target before inspecting the plan again. The count is an estimate, not a
hard upper bound. Use
`--check` (the default) to inspect without compiling. An active Siso build blocks
a second invocation; a directory lock protects concurrent guarded invocations.
No clean operation is provided. A successful build records its environment and
time separately from the configured baseline.

First use, or an intentional environment change after reviewing the rebuild
impact, requires `--record-environment`. This records the selected environment;
it does not certify a successful build or start one. `--allow-large-build` is an
explicit override for an intentional large build, never a routine retry. Do not
automatically accept a changed environment or bypass the threshold just to make
the command pass. Raw `autoninja` invocations bypass these safeguards.

The October 16 rebuild uses Xcode 27.1 (`27A9275`). The guard detects replacement
of `/Applications/Xcode.app` as well as a different selected Xcode. For the next
planned toolchain installation, retain a version-named Xcode app and pin it via
`DEVELOPER_DIR`; don't replace the active toolchain mid-cycle. Do not change
`is_component_build` in this output directory: that also causes a broad rebuild.

Fresh checkout initialization is separate: run the required Chromium setup
hooks once, then generate `out/BlancPrototype` with
`is_debug=false is_component_build=false symbol_level=0 target_cpu="arm64"`.
Review and record that environment before explicitly allowing the first build.
If a hard termination leaves `.blanc-build-guard.lock`, verify that no builder
is running before removing only that empty lock directory; retain all caches.

Run with an isolated profile and the reviewed asset directory:

```sh
"/Users/anthonyjloria/Projects/BlancChromium/src/out/BlancPrototype/Blanc Prototype.app/Contents/MacOS/Blanc Prototype" \
  --user-data-dir="/Users/anthonyjloria/Library/Application Support/Blanc Chromium Prototype" \
  --blanc-prototype-assets="/Users/anthonyjloria/Projects/Blanc/experiments/chromium-extension-spike/generated" \
  --no-first-run --use-mock-keychain
```

`--use-mock-keychain` is for this isolated test profile: it avoids the keychain
stall observed during the spike. Production keychain behavior remains untested.
Use test data only with this flag. See `results.md` for completed and pending gates.

`prepare.mjs` preserves unchanged file contents and timestamps. It copies a narrow allowlist of Island assets to
`generated/`, writes the native Chromium files, and applies a small set of
anchored source edits. It refuses an unknown Chromium version or a source file
whose expected anchor changed.

## Acceptance gate

Use a fresh profile for the first pass, then relaunch the same profile for the
persistence pass. Record each result in `results.md`.

- The real Blanc Island renders and lists real Chromium tabs.
- Create, switch, close, navigate, back, forward, reload, and stop work from
  the Island.
- The Chrome Web Store shows an install action in the derivative.
- Installation shows Chromium's native permission prompt.
- The extension appears in `chrome://extensions` and Chromium's extension menu.
- Its toolbar action popup opens and acts on the active tab.
- Content scripts, MV3 service worker, storage, messaging, and permissions work.
- The extension remains installed after a full quit and relaunch.
- The updater can fetch a later extension version from Google's update URL.

Start with Bitwarden, 1Password, React Developer Tools, Grammarly, MetaMask,
Tampermonkey, and one simple MV3 test extension. A Web Store install failure is
a stop condition for this architecture experiment; unpacked loading alone does
not pass the gate.

## Blanc new tab

With the prototype flag, normal `chrome://newtab/` navigation resolves to the
bundled Blanc new-tab document copied from Electron. It reuses the clock,
Sunrise artwork, fonts, four layouts and dynamic wallpaper. A narrow adapter
reads this Chromium profile's bookmarks and TopSites; it does not import the
Electron profile. An open start page re-lists Favorites when the bookmark
model changes (Island heart, `/save`, Chromium's manager, a stored favicon
arriving). Layout and wallpaper choices persist locally and propagate
to other open start pages. Typing on the page opens the Island with that text.

Electron onboarding, blocker statistics, Spaces, sync, Patron prompts and
Mahjong are hidden where their services are not implemented by this prototype.
The original Electron page sources are unchanged. Incognito keeps Chromium's
existing private-page routing.

## Limits

The prototype polls Chromium tab state and exposes only a small native bridge.
Favorites and history are Chromium's own `BookmarkModel` and `HistoryService`
behind Blanc's UI: the pill and panel hearts toggle a bookmark under Other
bookmarks, `/save [folder]` adds (or moves into a folder directly under Other
bookmarks, matched case-insensitively like Electron), the Quick Switcher lists
Favorites and the 300 most recent history entries with Electron's ranking, and
`/favorites` and `/history` open Chromium's managers in a tab. Turning the heart
off removes every user bookmark with that exact URL and never removes a folder.
Favicons come only from Chromium's caches (committed tab favicon, stored
bookmark favicon); history rows use the Island's letter fallback, and nothing
is fetched from the network for them. Private windows list no Favorites or
history and refuse to save. This bridge landed after the October 16 evidence
below and is pending native compilation and runtime verification on the Mac;
see the last section of `results.md`.

It does not implement history deletion (`/clear`), Blanc's Favorites and
History sheets, Spaces, Glance, blocking, private tabs, sync, or the expanded
Island's secondary commands. Unsupported Island controls are hidden; its slash
menu contains only `/downloads`, `/new`, `/close`, `/save`, `/favorites` and
`/history`. Downloads opens Chromium's native manager. Cmd+L and Cmd+T focus the
Island address input; Cmd+A selects its text. See `results.md` for native retests.
The resting Island reserves a fixed 26px slot for the native Extensions button.
Extensions, Reload and Close use equal 26px footprints, identical gaps and matching
circular hover feedback in light and dark themes. Pinned action icons stay hidden in Island windows without changing their stored
pin preferences. The expanded Extensions view lists enabled native actions,
filters by name, supports arrows/Enter/Escape, and links to Chromium management
and the Web Store. Its scrollable list keeps footer controls visible in small
windows. Native popups anchor to the single Extensions button. Extension settings
and site access remain in Chromium’s manager; authenticated workflows need
separate acceptance checks. Window whitespace supports native dragging; the Island panel
scrolls within the available height. Page-requested fullscreen hides the Island
and gives the page the full viewport. See the Island-only section in `results.md`
for runtime verification and remaining limits.
