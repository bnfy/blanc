# Legacy Sync migration input

Latest shipping source reverified v1.45.1 /85883b1afa11375e1300130914d6f40c5388af21. The released sync.js uses JsonStore sync fields; sync-key-storage.js stores base64(safeStorage.encryptString(base64(key))). The native vault uses a different contextual plaintext envelope, so copying protectedKey into a native bundle is not valid credential migration. No such copying occurs.

legacy_sync_record parses bounded64KiB/depth8 JSON without filesystem access. It retains enabled/handle/account locator/opaque protectedKey/device UUID/tab and Space consent/lastSyncedAt/origin/erasurePending/recovery dismissal. Disabled credential remnants remain visible to the importer rather than being discarded. Missing fields get released defaults. Unknown fields are not rewritten, and lastError mapping is a later step. A nonempty legacy raw key returns NeedsLegacyKeyProtection with no record/raw key output. Malformed types, invalid account/device identifiers, invalid protected blob encoding and invalid timestamps fail closed.

Targeted two-unit diagnostic compile/cached link and synthetic input checks passed with the pinned compiler plus alternate CLT27.0 SDK. No original app SDK, appbuild, real credentials or provider interoperability is qualified. Raw evidence outer native-sync-legacy-20261030.

Remaining importer: closed source backup and trusted Personal source binding; actual Electron credential recovery without weakening OS protection; contextual native rewrap; preserve device/consents and shared-spaces request quota/model state; map status explicitly; atomic destination commit with durable completion marker; restart/failure/rollback tests and real provider/UI/platform checks. Source remains untouched until a separately verified import transaction exists.

## Shared request ledger extraction

legacy_request_state maps shipping shared-spaces requestLog/nextClass/cursors/windowLimit/backoffUntil to the native ledger codec without rewriting user models. Missing requestLog is an error, not an empty allowance. Released defaults apply only to omitted optional scheduling fields. Malformed ledgers are refused rather than repaired/refilled. The source has a8MiB/depth32 read bound; larger inputs need an explicit supported migration path, not discarded state.

Targeted diagnostic checks pass ten retained charges, reduced cap3, preserved backoff/fairness, future timestamps and wall-clock rollback charged for the entire monotonic60s restart window; malformed types/missing ledger/oversized log/cap11 are refused. Two source units/cached link used alternate CLT27.0 SDK, no app/dependency build or unaffected suites. Raw outer native-sync-legacy-20261030/quota-v1. This is input extraction, not account/model rebind, credential import or atomic migration acceptance.

## Legacy credential rewrap codec

KeyVault::RewrapLegacy accepts an internally supplied source Encryptor and source ciphertext. It enforces destination Personal/nonprivate/secure-provider availability, bounded canonical source ciphertext and platform provider tag, then uses the draft strict decrypt API (no empty-password fallback). Legacy plaintext must be canonical44-character base64 for a32-byte key. Owned plaintext/decoded buffers are cleared, the move-only key is reprotected in the destination profile/account envelope, and only ciphertext is returned. No file writes occur.

Targeted synthetic distinct-provider CBC/GCM cases pass source preservation, destination recovery, wrong-context/private/invalid/temporary refusal and rejection of a crafted empty-password fallback accepted by the upstream default decrypt API. Raw outer native-sync-legacy-vault-20261030. No existing unaffected vault suite repeated. Two units/cached strict-review-overlay link, alternate CLT27 SDK only.

This does not establish real Electron source-provider recovery, source identity, CBC ciphertext authenticity, real account-key correctness, or migration acceptance. CBC is unauthenticated; valid shape is not provenance. The strict decrypt API remains a review overlay/unapplied patch. Actual qualified source-provider broker, backup/binding, model/quota import and atomic destination transaction remain required.

Status input now retains known safe error codes. Unknown source diagnostics set status_mapping_required without copying arbitrary diagnostic text into native UI/state; an importer must resolve that flag before commit. Malformed nonstring status is refused. Targeted metadata/status-v2 checks pass; atomic import remains absent.

## Combined core preparation

PrepareLegacyCore composes the metadata/quota parsers and strict credential rewrap. Destination account binding must match the parsed source account. It preserves device identity, both consents, erasure-pending state, recovery dismissal, timestamps, safe status/origin and quota together. Missing device identity is not regenerated opportunistically; source identity needs a durable migration journal. Disabled credential remnants require explicit reconciliation. Missing quota, raw legacy keys, unmapped status and unavailable/private providers produce no core.

Two-unit/cached-link synthetic composed check passes, including destination key recovery and each refusal above. No independent passed crypto/scheduler suites repeated. Raw outer native-sync-preparation-20261030. PreparedCore is explicitly not a commit token or evidence of source provenance/model migration; no file write/import or live app binding exists.

Read-only source refinement: RewrapLegacy no longer requires source IsEncryptionAvailable; that condition incorrectly excludes a provider intentionally configured only to decrypt existing source records. It still requires the secure destination, platform-tag/canonical validation and strict decryption. New distinct-provider synthetic decrypt-only CBC/GCM cases pass while source encryption remains unavailable. Source Keychain identity/derivation audit is in SOURCE-KEYCHAIN-AUDIT.md; actual source lookup must never create a missing item. No OS credential access was performed.

