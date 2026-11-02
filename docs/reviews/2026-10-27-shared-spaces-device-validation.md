# Shared Spaces private-candidate validation — 2026-10-27

Status: blocked; no platform approval or release approval. PR #1173 remains unmerged; PR E and the release remain on hold.

## Candidate and isolation

Tested the installed Windows candidate from approved PR #1173 head `c552ae7bfb82aa4cb856a8ba9961dbcbfdc55ebb` in Windows 11 ARM64 under Parallels. Rechecked installed `app.asar` SHA-256: `e13202693a91208a049a9ffb07828c0e40be98b265540854ebb1f924dd684f2f`. The running main process uses the isolated `Blanc-Shared-Validation` profile. The existing disposable Sync account was paired in the previous session; no credentials are recorded here.

## Observed results

- Windows still reports Favorites and settings: Last synced just now.
- Keyboard navigation opened Sync settings, the Shared Spaces selection sheet, and successfully enabled Shared Spaces. The sheet had no local Spaces to offer and reported one shared Space in the account.
- The pre-existing Mac test tab, Example Domain at `https://example.com/`, arrived on Windows. Opening it displayed **This tab can't be reopened** and the explanation for a page-opened tab whose restrictions cannot be restored.
- This is a failed initial shared-tab opening check, not a successful end-to-end replication pass. No bidirectional create/navigation/close, internal/local navigation, active/unsaved deferral, off/rejoin, erasure, Linux device validation, or owner platform confirmation is claimed.
- Mouse input through Parallels remains unreliable. Keyboard input worked after guest focus was captured. Failed mouse actions are not evidence of an application hang.

Screenshot: [Windows restored-tab failure](evidence/2026-10-27-shared-spaces/windows-reopen-failure.png).

## Reproduced cause at the approved head

`src/main/shared-spaces-sharing.js:64`, in `reconcileCapture`, maps the document-policy column with `row.local && restoredMarker(previous, row.old)`. Shared rows do not define `local`, so their value is `undefined` instead of the required explicit `false`. JSON persistence turns the array entry into `null`. `src/main/document-policy.js:71` correctly fails closed for any stamped value other than `false`.

A pure reproduction using the actual modules extracted from `c552ae7b`:

1. Create a one-tab Example Domain blob through `diffWindow`.
2. Run `first = projectSpace(blob)`.
3. Run `second = reconcileCapture(first, blob)` without changing the blob.
4. JSON round-trip `second` and call `restoredMarker(saved, 0)`.

Observed: first marker `[false]`, first blocked `false`; reconciled/persisted marker `[null]` when JSON-serialized; persisted blocked `true`.

Required correction before candidate approval: emit an explicit boolean for shared rows (and keep the parallel `localFiles` column boolean); retain the fail-closed restoration rule. Add regression coverage for repeated unchanged reconciliation, new shared rows, persistence/normalization and reopening on a peer, while retaining marked local tabs' restrictions. A revised candidate must repeat this real-device check and the remaining scenarios. No production code was changed during this validation.

## Missing Mac peer

The previously recorded temporary Mac candidate, isolated profile, and evidence directory are no longer present:

- `/private/tmp/blanc-shared-spaces-validation`
- `/private/tmp/blanc-shared-mac-profile.y31Yhm`
- `/private/tmp/blanc-release-1.44.0`

Process inspection found only `/Applications/Blanc.app/Contents/MacOS/Blanc` running, not the recorded private Mac candidate. The normal profile was not opened, paired, or modified. Re-establish a private Mac candidate/profile before continuing two-way validation; it can pair to the surviving disposable Windows account through the normal flow.

No Worker changes, account erasure, merge, PR E work, or release occurred.

## Follow-up fix prepared during the 1.44.0 release

Current 1.44.0 draft release targets `dc501e0da5d77a45af973e63446a20c9f8e85982`, whose packaged-build guard still disables Shared Spaces. #1173 remains open and unmerged. The reproduced failure is contained from that public candidate.

The separate `codex/shared-spaces-reconcile-booleans` branch makes both policy columns explicit booleans during reconciliation. A regression for repeated reconciliation and JSON persistence failed before the fix and passed afterward. A second regression covers newly arriving remote rows beside a restricted local file. All 202 Shared Spaces/document-policy tests and the full lint check pass. Real-device retesting still remains; these unit results do not complete the release gate for Shared Spaces.
