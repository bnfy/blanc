# L8 prerender replacement distribution — October 24, 2026

**Authenticated packet prepared; native Safari download and owner acceptance pending for this replacement.** Existing L8 acceptance records remain valid for their earlier artifacts; this checkpoint does not transfer their exact-byte claims. The aggregate historical gate count remains 9/12; this replacement is not release-ready.

- Candidate source: `14706b0e8d4753d2a7ef35ea32a875b516366b0d`; Chromium 157.0.8103.15, Apple Silicon/macOS 27.2.
- Final ZIP SHA-256: `18a0c2ca240f2200fee3e8b250fbade27b7b86ec1c1dd77c21a538a6776aa8cc` (243869929 bytes).
- Apple Accepted/stapled: `122ace9e-196b-4f10-8986-c57854a5ee4f`; [72 post-notarization checks and owner L7 approval](../f12-prerender-notarized-20261024/README.md).

The [archive audit](packet-audit.json) verifies all458 files/five symlinks, exact source tree/materials/provenance binding, 340 SBOM components,323 native license components and320 complete native license texts. Strict signature, staple and Gatekeeper pass on an independently extracted archive. This is local incremental provenance, not an independent hermetic build or hosted-build attestation.

The [manifest verification](manifest-verification.json) pins `anthony@bnfy.me` and `https://github.com/login/oauth`. A routine Safari identity authorization completed with the existing GitHub account. The real modified-manifest and modified-artifact [negative controls](negative-verification.json) both reject. Twelve compliance tests and seven artifact-verifier tests pass. The audit's “authentication pending” field records its earlier phase; authentication-summary.json supersedes only that field.

The [unpublished draft](https://github.com/bnfy/blanc/releases/tag/untagged-71b48b75290a0fb62215) has six assets. All six [uploaded digests and sizes](uploaded-byte-verification.json) match. The [entire packet was downloaded afresh](fresh-hosted-byte-verification.json) through anonymous HTTPS requests to the GitHub release asset host, without forwarding account authorization. Every byte matches; the [downloaded manifest](fresh-hosted-manifest-verification.json) verifies the pinned identity and all source/artifact bindings. The packet remains unpublished and does not establish a public release permalink.

The owner has been asked to download `Blanc-Chromium-Preview-157.0.8103.15-14706b0e-arm64.zip` in Safari on the MacBook and leave the app closed. Native Safari quarantine, exact downloaded members, ordinary launch, two restarts, Shelf/tabs/selection, Bitwarden popup focus and Shipping preservation remain required before recording current replacement L8 acceptance. No new owner pass is claimed.

No builds or profile changes were performed. Google baseline/ledger are separate, Electron remains paused and latency deferred. No merge or public release is authorized by this record.
