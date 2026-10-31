# Live Downloads policy v2 — unregistered candidate

Shipping reference reverified via GitHub release and tag: v1.45.0,
`6f1bc523d2f0d432d5c4119b9f7ec22a324dbd2d`. V1 is preserved in
`../live-policy-candidate/`. Chromium's actual `DownloadItemModel` reports
`DangerUiPattern::kOther` for every interrupted item *before* evaluating the
danger type, so V1's synthetic interrupted/kSafe case was unreachable.

V2 separately derives an interrupted classification only when the observed
pattern is kOther, the danger type is the positive `DEEP_SCANNED_SAFE`, insecure
status is SAFE, both native danger/insecure flags are false, and there is no
tailored warning. Only then is the pattern normalized for the existing
`ClassifySecurity` function. This preserves the existing positive-scan rule;
NOT_DANGEROUS, failed scans, warnings, unknown values and tailored warnings do
not become safe. Whether real interrupted items reach this positive-scan state
and whether normal resumed downloads meet shipping behavior remain unproved.

The history-removal hint is now distinct from opening a file: for a **complete**
visible item, the current danger type must be NOT_DANGEROUS or
DEEP_SCANNED_SAFE, insecure status SAFE, danger pattern kNormal, no native
danger/insecure flag or tailored warning, and deletion history pref true.
The adapter also checks `!Profile::IsChild()`, matching the native Downloads
page's presentation restriction. The separate action still requires browser
authorization, current item re-resolution and policy recheck, and completion
observation; do not call `Remove` on active/interrupted records, which can
delete intermediate data. This hint is not an action implementation.

Early or blocked rows lacking name/target/URL remain metadata-pending; native
hidden, temporary, transient, trusted-extension, unknown-state and silent-block
entries remain hidden. A future view must render a safe generic label and offer
reviewed warning recovery; correct blocked-item visibility is not yet proven.
Ordinary NOT_DANGEROUS open/show/resume remain conservative unknown and
unavailable, and interrupted/cancelled clear and retry remain unimplemented.
This is not full shipping parity or permission to weaken protection.

Exact context equality does not establish authorized family/window ownership.
Controller item/profile lifetime, synchronous model construction reentrancy,
primary OTR teardown, gesture, current visibility and policy changes, warning
UI, action outcome, file preservation and real-browser behavior remain unproved.
No endpoint is registered, no DownloadItem command is executed, and no user
profile, original workspace or Chromium output was modified. Independent
review is required before any integration.

Targeted pure decision tests and `native-security-test` linked against the
actual existing security classifier passed with assertions enabled. They cover
the real interrupted/kOther combination and negative danger, insecure and
tailored-warning cases, plus ordinary completed history and denial conditions;
all inputs are synthetic. Cached Chromium 158 clang syntax-only passed for the
live adapter. Full argv, logs and exit codes are in `*-command.json`/`*.log`;
the native-security link emitted an absent LTO-library warning, but linked and
executed. Inherited environment/transitive inputs are not fully pinned; none of
these checks is a native DownloadItem, integration or browser test.

Frozen SHA-256: live-policy.cc
`bad80f2f574512e7f9a595c1a7cc448d624fd30b720e62cfdfd5b6d7c496738f`,
native-security.h `cdf614e72acd3561a3aced514836db94f81c806c154b6df535c5797f5f7c9b30`,
policy-core.h `efda4cfc4cd85b39d19e13a6b2f34fcd3b64ae30b159eaa0ee804cc04e559c20`,
native-security-test.cc `20067a05012ff6f07c2c05d1aabe072a7e0ec153f4947fa71bc28cd9d5ac1847`,
policy-core-test.cc `3201e81d8001e62ab607e3b5d8dae9f039cc314924ce5771cb2ba6720879648f`.
