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

- **`newtab-layouts.feature:35` (F35-4): passed, but proved less than first
  recorded.** The adapter's `.click()` fires on a hidden element, and
  `newtab-prototype.css` still hid `#mahjongLink`, so people could not see it.
- **`newtab-layouts.feature:41` (F35-9): failed.** An earlier version of this
  note called the cause unexplained and asked for a debugger. That was wrong:
  the private-profile allowlist in `NewTabHandler::Handle` returned before the
  `openMahjong` branch, between the two log points, and that code had not been
  read.
- Both are fixed on candidate macos-d40bfa2514c288c3, along with reload, which
  failed because Mahjong's `?game=<id>` was not an allowed query. Verified with
  real mouse events; see STATUS.md.

`F35-3`'s deep hooks remain explicitly unported (as scoped). `F35-10` is not a
Mahjong bug: the footer's left group wraps at 1260px. `STATUS.md` and `tracker.json` are intentionally
left untouched by this round; Claude records evidence there separately.

## Commit history

Codex's sandbox denied `git add` (index.lock permission issue under the main
checkout's worktree metadata). Claude committed on Codex's behalf in the
suggested split: the 27 ported files + manifest entries in one commit, the
native/JS wiring + this note in a second, plus a small follow-up for
source-map.json's canonical key ordering.
