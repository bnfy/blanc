# Android A7 Task 7: offline attestation inputs

This describes tooling, not a completed Android release check. No server scan,
real bundle signing or Sigstore sign-in ran while implementing Task 7.

The Mac work folder uses these names:

- `build.json`: the server's Task 4 build record, unchanged.
- `Blanc-Android.aab`: Task 6's upload-key-signed bundle.
- `scan.json`, `sbom-inputs.json`, `license-inputs/`: the prepared offline inputs below.
- Outputs: `Blanc-Android.cdx.json`, `SHA256SUMS`, `SHA256SUMS.sigstore.json`.

`SHA256SUMS` covers exactly the signed bundle, SBOM and build record, sorted by
filename. The signature covers that manifest. Both
`BLANC_COSIGN_IDENTITY` and `BLANC_COSIGN_OIDC_ISSUER` are required, exact pins,
with no defaults or regular expressions, matching `scripts/release.sh`.

## Preparing the server handoff

Use a repository checkout containing `build.json`'s exact `commit` object.
The helper reads that object's Android pin and provenance with read-only
`git show`; it never infers the Chromium version from the current checkout.
Keep the server work folder outside the Chromium source checkout.

After the release build, run these commands on the server (not run for Task 7):

```sh
python3 chromium/release/sbom_scan.py --src "$SRC" \
  --target //chrome/android:chrome_public_bundle \
  --out-dir out/AndroidRelease "$WORK/scan.json"
node chromium/android/release/attest.mjs review "$WORK"
```

The second command writes `sbom-review.json`, initially `complete: false`.
It derives known Android additions from committed provenance: ZXing's version
and JAR hash in `blanc/android/BUILD.gn`, the blocker manifest and package
licences, and byte-identical third-party page assets listed by Android's
page catalog and the compliance policy. It excludes Sparkle and desktop
Island assets. Known components cannot be removed or have their recorded
version, licence, artifact path or digest changed.

Review the actual scan, its skipped directories, and the Android payload.
Complete the draft's missing `licenseFiles` arrays with actual upstream licence
texts available in the server tree. Each entry is `{path, sha256}` relative to
`SRC`; use the SHA-256 of those exact bytes. ZXing, the aggregate blocker
bundle and filter-list/resource terms deliberately have no invented licence
text. Add metadata for any further shipped component Chromium's scanner misses.
Use the scanner's component shape: `name`, `dir`, `version` or `revision` when
known, `url`, `license`, `licenseFiles`; optional `type`, `artifactFile` and
`artifactSha256` record an additional payload. Unknown versions stay absent.
A skip needs a specific `reviewedSkips[dir]` reason; a shipped component with
missing metadata needs an addition, not a reason to drop it.

Only after that review, set a concrete `reason` and `complete: true`. Then:

```sh
node chromium/android/release/attest.mjs prepare "$WORK" "$SRC" "$WORK/sbom-review.json"
```

`prepareInputs(workDir, src, review, run = spawnSync)` verifies the pinned
additional artifact bytes and every licence digest, copies only licence files
into `WORK/license-inputs/`, writes `WORK/sbom-inputs.json`, and checks that
those copied inputs can produce the SBOM. It fails on missing licence text,
unreviewed omissions or a mismatch. Repository licence entries in the template
have `repositoryPath`; the helper reads their immutable Git objects and copies
them under `license-inputs/repository/`.

Copy `build.json`, `scan.json`, `sbom-inputs.json` and the complete
`license-inputs/` tree to the Mac work folder. The source tree and original
server paths are not needed on the Mac. Task 9's fetch stage must preserve
these names/bytes and make the source commit object available in the local
repository. Its attest stage calls `attest(workDir, env, run)` after signing to
`Blanc-Android.aab`. The CLI equivalent is:

```sh
node chromium/android/release/attest.mjs "$WORK"
```

The input schema is 1: `sourceCommit`, `upstream`, `chromiumVersion`, `scan`
(relative path), `scanSha256`, `src` (`license-inputs`), `review`
(`sourceCommit`, `complete`, `reason`), `additions` and `reviewedSkips`.
The helper rechecks the known additions and Android pin against the exact
build source commit on the Mac, then reads and hashes the copied licence
texts. An operator's completeness flag alone cannot omit known components.

Identical SBOM/checksum files are reusable. A completed signature is verified
again with both exact pins, without another sign-in. Changed artifacts refuse
reuse. A failed or partial signature is preserved and refuses verification;
reconcile it explicitly before retrying rather than overwriting evidence.

## Task 7 rulings

- **Ruling: choose Android's licence platform from its exact GN bundle target.**
  The scanner previously passed `target_os='mac'` even for Android. The Android
  target now uses `android`; desktop's default remains `mac`. Why: the scan must
  reflect the payload built. Cost if wrong: first server scan fails or exposes
  further Chromium licence-tool assumptions; no build or release gate is waived.
- **Ruling: Android has its own reviewed additions.** Desktop's Beta inventory
  carries Sparkle and Island-only assets. Known Android provenance is derived
  from the exact source commit, while additional server metadata and licence
  texts require a real review. Cost if incomplete: preparation/attestation fails
  closed on the first real run until the inventory and licence inputs are fixed.
- **Ruling: read Chromium's version from the tagged Android lane pin.** Task 4's
  record has an upstream commit, not a Chromium version. Why: labeling it with
  an unchecked version or desktop pin would give false provenance. Cost if the
  commit is unavailable locally: fetch that source object before attesting.
- **Ruling: keep the stable signed name `Blanc-Android.aab`.** Why: Task 9 can
  record an exact artifact set. Cost if a later stage chooses another name:
  update that stage before using this helper; do not broaden the checksum set.

Remaining release evidence: the actual Android scanner output and omitted
metadata review, missing upstream licence inputs, server artifact checks,
real Cosign verification, and the eventual Play/device gates. Fixture tests do
not establish any of those results.
