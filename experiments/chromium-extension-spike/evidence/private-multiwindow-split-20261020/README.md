# Private and multiwindow Split View checks — October 20, 2026

Evidence-only checkpoint on native implementation 65ecb3a1, based on Electron PR #993 at 98ea48fc. Two disposable-profile runs passed the five bounded runtime assertions; the final run also records normal browser exit code zero. No native source change or compilation. Incremental guard schedules zero actions; prior authoritative footprint remains 49 files / 117 hunks within 49 / 120.

## Observed

- Two regular windows have distinct durable UUIDs and independent two-pane splits, with opposite focused members.
- A private browser context accepts native split creation. Spaces save, open and recovery are refused from that context. The Spaces JSON contains no private fixture URLs; both regular window snapshots remain unchanged.
- Actual browser SIGKILL and session restart retain both regular UUIDs, URL membership, split membership, focused members and loose/active selection. Private tabs do not reappear.
- Killing the browser after a valid switch journal appears, then restarting, rolls back the exact source UUID to its saved split state, clears the journal, and preserves the other window's split state.
- Final normal browser shutdown exits zero.

## Limits and retained attempts

Private snapshot `splits` is empty because snapshot generation uses the persistence capture path, which refuses off-the-record profiles. Native pair-creation success is not private snapshot/UI parity or visual acceptance; that remains a gap. This checks the Spaces store and restart behavior, not a forensic audit of every profile byte. Two regular windows, one private context and one split per regular window are qualified; multiple splits per window combined with multiple windows, private focus/layout visuals, group/pin mutation, later staging/removal boundaries and partial-history recovery remain open. The existing separate two-split regular-window evidence does not qualify those combinations.

Initial harness attempt lacked Node 20 WebSocket support and failed before assertions; retained in attempt1-runtime.json. Enabled --experimental-websocket for subsequent runs. The first passing run took longer to finish cleanup; attempt2-runtime.json retains its result. Final harness bounds the exit wait and records actual exit code zero. Crash-bubble bypass applies only to disposable automated restart, not physical Restore acceptance. No latency tests or Electron diagnostic build. Retained preview and permanent profiles untouched.

Harness assumes the local config and CDP helper paths shown in test.mjs. All network pages are authored loopback fixtures. Disposable profiles are not committed.
