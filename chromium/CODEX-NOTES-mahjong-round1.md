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

## Claude handoff — live evidence outstanding

No native build, apply/sync tool, acceptance runner, build output or cache was touched.
Island files changed: 27 new Mahjong assets plus pages/newtab-adapter.js. Their
manifest hashes are current. source-map.json hashes/new asset entries were refreshed
locally so check-patches could pass; Claude must recheck before their guarded build.

Exact Claude live results (not received):
- `newtab-layouts.feature:35` (F35-4): **PENDING — not run by Codex**.
- `newtab-layouts.feature:41` (F35-9): **PENDING — not run by Codex**.

Please build the minimal candidate, run those two scenarios, verify the private
Mahjong tab in the fork snapshot (same window, OTR), and relay exact outcomes here.
Do not interpret static checks or the URL projection as live acceptance evidence.
F35-3 deep hooks remain explicitly unported. F35-10 was not investigated or changed.
STATUS.md and tracker.json are unchanged.

## Commit blocker and proposed split

The sandbox denied git add because the worktree index is physically under
`/Users/anthonyjloria/Projects/BlancChromium158/repo/.git/worktrees/s3-f53-f34-codex/`:
`Unable to create .../index.lock: Operation not permitted`. No commit was created;
no permission bypass or alternate Git metadata was attempted.

Suggested reviewable commits: (1) the 27 pinned files, served.txt and their asset
manifest entries; (2) native/JS footer bridge, query alias, URL projection/test,
updated hashes and this note. Use explicit paths, inspect cached stat, never stage
node_modules, and end each commit with `Co-Authored-By: Codex <noreply@openai.com>`.
