## October 20 — Preference-write and unavailable-provider recovery

Fresh-profile Preferences rename EIO tests pass with clear and encrypted-only session storage. The actual scoped rename hook records EIO, no Preferences file exists, and initial save remains failed through repeated attempts. Removing the fault permits automatic retry; an actual browser crash then restores the exact saved window identity and contents. This covers a missing-file write failure, not an existing stale Preferences dictionary, physically full disk or general preference durability.

A temporary diagnostic supplies an Encryptor with no keys only to the exact disposable profile's SessionRestore consumer. IsEncryptionAvailable is false and EncryptString returns nullopt. Initial-window save stays failed; two Spaces switch attempts refuse while preserving source and stored bytes. No cleartext Session file is produced. Graceful shutdown succeeds; a fresh process with the fault removed acknowledges a save and subsequently crash-restores the exact window. This is not an actual OS keychain/provider failure, same-process provider recovery or loss of decryption keys for existing records.

The diagnostic is removed byte-for-byte and the normal binary rebuilt. Native input remains pending, latency deferred, and the Electron diagnostic build unapproved/unstarted. Broader preference/provider/lifecycle and power-loss gates remain open. Retained preview untouched.

Four schedules (15 recorded checkpoints) and eight focused tests pass. Diagnostic and normal incremental builds: 28.39s and 28.34s, six steps each; final guard zero. No permanent code changes. Prior normal footprint49/117 unchanged; temporary two-hunk addition in an already-patched file gives a conservative49/119 upper bound within49/120, not a new full inventory. Four disposable profiles removed. Evidence: `evidence/preference-provider-recovery-20261020/`.

All pages are authored loopback fixtures. Actual crash restarts use the disposable-only crash-bubble bypass; physical recovery prompts remain unqualified. The binary diagnostic is not retained; its exact patch is archived and source equality verified. No profiles or key material are committed.

CodeQL follow-up: both archived harness servers now return fixed heading text instead of reflecting the request URL into HTML. URL identity assertions are unchanged. Historical runtime logs describe the original runs; this follow-up validates fixture response safety and syntax, not a new provider/runtime qualification.
