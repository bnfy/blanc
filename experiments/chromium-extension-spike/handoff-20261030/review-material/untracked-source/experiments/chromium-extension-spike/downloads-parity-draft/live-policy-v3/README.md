# Live Downloads policy v3 — unregistered

This keeps the v2 native-item policy and corrects an independent review finding:
any tailored warning now yields `kNeedsReview` even if other fields claim a
normal icon and safe scan; `SILENT_BLOCK` remains silent. V2 is preserved.
The contradictory safe/normal/tailored and silent-block/tailored combinations
are covered by an actual-classifier-linked synthetic test. Cached 158 clang
syntax and this focused test passed; the linker warned the requested LTO
library was absent but linked and ran. Unchanged core tests were not repeated.
See `syntax-command.json`, `syntax.log`, `security-command.json` and logs.
Environment and transitive inputs are not fully pinned; no live item, linked
browser, authorization or profile test was run.

The `live-policy.cc` source remains SHA
`bad80f2f574512e7f9a595c1a7cc448d624fd30b720e62cfdfd5b6d7c496738f`;
`native-security.h` is
`a9c8ae81a01ac1aba42f8956c5cd38af0854b44bc6f2bbcdbb5e6fb851518105`;
`native-security-test.cc` is
`93ce6d6cd496e9f1f50e3789d0d30c662b518f43da3eeb2d75fa74175e90f698`.
All v2 constraints remain: no endpoint/dispatch, family authorization,
actual warning recovery, real DownloadItem or private lifetime evidence, and
normal NOT_DANGEROUS open/show/resume remain unresolved. Never integrate this
candidate as-is or treat synthetic checks as product parity.
