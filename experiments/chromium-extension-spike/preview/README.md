# Local self-contained Mac preview packaging

Reuse the existing native output; do not run the Electron release builder.

```
PYTHONDONTWRITEBYTECODE=1 python3 preview/compliance.py --repo ../.. --source /path/chromium/src --assets generated --blocker /path/pinned-blocker-assets --output /new/path/compliance --revision <reviewed-40-character-commit>
python3 preview/package.py --source '/path/Blanc Prototype.app' --assets generated --blocker /path/pinned-blocker-assets --compliance /new/path/compliance --output '/new/path/Blanc Chromium Preview.app' --source-revision <reviewed-40-character-commit>
python3 preview/test_launcher.py
```

Run from the spike directory. Output must not exist. The packager compiles only its small arm64 entrypoint, copies resources, rewrites helper/framework bundle identifiers and ad-hoc signs/strict-verifies the staged app. It never overwrites source output or profiles. Default launch uses a separate preview profile. Chromium's explicit user-data-dir override remains available for disposable testing. Assets cannot be overridden through this launcher.

`compliance.py` reads the existing native GN graph; it does not build or regenerate it. The payload includes Blanc's license/asset statement, four font OFL texts, full Chromium credits and its GN-reachable SPDX license inventory, blocker package licenses, a combined CycloneDX SBOM and observed source/dependency/build materials. Upstream license inventory entries do not supply every dependency version; those omissions are explicit, with resolved pins recorded separately. The packager refuses mismatched source/version/font/blocker inputs and missing or altered payload members before staging. These files live inside the final signed app under `Contents/Resources/Compliance`.

The packaged materials are a record of a local incremental build, not a claim of independent hermetic reproduction or a hosted build. Final artifact checksums and their authenticated manifest must be produced after signing/notarization to avoid a self-hash cycle. Run `PYTHONDONTWRITEBYTECODE=1 python3 preview/test_compliance.py` for the tamper/mismatch checks. L8 still requires the actual signed download/installation and final provenance acceptance.

For a completed artifact set, run `python3 preview/verify_artifacts.py --directory /path/to/artifacts --version <four-part-version> --source <exact-source-commit> --cosign /path/to/cosign`. This authenticates `SHA256SUMS` using the repository's pinned release identity/issuer before checking all four artifact digests and the SBOM, archive, source and provenance bindings. The Sigstore bundle is outside the manifest it signs. `test_verify_artifacts.py` covers rejection of tampering, missing/duplicate files, symlinks, wrong source/subject and failed authentication.

An unpublished GitHub draft may hold the bounded L8 download fixture. Record the exact draft and asset identities and the actual anonymous HTTPS download, quarantine, extraction and launch outcomes. Never equate staging a draft, locally setting a quarantine attribute, or signing a materials statement with public release, a fresh-machine pass, or a hosted-build attestation. Publication and updater changes require the separate release decision.

This is local candidate preparation, not distribution approval. Developer ID signing, hardened runtime/entitlements, notarization, native keychain/service namespaces and quarantined acceptance require separate qualification. Never publish this ad-hoc artifact as a public preview. See evidence/preview-package-20261022 for retained failures and bounded acceptance.

The launcher and outer bundle declare a macOS 26 binary minimum instead of inheriting the build host's SDK default. That declaration is not macOS 26 acceptance: the current owner-approved preview scope is macOS 27, with signed-candidate acceptance on 27.2. Native Chromium's own deployment target remains unchanged.

`sign.py --app <staged-preview.app> --identity <Developer-ID-fingerprint> --entitlements <Chromium-chrome/app> --report <json>` signs a staged preview inside-out using Chromium's app/renderer/GPU entitlements. Run through the signing Mac's desktop security session when SSH lacks private-key access. It does not export a key, build Electron, notarize, publish or qualify a release. Preserve failed attempts and verify the final signed bundle before notarizing.

The Start Page’s **Version & security** notice is bundled for offline use. Its version is read from the input app; the packager stamps the exact reviewed source revision and UTC packaging time into both the Start Page and Island metadata. Missing metadata markers, malformed versions/revisions, unreviewed link destinations and unsupported release-status claims fail packaging. `preview-build.json` records the same metadata inside the signed resources.

The explicit **Current status, updates & withdrawal notice** link opens the permanent [PR #1028 status section](https://github.com/bnfy/blanc/pull/1028). It performs no background fetch. The maintainer updates that section on withdrawal even after the PR is closed; it must remain accessible while any preview is supported. The packaged status is a snapshot and does not claim the app remains safe indefinitely. The operator procedure is in [manual maintenance and withdrawal](../preview-manual-maintenance-policy.md).

Run `python3 preview/test_notice.py` for metadata destination/escaping/fail-closed tests, and verify the actual signed notice, keyboard close/focus return, responsive layout and live link before accepting a new artifact. Changing bundled UI resources requires a new signature and notarization; never edit an installed signed app in place.