## Source snapshot primitive

Released store.js keeps Personal/device files at userData/sync.json and userData/shared-spaces.json; named profile stores live under profiles/id and are not selected by this reader. ReadLegacySnapshot takes a trusted explicit root, never guesses/falls back to another profile, reads bounded exact files twice, compares bytes/handle metadata and returns content hashes. Owned snapshot input strings are cleared on destruction; no claim is made about all transient library copies.

POSIX open uses NOFOLLOW/NONBLOCK and fstat regular-file validation, preventing FIFO replacement from blocking before type validation. Root aliases/parent traversal, symlink/directory/FIFO, missing required data and oversized sync input are refused in disposable filesystem checks. Actual byte snapshots and sizes pass. Initial optional-value test diagnostics and missing cached link inputs were preserved/fixed without rebuilding dependencies. Two units/cached link only; evidence outer native-sync-legacy-snapshot-20261030.

Two passes are not proof that the source app is closed, nor a cross-file atomicity guarantee against an active writer/ABA or hostile ancestor race. Changed-during-read detection is implemented but not deterministically exercised. This is not a backup/import permit. Trusted source closure/Personal binding, durable protected backup and final revalidation before commit remain required. Windows handle/type semantics are unqualified. No permanent profiles were read/copied/changed.

## Authenticated local backup format

legacy_backup uses a separate local format, not the endpoint wire-envelope ceiling. A random32byte data key encrypts a base64-preserved snapshot JSON with AES256GCM/random12byte nonce. The data key is protected by the native vault. AAD binds domain/version, trusted source binding and the exact wrapped-key blob; source hashes are recomputed from snapshot bytes. Ciphertext-only serialized output is bounded17MiB; input bounds are64KiB Sync and8MiB shared; encoded plaintext bound12MiB. Source binding must be domain-separated by the trusted importer, not an arbitrary renderer/account value.

Targeted CBC/GCM OS-wrapper cases pass exact binary bytes, source-hash recomputation, wrong context/source, mutation and mixed-wrapped-key rejection; max-size roundtrip passes. No endpoint cipher/rate suite was repeated. Two bounded source units/cached link used diagnostic SDK/review strict decrypt. Initial base64 vector/string type compile failure preserved/fixed. Raw outer native-sync-legacy-backup-20261030. This is not a durable file backup/restore transaction or import authority; no real profiles/credentials/files were copied or written. Owned sensitive buffers are cleared, with no assertion that every library JSON/base64 temporary is wiped.

## Exclusive encrypted backup file adapter

WriteLegacyBackup requires an existing owned0700 canonical directory. POSIX openat uses CREATE/EXCL/NOFOLLOW with0600, writes only the sealed encrypted record, flushes the file, reads it back through its opened descriptor and decrypts to compare original bytes. Final publication uses linkat (no replacement), removes the pending link and fsyncs the directory. Failed pending artifacts are retained; only explicit verified status is success. ReadLegacyBackup requires private owned regular singly-linked final.backup files with NOFOLLOW/NONBLOCK and authenticates/decrypts the bounded record.

Disposable macOS filesystem checks pass creation modes, ciphertext canary absence, exact readback, a second backup preserving the first, and wrong-binding/alias/public-mode/pending/corrupt refusal. Two standalone units/cached link only. No source profile is read by this adapter, and no permanent profile was copied. Raw outer native-sync-legacy-backup-store-20261030. Windows returns unsupported until a qualified secure-handle/ACL implementation exists. Partial-write/finalization fault injection, full powerloss/restart/rollback/ACL security and source-closure authority are not claimed. Not an atomic import transaction or app integration.

## Interrupted backup publication recovery

Writers now hold an exclusive nonblocking flock. Explicit RecoverLegacyBackup accepts only a valid UUID .pending/.backup artifact in the private directory; it locks the opened regular file, authenticates/decrypts it and flushes before completing publication. A two-link state is recoverable only when the known pending and final names have the same device/inode and exactly two links. Existing final files are never replaced; unrelated pending files/extra links/corruption remain untouched. A valid pending-only record can be finalized, and an already verified final is idempotent. Directory fsync follows.

Disposable tests pass both interrupted states, same-name different-inode/extra-link refusal, held live-writer lock refusal, corrupt pending preservation and idempotence. Two units/cached relink, raw recovery-v2 result/run. This exercises constructed interrupted filesystem states, not actual machine power loss. It is cooperative locking, not protection against a hostile same-user path/ancestor race or rollback; Windows/ACL/source-closure/import recovery remain unqualified.

Source-closure audit: SOURCE-LEASE-AUDIT.md disqualifies direct NotifyOtherProcessOrCreate (kill/stale-unlink) and unqualified Mac Create (old-lock replacement). Import remains disabled until a compatible non-resetting, ownership-tracked IPC lease and disposable Electron/native launch tests prove exclusivity. No lease is inferred from source read stability or the backup receipt.
