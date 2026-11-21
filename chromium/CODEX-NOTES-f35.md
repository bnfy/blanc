# F35 Start Page settings handoff

Implemented F35-11 Patron callout snooze and F35-19 Launch Sunrise in this
worktree. No native build, acceptance runner, apply/sync scripts, upstream,
patch, lane, shipping-source or pinned-step edits were performed.

- Patron: added the production bridge read/dismiss calls and native local_state
  Int64 persistence. Ported the exact 90-day, zero/negative, expiry and corrupt
  future-time rules from `src/main/patron-callout.js`. The returned active flag
  stays false; private page data skips the read. Existing callout markup, page
  renderer and close behavior were retained.
- Sunrise: copied the scene verbatim from `src/renderer/pages/newtab.html`, the
  complete `.launch-sunrise` CSS block from `src/renderer/pages/pages.css`, and
  `playLaunchSunrise()` verbatim from `src/renderer/pages/newtab.js`. The data
  application records the grant and the layout-ready frame plays/removes it.
  Reduced motion, first key/pointer dismissal and animation-end removal remain
  shipping behavior.
- Native launch state ports `src/main/launch-sunrise.js` and the per-WebContents
  first-request guard in `src/main/main.js`'s `launchSunriseFor`. A process-wide
  monotonic start time and shared NoDestructor state survive individual handlers.
  Weak WebContents identities avoid stale pointer reuse. Expiry spends the grant;
  disabled/hidden pages leave it available. Visibility uses the existing native
  WebContents GetVisibility/VISIBLE API (as IslandRelativeBounds does); the fork's
  bridge wallpaperVisible itself is document.hidden, not a native helper.
- Test-only settings hooks run in the existing compile-time/runtime guarded
  dispatch. setLaunchSunrise writes the real pref and rearms start/spent/asked.
  readLaunchSunrise reads actual DOM and computed animation names. No JS mock.
- Necessary brief correction: `base::Value::is_int()` only covers 32-bit values,
  so epoch milliseconds arrive as doubles. The timestamp hook accepts both int
  and finite integral double safe integers, preserving them in the Int64 pref.
  Responses use doubles because base::Value has no Int64 numeric variant.
- Updated island asset and canonical source digests; no pref registration changed.

Validation uses /usr/local/bin/node v22.14.0. Patch reconstruction passes (128
upstream files, 441 custom files); this is not compilation credit. Full Node
results and delivery are recorded below. Claude must compile and verify the real
browser: 90-day persistence/expiry and private exclusion; single grant across
windows/tabs, hidden-page eligibility, 30-second expiry, rearm, layout timing,
reduced motion, input/animation cleanup and computed styles. No browser/runtime
acceptance credit is claimed here.

Final checks: 256 pass / 2 fail (258 tests). Both failures are unchanged sync
loopback tests denied `listen EPERM: operation not permitted 127.0.0.1`:
`two devices pair and sync a Favorite both ways` and
`a pairing code survives the save after its own call`. Full TAP output is at
`/tmp/blanc-f35-unit.tap`; no tests were skipped or weakened. `git diff --check`
passes. Native and acceptance checks remain for Claude as required.

Commit delivery blocked: explicit-path git add failed creating
`repo/.git/worktrees/codex-f35-start-settings/index.lock` with Operation not
permitted. The cached diff is empty. No commit was created; approval escalation
is unavailable in this environment. Suggested commit:

    Port Patron snooze and Launch Sunrise Start Page settings

    Co-Authored-By: Codex <noreply@openai.com>

The pre-existing untracked node_modules symlink was left untouched.
