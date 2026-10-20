# Partial-cancellation Split restoration repair

The prior left/right beforeunload cases recreated an already-live pane. RestorePartialSplit now matches history's existing durable tab identity against live tabs in the same profile. With exactly one match in the requesting window, it restores only the missing child entry, rejoins it with the original live pane, restores saved layout/focus, and removes the remaining survivor history entry. It never deduplicates by URL/title or replaces the live survivor. Duplicate/foreign-window matches and already-split/pinned survivors refuse reconciliation. No-match normal restoration retains its original path. Native Restore Tab and both Island restore routes share this logic.

Nine disposable schedules pass45 checkpoints:
- Both left/right cancellation orders: each URL occurs once, original survivor identity remains, unsaved input and in-page marker remain unchanged.
- Island most-recent and explicit-entry restore: same preservation assertions.
- Same-URL unrelated tab remains untouched and outside the restored pair.
- Unequal35/65 ratio and right focus restored.
- Second Restore Tab does not recreate the consumed survivor history.
- Held-flush owner destruction regression: survivor window unchanged, later abrupt restart restores pair/ratio/focus once.
- Encrypted-only postcorruption immediate-crash full-batch regression passes.

Seven capture tests pass; diff whitespace check passes. Initial declaration-order compile failure retained locally and repaired. One successful incremental build38.14seconds/6steps; final guardzero. Fresh54files/128hunks unchanged; no additional upstream hooks.

Earlier failing evidence remains in split-batch-lifecycle-20261020. These tests fix the demonstrated same-process duplicate-survivor cases. Cross-window transfer, ambiguous identity runtime matrix, partial-cancellation crash-before-reconciliation, grouped/pinned/legacy history combinations, physical input and powerloss remain unqualified. No atomic cancellation rollback is claimed. Latency deferred; Electron diagnostic build pending approval. Retained preview untouched; test profiles removed after verified exit. Raw build/browser/guard logs stay local under /private/tmp/blanc-partial-fix-*; source/results are hashed.
