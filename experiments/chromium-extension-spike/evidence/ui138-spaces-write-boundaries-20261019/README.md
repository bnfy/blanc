## Spaces backup and atomic-replacement boundaries — October 19, 2026

Five actual disposable-process interruption cases pass, each followed by restart without injection, native Space listing/reopening and a subsequent successful save:

- Backup temporary write interrupted at94/188bytes: complete primary and previous backup unchanged.
- Immediately before backup rename: complete primary and previous backup unchanged.
- Immediately after successful backup rename: primary unchanged and backup equals the previous primary.
- Immediately before primary rename: primary unchanged and backup equals it.
- Immediately after successful primary rename: new complete primary retained, backup equals old primary; restart restores the new navigation.

The test-only interposer matches the exact owned profile path and backup/primary destination, consumes a one-shot arm and emits a PID/path marker before waiting. The harness verifies the owned PID and on-disk generations before SIGKILL. These are controlled before/after rename boundaries, not a kill inside the kernel rename operation. Partial backup size is checked on disk. All five cases passed on the first attempt in this checkpoint. Helper direct-syscall deprecation warnings remain in the archive; no signing/security settings were changed.

This qualifies bounded process-crash recovery, not power-loss durability, fsync failure, disk-full/I/O errors, concurrent writers or switch-mid-transaction recovery. No product changes or Chromium compilation; final guard zero actions/3.61s. Footprint unchanged from measured41files/100hunks. Five owned profiles/servers cleaned and retained preview tabs preserved. Native input pending, latency deferred, Electron diagnostic build unapproved. Plan item4 and broader acceptance remain open. Evidence: evidence/ui138-spaces-write-boundaries-20261019/.
