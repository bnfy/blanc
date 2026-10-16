# Blanc Chromium extension spike

This experiment answers two questions against an independently built, branded
Chromium derivative:

1. Can it install, prompt for, run, update, and persist extensions from the
   live Chrome Web Store?
2. Can the current Blanc Island run inside the real Chromium browser window
   while Chromium retains its native tab and extension model?

It does not replace the shipping Electron application. Normal prototype windows
now use the Island as their only browser chrome. Chromium's native tab strip,
address toolbar and bookmarks bar are hidden. The real Chromium extension
buttons and menu are embedded in the Island, preserving native popup anchors,
permission handling and the real tab model. macOS close/minimize/fullscreen
buttons remain native, with inset placement.

## Pinned baseline

- Chromium: `156.0.8078.36`
- macOS: Apple Silicon
- Source checkout: `/Users/anthonyjloria/Projects/BlancChromium/src`
- Output: `out/BlancPrototype`

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
the estimate uses the regenerated graph. Counts can conservatively overestimate cache misses. Use
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
  --user-data-dir=/private/tmp/blanc-chromium-profile \
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
Electron profile. Layout and wallpaper choices persist locally and propagate
to other open start pages. Typing on the page opens the Island with that text.

Electron onboarding, blocker statistics, Spaces, sync, Patron prompts and
Mahjong are hidden where their services are not implemented by this prototype.
The original Electron page sources are unchanged. Incognito keeps Chromium's
existing private-page routing.

## Limits

The prototype polls Chromium tab state and exposes only a small native bridge.
It does not implement bookmarks, history, Spaces, Glance, blocking, private
tabs, sync, or the expanded Island's secondary commands. Unsupported Island
controls are hidden; its slash menu contains only `/downloads`, `/new` and
`/close`. Downloads opens Chromium's native manager. Cmd+L and Cmd+T focus the
Island address input; Cmd+A selects its text. See `results.md` for native retests.
Extension actions remain native Chromium views; the Island reserves a measured
slot for pinned actions and the Extensions menu. Narrow windows overflow actions
into that menu. Window whitespace supports native dragging; the Island panel
scrolls within the available height. Page-requested fullscreen hides the Island
and gives the page the full viewport. See the Island-only section in `results.md`
for runtime verification and remaining limits.
