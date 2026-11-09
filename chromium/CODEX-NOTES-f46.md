# F46 session persistence handoff

2026-11-07, branch `chromium/f46-session-codex`.

Implemented the `sessionWindows` test-hook allowlist entry and dispatch, backed
by the current profile's real `SessionService`. It calls
`MoveCurrentSessionToLastSession()` then asynchronously calls `GetLastSession()`;
the callback is bound through the Handler weak pointer and replies through the
existing guarded Reply path. Read/replay errors fail the operation.

The projection is `{windows: [{tabs: [{customTitle, url}]}]}`. Confirmed the
production `kTabNameKey` is exactly `blanc.tab.name.v1`; `customTitle` reads that
key from each persisted SessionTab's `extra_data`, and is null when absent.
URLs use the saved navigation's `virtual_url()`, with the header's normalized
current-navigation index and an empty string for no navigations. No live-tab or
JS-seeded data substitutes for persisted session data.

`persistedSessionData()` now returns `w.native('sessionWindows')` directly.
Read both SessionService headers and session_types.h in the Chromium checkout,
and confirmed both pinned custom-name step call sites without editing them.
Updated the canonical source digest in source-map.json.

Validation with /usr/local/bin/node v22.14.0:
- Requested full Node unit suite: 256 pass, 2 fail, 258 total. Both failures
  are loopback sync tests blocked by this sandbox's `listen EPERM` on
  127.0.0.1: `two devices pair and sync a Favorite both ways` and
  `a pairing code survives the save after its own call`.
  Full output: /tmp/blanc-f46-unit.tap. No tests were skipped or weakened.
- `python3 chromium/tools/check-patches.py`: passed, 128 upstream files and
  441 custom files (patch reconstruction only).
- `git diff --check`: passed.

No native build, apply/sync scripts, acceptance runner, upstream/patch edits,
or writes outside this worktree were performed. Claude must verify compilation
and actual browser behavior, including immediate non-relaunch readback, relaunch
persistence, private-name exclusion, repeated checkpoints and async teardown.
This narrow name/URL projection does not establish the absence of private or
secret page-state bytes in all session storage (including F31's separate gates).

Commit delivery is blocked by filesystem policy: explicit-path `git add`
failed with `Unable to create .../repo/.git/worktrees/codex-f46-session/index.lock:
Operation not permitted`. Approval escalation is unavailable. The subsequent
`git diff --cached --stat` was empty; no commit was created. The pre-existing
untracked node_modules symlink was not staged. Suggested commit message:

    Add native session readback for F46 custom tab names

    Co-Authored-By: Codex <noreply@openai.com>
