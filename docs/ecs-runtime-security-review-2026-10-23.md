# ECS runtime security review — October 23, 2026

## Decision

**Not cleared for release.** The selected ECS engine reproduces upstream Node
TLS hostname-validation defects. Its exact runtime needs a vendor fix or
verified backport evidence before the runtime-security gate can close. This
review does not establish a remotely exploitable path through Blanc, and it is
not a full audit of the vendor's native source.

No production application, runtime fuse, entitlement, update feed or signed
candidate was changed. The probe used a separately extracted, unmodified vendor
archive, made no network connections during the checks, and changed no fuses.

## R1 — High: upstream TLS validation defect reproduced in the selected engine

- Selection: `build/ecs-runtime.json:2`, ECS `44.9.3+wvcus`.
- Input: pinned Apple Silicon archive SHA-256
  `3f49f11710e87974b6b7c7acb2c172c1f37c804f319f7c887e0a791bbda8dc6b`.
- Extracted framework SHA-256:
  `0191252c5a817431858f51e61d10e3fb864ecffb77a41feb11ce4032858c2e55`.
- Actual runtime reports Node `24.22.0`, Undici `7.29.1`, c-ares `1.34.8`.
- In pure `tls.checkServerIdentity` controls, the canonical IP with only a DNS
  SAN correctly failed, and the matching IP SAN and ordinary DNS controls
  correctly succeeded. Fullwidth, octal, hexadecimal and shortened IP spellings
  incorrectly accepted the numeric DNS SAN. These are the classes covered by
  the published Node TLS advisories; the result is no longer inferred solely
  from a version string.
  The fixed Node [regression cases](https://github.com/nodejs/node/blob/v24.22.1/test/parallel/test-tls-check-server-identity.js#L383)
  explicitly require these spellings to be rejected.

Node's [October security advisory](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases)
describes the hostname-validation issues and other fixes delivered in
[24.22.1](https://nodejs.org/en/blog/release/v24.22.1).
Electron's [44.x Node update](https://github.com/electron/electron/pull/55162)
was merged after the selected 44.9.3 release. The currently available 44.x ECS
release has not supplied evidence that these checks are fixed.

**Impact and reachability:** the affected Node primitive can validate a
certificate against an inappropriate identity for non-canonical IP input.
This is a runtime defect, not proof that an arbitrary web page can access Node.
Blanc's page Node isolation remains mandatory. Its reviewed favicon transport
(`src/main/favicon-network.js:53`) canonicalizes URLs, rejects private addresses,
pins resolved peers, and disables the HTTP agent; these controls must not be
removed and reduce applicability of several advisory scenarios. A follow-up offline
probe in the same extracted framework showed its WHATWG URL parser (Ada
4.0.0) canonicalizing hexadecimal, octal, shortened, plain-decimal and
fullwidth IPv4 spellings to dotted-decimal, so that transport, which takes its
host from `new URL(...)`, never presents a non-canonical IP to the defective
check. electron-updater downloads through Electron's `net` session, that is
Chromium's TLS, not Node's, and no first-party main-process module uses Node's
Brotli or zlib decoders. These findings narrow the applicability of the
reproduced defect to Blanc; they do not close the gate, because the embedded
runtime still carries the unfixed code and the other advisories. Other native
dependencies and engine paths have not been comprehensively cleared by this
limited review. The Brotli and remaining Node advisories were not dynamically
tested here, and no absence of those defects is claimed.

**Required remediation:** obtain a supported ECS build carrying Node 24.22.1
or equivalent verified fixes. As of October 23, none exists: Electron's
`DEPS` pins Node `v24.22.0` at tag `v44.9.3` and `v24.22.1` only on the
unreleased `44-x-y` branch head (no `v44.9.4` tag), and castLabs' newest 44.x
release is still `v44.9.3+wvcus` (October 22). The path is therefore an
Electron 44.x release carrying the bump, the matching ECS release, then a new
pin of all four archives, rebuild, signing and requalification; pin all intended platform archives, then rebuild,
sign and requalify the affected packages. A newer version string alone is not
enough: repeat the relevant regression controls. Do not replace TLS validation,
disable verification, hide the defect behind an allowlist, or update the public
runtime matrix to force this candidate through. New signing/notarization work
requires the applicable owner approval.

## R2 — Open evidence gap: native-source and redistribution review

The pinned `vendorCommit` is a commit in the release-metadata repository, not a
reviewed full native-runtime source tree. Release archive hashes, code signing
and VMP provide useful integrity/identity evidence but do not establish that
the corresponding native changes have been audited. Obtain the exact source
or patch/backport manifest and confirm applicable redistribution notices.
Do not describe the entire runtime as reviewed or blanket-MIT from the release
repository's license alone. No legal waiver or vendor contact is implied.

## Checks that passed, with their limits

- `npm audit --omit=dev` reported zero advisories for the npm production
  dependency graph on October 23. It does not audit the embedded Node,
  Chromium, CDM or other native binaries.
- The already recorded native CDM isolation, VMP, file boundaries and signed
  package tests remain valid for their exact bytes; they do not replace this
  source/security review.
- This review applied the security skill's evidence and supply-chain rules.
  Its generic frontend guidance is not an Electron/native-runtime audit standard.

The bounded raw probe and npm audit JSON are retained in the isolated
qualification directory as `ecs-node-tls-security-probe.json` and
`npm-runtime-audit.json`. The source selection and remediation remain visible
in `docs/ecs-production-integration.md` and draft PR #1063.
