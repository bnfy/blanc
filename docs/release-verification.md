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

## Release-operator runbook

This is a human-gated workflow with two supported interactive operator modes:

- `terminal` (default): run directly in a native macOS Terminal.app window.
- `agent`: Codex or Claude must use an interactive PTY and run the complete
  command outside its sandbox with the user's execution approval.

Background/non-interactive releases are forbidden. Agent mode is explicit so
no agent should spoof `TERM_PROGRAM` to bypass the operator check.

Before starting, unlock the 1Password desktop app and ensure `gh auth status`
succeeds in the selected operator environment. Do not fetch or paste either
secret and do not run a separate sign-in flow: `release.sh` owns both 1Password
boundaries. It first runs the exact proven preflight
`OP_BIOMETRIC_UNLOCK_ENABLED=true op signin`, then uses the same forced
desktop-app path for `op run`. In agent mode, a sandboxed CLI cannot reach
1Password's local IPC channel; launch the whole release outside the sandbox
instead of retrying setup. If `op` offers to add an account manually, cancel it:
that is never a valid release authentication step.

For the normal Apple-Silicon stable release from Terminal.app:

```sh
cd "/Users/anthonyjloria/Projects/Blanc Browser"
BLANC_RELEASE_OPERATOR=terminal \
BLANC_COSIGN_IDENTITY='anthony@bnfy.me' \
BLANC_COSIGN_OIDC_ISSUER='https://github.com/login/oauth' \
BLANC_RELEASE_MODE=stable \
BLANC_RELEASE_PLATFORMS=mac,windows,linux \
BLANC_MAC_ARCHES=arm64 \
npm run release
```

For the same release directly from Codex or Claude, use the identical checkout
and release inputs but select agent mode:

```sh
cd "/Users/anthonyjloria/Projects/Blanc Browser"
BLANC_RELEASE_OPERATOR=agent \
BLANC_COSIGN_IDENTITY='anthony@bnfy.me' \
BLANC_COSIGN_OIDC_ISSUER='https://github.com/login/oauth' \
BLANC_RELEASE_MODE=stable \
BLANC_RELEASE_PLATFORMS=mac,windows,linux \
BLANC_MAC_ARCHES=arm64 \
npm run release
```

The agent must execute that whole command in a PTY outside its sandbox; in
Codex terms, request escalated/unsandboxed execution for `npm run release`.
Do not run only `op signin` outside the sandbox and then put the release back
inside it.

Keep the operator session available for these approvals:

1. **1Password / Apple notarization.** The prompt must name the actual selected
   operator: Terminal in terminal mode, or Codex/Claude in agent mode. If it
   names a different process or asks to add an account manually, stop.
2. **Sigstore / GitHub identity.** The release-scoped browser shim opens the
   fresh OIDC page in Safari and the callback targets
   `127.0.0.1:${BLANC_COSIGN_REDIRECT_PORT:-49197}`. Complete it immediately;
   do not reuse an old page and do not authorize it in Blanc. Override the port
   only if 49197 is already occupied.

During notarization, monitor only process names and elapsed time, for example:

```sh
ps -axo pid=,ppid=,etime=,comm=
```

Never inspect or paste the full `notarytool` command line. Apple's app-specific
password is passed in its argv by the notarization library. If it reaches a
terminal capture, agent tool result, or log, revoke it and replace the
`Apple Notarization` credential in 1Password before another release.

### If the release fails

- **Before the source tag/draft exists:** fix the failure, verify that neither
  the local/remote tag nor GitHub release exists, and restart the same version
  from the native Terminal command.
- **After the source tag or draft exists:** do not rerun `npm run release`, do
  not delete the tag, and do not overwrite native installers. The draft and tag
  are evidence for that immutable attempt.
- If only the final Sigstore step failed, confirm the native GitHub Actions run
  is green, download the draft into a fresh temporary directory, validate the
  native asset set, regenerate the SBOM and `SHA256SUMS`, create a **fresh**
  Safari/IPv4 Sigstore authorization, verify the bundle against the pinned
  identity and issuer, validate the complete manifest, upload only the three
  derived finalization assets, publish the already-verified draft, and run the
  logged-out download smoke. These are the same ordered operations at the end
  of `scripts/release.sh`; preserve that order and fail closed.
- Never use the complete-manifest validator between checksum creation and
  Sigstore signing: once `SHA256SUMS` exists it correctly requires
  `SHA256SUMS.sigstore.json`. At that intermediate point use
  `shasum -a 256 -c SHA256SUMS`; run the complete validator after the bundle is
  created.

After publication, regenerate and commit `site/src/data/releases.json`, advance
the public and migration baselines, run `npm run site:build`, push, then run
`npm run site:deploy`. Verify the canonical changelog and homepage version, not
only the Cloudflare preview URL. The v1.4.0 incident and recovery are recorded
in `docs/release-incidents/2026-08-15-v1.4.0.md`.

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
