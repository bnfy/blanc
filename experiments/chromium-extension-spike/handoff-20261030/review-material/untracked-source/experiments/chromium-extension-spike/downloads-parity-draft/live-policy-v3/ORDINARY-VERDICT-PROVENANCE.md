# Ordinary DownloadItem verdict provenance — source-bound investigation

Shipping v1.45.0 was reverified for this work: release and direct tag commit
`6f1bc523d2f0d432d5c4119b9f7ec22a324dbd2d`. This is an investigation and
integration proposal, not an implemented hook or permission to change policy.

## What the current native item can and cannot prove

The Chromium 158 `ChromeDownloadManagerDelegate::CheckDownloadUrlDone`
(`chrome/browser/download/chrome_download_manager_delegate.cc:302–343`)
combines Safe Browsing URL results SAFE and UNKNOWN. For an unsupported
content check it maps both to `NOT_DANGEROUS`; otherwise it maps both to
`MAYBE_DANGEROUS_CONTENT` pending the later check. The latter
`CheckClientDownloadDone` (`:2020–2210`) initializes `NOT_DANGEROUS` and handles
UNKNOWN and SAFE through the same switch branch except for dangerous file-type
checks. `SavePackageDangerType` (`:597–625`) explicitly maps UNKNOWN to
NOT_DANGEROUS as fail-open. Thus two different verdicts can produce the same
current `DownloadItem` danger state. The helper's `SafeBrowsingState` is a
`DownloadCompletionBlocker` containing only completion/callback state, not a
persisted SAFE versus UNKNOWN result; `DisableSafeBrowsing` can also complete
that blocker without a scan (`:979–993`).

`DownloadItemImpl::CanOpenDownload` (`components/download/internal/common/
download_item_impl.cc:1234–1240`) checks completion/active state, temporary
status and externally removed file, not a positive scan verdict. The model's
`OPEN_WHEN_COMPLETE` and `SHOW_IN_FOLDER` enablement delegates to those
capability checks (`chrome/browser/download/download_item_model.cc:668–675`),
while `DownloadCommands::IsCommandEnabled` delegates to the model and does
not itself authorize dispatch (`chrome/browser/download/download_commands.cc:
149–171`). `IsDangerous()` also returns false for asynchronous scans and
deep-scan failure (`download_item_impl.cc:1123–1151`). Consequently, combining
normal icon, model enabled, no danger flag, completion and NOT_DANGEROUS does
not establish a positive successful scan; it can represent fail-open, disabled
or unsupported checks. Do not relabel it as safe or remove the v3 distinction.

This does not imply that a completed normal item is malicious. Chromium may
intentionally permit fail-open behavior; following native policy as a separate
unverified/no-warning disposition is a different product and safety decision
from asserting a positive verdict. V3 currently denies ordinary open/show/resume
and is therefore not shipping parity. History-only clear has a separately
bounded no-warning predicate; it is not proof that file contents are safe.

## Concrete integration path to evaluate

For **new live items**, add browser-owned, per-item provenance at the native
delegate boundary, owned by item lifetime and updated only on the UI sequence:

1. Capture the raw `DownloadCheckResult` at the URL callback and at
   `CheckClientDownloadDone` before their SAFE/UNKNOWN mapping. Preserve stage
   identity: a safe URL result is not a successful content or enterprise scan.
2. Bind every callback to an unguessable per-item lifetime/generation, verify
   the current manager, profile-family epoch and exact observed item before
   applying it, and invalidate on remove/destruction. The existing callback
   binds a numeric ID, so wrapping its repeating callback must not mistake a
   replacement item or a late result for the original. Account for asynchronous
   results (including immediate deep scan and later callbacks) and reentrancy.
3. Record UNKNOWN, scan disabled/unavailable, no content check, policy allowlist,
   bypass, in-flight/async, and unexpected or missing data as distinct non-safe
   states. Capture `CheckSavePackageScanningDone` and other applicable scan
   channels too. Do not infer success merely from a missing blocker or from
   `DisableSafeBrowsing`.
4. A candidate positive disposition must require every applicable protection
   channel to have a final successful result, then recheck the actual live
   item's current danger, insecure, tailored-warning and enterprise conditions
   immediately before the action. Some file types never receive a content scan;
   determining which checks are required needs source/policy review and real
   browser tests. Do not silently turn unsupported or fail-open into success.
5. For regular downloaded history after restart, item UserData does not itself
   provide durable provenance. Decide whether to extend regular profile history
   with versioned, integrity-checked non-sensitive verdict status or treat old
   and restarted items as unknown. Do not persist source URLs or paths merely
   for this purpose. For primary OTR, keep provenance in memory only, scoped to
   the private context lifetime; invalidate on teardown and never export it to
   regular history, logs or telemetry. Chromium's primary-OTR lifetime may be
   shorter than shipping's process-private metadata lifetime and needs explicit
   product handling.

Any hook adds surface to the critical download completion path and must retain
the original callbacks and error semantics. There is no implementation or build
in this record. Validate real safe, UNKNOWN/fail-open, disabled and unsupported
checks; asynchronous scanning; policy block; item/manager destruction and ID
reuse; navigation and gesture; restart; and regular/private isolation before
using it as a safety gate. Run only affected tests against the exact candidate.
