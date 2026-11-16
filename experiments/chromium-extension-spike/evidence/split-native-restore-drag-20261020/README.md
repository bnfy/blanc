# Native Restore Tab and whole-split reordering

Reference: Electron PR993 at 98ea48fc01d79759cfef40009b18cf69715eaed8, including its split row identity and last-focused-pane semantics. The shared native Restore Tab entry point now shares the Island metadata adapter when the loaded latest entry is a persistent split. Other history types retain Chromium behavior. No whole-window/group history qualification or unloaded-history race qualification is claimed.

Rail split rows now expose the existing drag protocol. Native moveTab detects persistent split membership and uses TabStripModel::MoveSplitTo, retaining the collection, focus, layout and pinned state. Drops naming another split's interior normalize to its leading boundary. Group changes move both panes together. Unknown groups and foreign identities retain existing refusal rules.

Owner approved 52 files/124 hunks after the initial 51/123 command-switch hook failed runtime coverage: Chromium actions bypassed it. The replacement removes that hook and adds two hooks in browser_tab_restorer.cc. Incremental builds only. Runtime results will be added after completion. Latency deferred; Electron diagnostic build unapproved; retained preview untouched.


Final acceptance: 48 regular/private runtime checkpoints pass, including native Restore Tab ratio/right-focus, ordinary-tab fallback, private refusal, whole-pair loose/group moves, second-pane destination normalization, rail synthetic pointer drag and Alt+Shift+Arrow reorder. Earlier independent drag suite passed 47 checks. Seven capture tests, eleven counter tests, syntax and diff checks pass. Actual physical input is not claimed; event dispatch and native command execution are automated.

Failed attempts retained: the first synthetic drag omitted the release click, leaving the expected click-suppression guard armed and swallowing a later Close click. Completing that fixture sequence resolved it. The second run exposed the real legacy command-switch bypass; it was repaired by moving the hook to chrome::RestoreTab. No failures were silently rerun.

Three incremental builds: 38.93s (drag), 70.23s (initial native hook), 41.68s (shared entry-point repair). Final zero-action guard. Fresh 52 files/124 hunks, at the approved ceiling. All disposable profiles removed after process-exit verification; retained preview untouched. No latency measurement or Electron diagnostic build.

Remaining scope: unloaded-history asynchronous restoration, group/window-contained splits, cross-window dragging, beforeunload partial cancellation, full physical menu/shortcut/drag input, accessibility and broad platform/lifecycle matrices remain unqualified. Native command dispatch with loaded split history is the acceptance claim, not every Restore Tab lifecycle.
