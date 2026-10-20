# Batch Split View close persistence

Island closeSplit now waits for the existing history save/flush acknowledgement after every selected pane closes. It compares the original pane identities without dereferencing destroyed contents. If a pane remains pending/cancelled, the operation rejects rather than acknowledging a durable full-split close. Native unload/cancellation behavior is retained. Private batch close creates no history.

Five disposable schedules pass, 38 checkpoints total:
- Immediate encrypted-only crash after acknowledged batch close following corruption: both fresh panes restore once, with35/65 ratio and right-pane focus.
- Five-second settled crash control: identical pair/ratio/focus recovery.
- Injected Tabs barrier/fsync EIO: batch close rejects; removing fault and issuing a subsequent single-tab close flushes history, and immediate crash recovery restores the split once with ratio/focus. This is not automatic retry of failed batch closure.
- Private batch close removes both panes with no Recently Closed entry and leaves regular history unchanged.
- Beforeunload pending batch close rejects; cancelling the dialog retains the guarded pane. This does not claim atomic rollback of all panes.

Seven capture unit tests pass; git diff --check passes. Incremental build38.66seconds/6steps, final zero-action guard. Fresh inventory54files/128hunks unchanged, within approved cap. No new upstream hooks. Fixture-generation syntax error was caught and corrected before private/cancel execution; no runtime product failure.

Crash fixtures explicitly remove only disposable plaintext history while stopped and use diagnostic crash-bubble bypass. Physical native input, owner destruction, partial-close history reconstruction, other native close entry points, power loss and exhaustive lifecycle remain unqualified. Latency deferred; Electron diagnostic build unapproved. Retained preview untouched. Owned profiles removed after process-exit verification. Browser/build/guard logs retained locally under /private/tmp/blanc-batch-close-*; published source/results hashed.
