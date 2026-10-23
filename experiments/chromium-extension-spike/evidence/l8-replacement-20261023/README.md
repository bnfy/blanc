# L8 replacement distribution/provenance — October 23, 2026

**L8 remains open: 8/12 gates, delta 0.** Authentication and hosted-byte acceptance are complete. The native Safari download now verifies. The ordinary MacBook launch/restart/extension walkthrough on this replacement remains pending. L6's [125 frozen signed checkpoints](../l6-restore-scheduling-20261023/README.md) remain accepted.

## Exact packet

- Source `6b9a05a00f321bfbde617c181103d5a455ff45f3`, Chromium 157.0.8103.15, arm64, owner-approved macOS 27 scope (tested 27.2).
- Stapled ZIP SHA-256 `a7fe468c648e1b3d096a49e663e06b182bb483353fb5c4bb1c37dc8349994aca`.
- Apple Accepted `47e56224-454f-4765-9bd6-f7868a245f32`; strict signature, stapled ticket and Gatekeeper pass. No candidate bytes were changed for this checkpoint.
- [Unpublished native download fixture](https://github.com/bnfy/blanc/releases/tag/untagged-afa6366dc2ff7daedc2d), draft ID `422364839`, six assets. It is not a public release or an updater entry.

The independently extracted local ZIP matches all 458 regular files and five symlinks, with no extra members. All four artifact digests, committed source tree, SBOM/version, source materials and provenance archive subject agree. The payload validates 340 components, including 323 native components and 320 full native license texts; readable credits derive from that exact inventory. [Audit](packet-audit.json), [executable check](audit-packet.py). Twelve compliance and seven verifier tests pass. This audit launches no app and modifies no profile.

## Authentication and hosted bytes

After the owner unlocked this Mac, a fresh Safari Sigstore flow completed. The manifest authenticates as the **independently pinned** `anthony@bnfy.me`, issuer `https://github.com/login/oauth`. [Actual verification](manifest-verification.json) checks all four signed artifact digests and source/SBOM/provenance bindings. [Changed-manifest and changed-artifact controls](negative-verification.json) both reject. The previous expired attempt is retained in [initial status](initial-status.json); its OAuth URL was not reused or published. No new signing-key setup or export occurred.

The packet independently [verifies on the release Mac](remote-manifest-verification.json). All six [hosted asset digests and sizes](uploaded-byte-verification.json) match the authenticated local files. The archive's anonymous HTTPS HEAD and manifest GET pass through the GitHub API's signed redirect, without forwarding account credentials to the asset host; [transport record](hosted-transport.json). The entire six-file packet was then downloaded again into a fresh task directory using anonymous HTTPS GETs. Every actual served byte matches, and the [freshly downloaded packet](fresh-hosted-manifest-verification.json) authenticates and validates against the same pinned identity, source and archive digest. [Six fresh downloads](fresh-hosted-byte-verification.json).

The [archive inventory, CycloneDX SBOM, in-toto provenance, checksums and Sigstore bundle](artifact/) are retained. The materials statement explicitly records a local incremental build; no independent/hermetic reproduction, hosted-build attestation or SLSA level is claimed. The exact ZIP is retained outside Git; its hosted/digest binding is recorded here. An unpublished draft does not establish a stable public-release permalink or authorize publication.

## Native download verified; owner launch/restart acceptance pending

The read-only [MacBook preflight](owner-state-replacement-before.json) preserves Shipping's three app hashes and records Store-installed Bitwarden 2026.10.0 with no disable reasons. It is not a fresh enabled-state/popup pass. Older `7065f9c0` download and owner-restart evidence remains credited for those older bytes, not substituted for this replacement.

The owner quit the prior Preview and downloaded the exact replacement through Safari on the MacBook. [Actual native download verification](native-download.json) checks all 458 regular files/five symlinks against the authenticated inventory, with no extra members; actual quarantine records Safari. Strict deep signature, stapled ticket and Gatekeeper all pass. The verified app is `/Users/anthonyjloria/Downloads/Blanc Chromium Preview-2.app`. [Prelaunch verification](native-prelaunch.json) records macOS27.2/arm64 and no running downloaded Preview process before first launch. The app remains closed at that checkpoint. Safari's expanded app is bound to the authenticated file inventory; the independently fetched hosted ZIP supplies the archive-byte binding.

The owner is now asked to open that exact Preview-2 app normally, confirm Shelf/Bitwarden, load example.com/example.org and select example.org, then perform two Cmd+Q/reopen cycles. Each must preserve tabs/selection/Shelf and a functioning Bitwarden popup with keyboard focus, while Shipping's existing tabs remain intact. Stop on a security rejection or startup stall; never bypass Gatekeeper. No owner launch/restart/popup pass is claimed yet. This is a second physical supported Mac, not a factory-clean OS or a production-profile migration claim.

**L8 stays open until that native evidence is complete.** Current progress is 8/12, delta 0. L4, L11, L12 and Decision 2 remain independent. Google baseline/ledger and permanent tabs stay separate. Latency is deferred; Electron diagnostic build is pending approval/unstarted. No native or Electron build, merge or public release was performed. Run `python3 validate.py` for archived integrity/accounting; pass `--cosign /path/to/cosign` to additionally verify the archived checksum manifest against the pinned identity.
