# Encryption-readiness repair constraints — October 22, 2026

Status: owner selected a recovery screen that preserves saved tabs. Implementation uses a native dialog after ten seconds of synchronous restoration wait, while leaving the original read and late completion alive. The final bounded recovery checks pass; no release gate is closed.

The existing fault evidence is in [encryption-faults-20261022](evidence/encryption-faults-20261022/README.md). A withheld provider callback keeps the synchronous restore wait active. Delayed completion recovers, and simulated KeyErrors use existing clear-store fallback when present. Those fallback passes do not qualify encrypted-only recovery.

## Safety constraints

- Do not synthesize an empty successful session at the readiness deadline. Restore's normal empty/error path may create a new browser, and later persistence must not supersede the inaccessible saved session.
- Do not turn a pending provider into a permanent-key failure or delete encrypted session records.
- Do not impose a process-wide provider failure merely to release a session-specific wait. OSCryptAsync is shared by other encrypted consumers.
- Preserve late successful completion and exactly-once restore delivery. A timeout notification must not consume or duplicate the original successful callback.
- Preserve saved records across quitting/restarting while unavailable, and avoid creating competing keychain requests while waiting.
- Provider/window/profile destruction must invalidate pending UI callbacks safely.

## Source findings

`SessionRestoreImpl::Restore` waits in a nested loop for its session callback. `CommandStorageManager::GetLastSessionCommands` queues encrypted-preferred reads until `OnEncryptorReady`. OSCryptAsync serially gathers provider results before notifying consumers. The macOS KeychainKeyProvider returns the fixed v10 tag and temporary unavailability for an empty password; it currently posts blocking keychain work without a readiness deadline. A timeout at the shared provider would affect more than session restore.

`Encryptor::IsDecryptionAvailable` currently tests whether the key map is nonempty, which is not the same as every key having a value. The prior temporary-error fixture therefore produced invalid-command status rather than decryption-unavailable. Do not use that status as evidence that saved bytes are corrupt.

## Required validation before calling the repair complete

1. Unavailable encryption produces the chosen bounded, understandable recovery behavior with original session records retained.
2. Completion before and after the deadline restores exact window/tab identities, ordering and selection once.
3. Late callbacks dismiss the recovery surface and do not duplicate windows or race session writes. No Retry button issues competing reads.
4. Quit/restart during unavailability retains the session; retry with a healthy provider restores it.
5. Temporary/permanent provider errors, both-store and encrypted-only fixtures are distinguished; no cleartext fallback claim is generalized to encrypted-only data.
6. Quit/process teardown and normal restart are covered; wider concurrent profile destruction remains unqualified. Diagnostic hooks are removed, the normal binary is restored incrementally, and the zero-action guard passes.

Google baseline and dev profiles remain excluded. L2 remains open; tracker 1/12 (8.3%), delta 0. Latency and the Electron diagnostic build remain pending.

## Implemented evidence

[Final recovery evidence](evidence/session-recovery-20261022/README.md): twelve starts / 28 assertions pass, including late completion and Quit/restart with both stores and encrypted-only fixtures. The Quit path avoids blank fallback and defers keep-alive release until the main quit callback exists. Initial compiler and runtime failures are retained. Real keychain and wider concurrent lifecycle remain open.
