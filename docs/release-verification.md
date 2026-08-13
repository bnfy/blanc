# Verify a Blanc release

Download Blanc only from the official
[GitHub releases page](https://github.com/bnfy/blanc/releases). A current
release contains the installers plus these verification assets:

- `SHA256SUMS` — a SHA-256 digest for every release artifact;
- `SHA256SUMS.sigstore.json` — the Sigstore bundle authenticating that
  manifest;
- `Blanc-<version>.cdx.json` — a CycloneDX software bill of materials;
- `windows-signature.json` when Windows is included — the publisher and
  digest observed after Authenticode verification.

## Release-operator prerequisites

`scripts/release.sh` fails closed unless `cosign` is on `PATH` and both of
these variables are set:

```sh
export BLANC_COSIGN_IDENTITY='anthony@bnfy.me'
export BLANC_COSIGN_OIDC_ISSUER='https://github.com/login/oauth'
```

These are the authorized values (chosen 2026-08-12): the release operator
signs in with the `bnfy` GitHub account, whose primary verified email is
`anthony@bnfy.me`. The same pair is published on the Blanc security page
(https://blancbrowser.com/features/security) so verifiers can pin it
independently of any release. If the pair ever changes, update the security
page and this document in the same change, and note the rotation in the next
release's notes. Verify the publication from a clean machine before the next
public release.

## 1. Verify the files

From the directory containing the release assets:

```sh
shasum -a 256 -c SHA256SUMS
```

On Windows PowerShell, compare the value from
`Get-FileHash -Algorithm SHA256 <installer>` with the corresponding line in
`SHA256SUMS`.

A checksum detects a damaged or substituted file relative to the manifest. It
does not authenticate a manifest downloaded from the same compromised source.

## 2. Authenticate the manifest

Blanc's release gate requires an exact Sigstore certificate identity and OIDC
issuer, then verifies the generated bundle before a draft can be published:

```sh
cosign verify-blob \
  --bundle SHA256SUMS.sigstore.json \
  --certificate-identity '<published signing identity>' \
  --certificate-oidc-issuer '<published OIDC issuer>' \
  SHA256SUMS
```

The expected identity and issuer must be published in the release notes and on
an independently served Blanc security page before this becomes a useful
public authentication step. Until that operational step is complete, treat
the Sigstore bundle as release evidence rather than an independently pinned
trust anchor. Never copy the expected identity from the bundle being checked.

## 3. Check the platform signature

- **macOS:** after mounting the DMG, run
  `spctl --assess --type execute --verbose /Volumes/Blanc/Blanc.app` and
  `codesign --verify --deep --strict --verbose=2 /Volumes/Blanc/Blanc.app`.
  Gatekeeper should accept the app and report Blanc's Developer ID signature.
- **Windows:** open the installer's Properties → Digital Signatures, or run
  `Get-AuthenticodeSignature .\Blanc-Setup-<version>.exe`. Status must be
  `Valid`, the publisher must match the publisher named on the release, and a
  timestamp certificate must be present.
- **Linux:** AppImage has no platform-equivalent publisher signature. Verify
  its SHA-256 digest and the authenticated manifest.

GitHub build-provenance attestations cover native CI artifacts as a second
source of build evidence. They complement, rather than replace, platform
signatures and the signed complete release manifest.
