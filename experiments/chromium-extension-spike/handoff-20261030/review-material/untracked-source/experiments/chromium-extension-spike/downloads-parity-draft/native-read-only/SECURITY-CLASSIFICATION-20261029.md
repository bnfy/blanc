# Downloads native warning classification draft

GitHub's latest published release and tag were checked again for this work:
v1.45.0 resolves directly to `6f1bc523d2f0d432d5c4119b9f7ec22a324dbd2d`.
The released Downloads row behavior and Chromium 158 review remain in the
parent [README](../README.md) and [native review](../NATIVE-INTEGRATION-REVIEW.md).

`security-classification.{h,cc}` is a self-contained browser-side mapping
for a snapshot of Chromium danger type, insecure status, UI warning pattern,
and the item danger/insecure flags. `projection-security-adapter.{h,cc}`
maps the existing internal native row to that mapping. Neither is registered,
connected to a manager, or exposed to a renderer. Neither authorizes any
operation, establishes item lifetime or validates a browser context or caller.

Known dangerous, scanning, blocked and warning states are `kNeedsReview`;
`SILENT_BLOCK` is a separate `kSilentBlock` that must not be blindly exposed
as a visible review prompt. Only `DEEP_SCANNED_SAFE` with `SAFE` insecure
status, normal UI pattern, and no danger/insecure flag returns `kSafe`. This
is a narrow UI classification of a recorded scan result, not proof that a file
is harmless or a substitute for current Chromium enterprise/Safe Browsing
policy. `NOT_DANGEROUS` is **unknown**, because Chromium can use it before a
final scan or when a scan fails open; user-validated and policy-allowlisted
values are also unknown. Unknown/future values and `kOther` warning patterns
fail closed. This conservative draft would leave ordinary native downloads
unknown and is therefore **not full shipping behavior**; establish a reviewed
native no-warning/action policy and actual visibility behavior before wiring.
The adapter's present `safe/needs-review/unknown` API cannot accept the fourth
silent-block state directly; native filtering and serialization require design
and end-to-end tests, not an ad-hoc mapping.

After independent source review caught the fail-open and silent-block issues,
both were corrected in this candidate. Two new standalone executables compiled
using the cached 158 Chromium clang and flags and exited 0:

- `security-classification-v2`: all current danger integer values plus
  deprecated, sentinel and future values, insecure and pattern values, danger
  flags, selected scan-failure and policy cases.
- `projection-security-adapter-v2`: field mapping from the actual internal row
  through the classifier for positive, scan-pending, unknown and insecure cases.

`*-v2-command.json`, `*-v2-build.log` and `*-v2-test.log` retain the exact
commands, hashes and outcomes. `-UNDEBUG` preserves assertions; `nm` showed
`___assert_rtn` in each executable. Both builds warned that the requested LTO
library path was absent; the standalone binaries linked and executed despite
that warning. The captured compiler arguments reused an earlier build command;
inherited environment and all transitive input provenance were not pinned.
Earlier standalone outputs are retained, but their command receipts bind the
pre-review source hashes, not the final files. No full Chromium build, actual
DownloadItem, enterprise policy, profile, private lifetime, operation, real UI,
or physical accessibility test was run.

Before integration, implement browser-owned family and manager lifetime,
history readiness, trusted document binding and live dispatch policy; recheck
warning and policy at every action, not only at list time. Validate real
regular/private teardown, scanning and enterprise states, native visibility,
unknown and new enum values, late callbacks, and shipping row behavior on each
platform. Preserve private state and saved files; do not infer product parity
or a release gate from these standalone tests.
