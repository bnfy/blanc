# Mahjong round 1 — footer launch candidate

Branch: `chromium/s3-mahjong`; starting HEAD: `2667609c0e5c6ac42a2fd23dd3fdfac317cab01f`.

## URL serving and launch

Selected native document URL: `chrome://blanc-prototype/pages/mahjong.html`, with
`?private=1` for a private source tab. This is an implementation candidate,
**not yet confirmed live**. No literal `blanc://` navigation or new scheme registration.

Source evidence: `island_resources/BUILD.gn` reads `served.txt` into its GN inputs
and passes it to `embed.py`; `IsAsset()` uses the generated `IsServed()` allowlist.
The WebUI request filter serves those paths through embedded `Find()` or disk
`ReadAsset()`. Added the 27 Mahjong paths to that allowlist and the exact private
HTML query alias to the request filter. `tests/lib/page-shim.mjs` already projects
Start Page document URLs to shipping addresses; added the equivalent Mahjong
projection there. `adapters/state.mjs` uses that function for both URL and loadedUrl.
The projection is only in tests; the real tab navigates to the native document URL.

`newtab-adapter.js` now exposes `start.openMahjong(background)`. The native
NewTabHandler validates the boolean and active trusted Start Page, finds its browser,
and calls Navigate with the source WebUI profile and that same browser. This follows
NewPrivateTab's existing profile-plus-browser pattern, supported by patch 0011's
NavigationProfile/ContentsProfile handling. Ordinary clicks select the new tab;
Cmd/Ctrl and middle clicks leave it in the background, matching shipping's contract.
Private preservation is source-supported but requires the live snapshot check.
The existing missing method would throw synchronously before `.catch()` attaches;
no pre-change browser console observation was available, so none is claimed.

## Port provenance

All 27 `mahjong*` files from `src/renderer/pages/` at shipping commit
`6479ed3a314e4fd6219b8de1598bacffa78b4d7c` were copied byte-identically.
The HTML requires mahjong-state.js, CSS and artwork as well as the four requested
files; the CSS/JS reference the other tile artwork. These dependencies were included
to serve the complete page, without changing any game logic or adding deep hooks.
`island-assets.json` records each shipping source and SHA-256; assets.mjs checks
byte equality against git show for every one of these files.

| File | SHA-256 (shipping and fork identical) |
| --- | --- |
| mahjong.html | 0a93e766b2030228b022ef974d3860be4c2650fd63d809e140bff30ba3983338 |
| mahjong.js | d2bb4d0c51418ba4f5eb5655682c0f238e71c493df4b9bcf286ecdc4d4afed74 |
| mahjong-engine.js | 99170a95d56128b14c8ea1d656ac495c5a98dee99a6f2193788a05771d4306da |
| mahjong-sound.js | f82046c9be5566857f0e49a2f696adbae07aad12897d33135519c886979424f1 |

## Checks

- `node chromium/tools/assets.mjs --check`: PASS, 134 assets.
- `python3 chromium/tools/check-patches.py`: PASS, 128 upstream files,
  468 custom files; reconstruction only, no compile/runtime credit.
- `NODE_PATH=/Users/anthonyjloria/Projects/BlancChromium158/repo/node_modules node --test chromium/tools/*.test.mjs chromium/tests/*.test.mjs chromium/tests/**/*.test.mjs`:
  262 tests, 259 passed, 3 failed. Two sync tests fail with `listen EPERM:
  operation not permitted 127.0.0.1` (sandbox); ui-language's Settings test fails
  with `stripTypeScriptTypes is not a function` under installed Node v20.19.0.
  Log: `/private/tmp/mahjong-round1-tests.log`. No tests were weakened or skipped.
- Initial attempt lacked dependencies because node_modules was absent, contrary
  to the task setup. Created only the worktree-local symlink to main's node_modules;
  did not install or change dependencies. Do not stage that symlink.
- `git diff --check`: PASS.

## Claude's live results (2026-11-09, candidate macos-aef74633b0b1595d)

Built and ran `newtab-layouts.feature` against a real candidate (GN regenerated
with unchanged args.gn — hash-verified identical before/after; framework hash
independently re-verified at every step).

- **`newtab-layouts.feature:35` (F35-4): PASS.** The footer-launch wiring
  (`openMahjong` bridge + native `NewTabHandler` case + serving) works
  end-to-end for the ordinary (non-private) case: all four layouts' footer
  links open Mahjong in a new tab without disturbing the original Start
  Page's layout.
- **`newtab-layouts.feature:41` (F35-9, the private variant): STILL FAILS.**
  Root cause not found despite six rounds of targeted `LOG(ERROR)` tracing
  (all reverted; the committed source has none of this diagnostic code).
  What the tracing actually showed, precisely:
  - `IsStartPage()` correctly identifies the private Start Page throughout
    (`primary_private=1`, exact committed-URL match, all OTR flags consistent).
  - `Handle()`'s per-message dispatch log (added at the very top, right after
    `method`/`args` are bound) fires exactly once with
    `method=openMahjong argcount=1 dump=false is_bool=1 type=1
    full_condition=1` — i.e. a side-channel re-evaluation of the EXACT guard
    expression (`method == "openMahjong" && args.size() == 1 &&
    args[0].is_bool()`) confirms it is TRUE for this call.
  - Yet a `LOG(ERROR)` placed as the **unconditional, immediately preceding
    statement** to the real `if (method == "openMahjong" ...)` check (350
    lines later in the same `Handle()` body, no intervening reassignment of
    `method`/`args`, both `const`) **never fires** — not even once, across
    multiple repeated runs. Ruled out: process crash/restart (single PID
    throughout, clean `browserExit.code: 0`), stale/wrong candidate (hash
    independently re-verified at every round), a duplicate/shadowing
    `"openMahjong"` check earlier in the dispatch chain (grepped — only one
    occurrence), and a stale embedded JS resource (the `start.data()`-style
    methods logged in between prove the same `Handle()` dispatch path is
    very much alive and well for other methods in the same scenario run).
  - This is genuinely unexplained from source reading or `LOG(ERROR)`-based
    tracing. **Recommend attaching a real debugger (lldb breakpoint at the
    `if (method == "openMahjong"...)` line) for the next attempt**, not more
    print statements — this specific approach has been exhausted without
    resolving it, and repeating it would just spend another round for no
    new information.
  - Pausing this one scenario here rather than continuing to spend rounds on
    it, per the push toward a macOS beta (the owner's stated bar tolerates
    known, non-blocking gaps; this is cosmetically narrow — only the private
    variant of one footer link — not a crash or data-loss class issue).

`F35-3`'s deep hooks remain explicitly unported (as scoped). `F35-10` was not
investigated (confirmed unrelated to Mahjong — it's a pure layout/geometry
scenario, already failing before this round and not mentioned in the
"Mahjong goes last" note). `STATUS.md` and `tracker.json` are intentionally
left untouched by this round; Claude records evidence there separately.

## Commit history

Codex's sandbox denied `git add` (index.lock permission issue under the main
checkout's worktree metadata). Claude committed on Codex's behalf in the
suggested split: the 27 ported files + manifest entries in one commit, the
native/JS wiring + this note in a second, plus a small follow-up for
source-map.json's canonical key ordering.
