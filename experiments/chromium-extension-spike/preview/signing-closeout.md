# Preview signing closeout

October 22, 2026. Owner selected the existing release-signing Mac/CI setup. Candidate preparation is authorized; public release is not.

## Verified prerequisites

- Existing `scripts/release.sh` authenticates through the 1Password desktop integration and injects credentials with `.env.1password`. Reuse the credential source, **not** the script: it cleans/builds the shipping Electron product.
- Local keychain enumeration returned zero valid signing identities. The 1Password release account authenticated successfully. Presence-only validation confirms notarization credentials are supplied, but CSC_LINK and CSC_KEY_PASSWORD are absent; no certificate is provided through that source. Unsandboxed login/System checks and a direct disposable signing probe confirm no identity. The designated vault backup contains only an Apple Development public .cer, not the shipping private key; owner correction/access is required. No secret values were read or written to evidence.
- The preview packager already stages a self-contained app and distinct helper identities. Its ad-hoc signature is not distributable.
- Chromium source supplies `chrome/installer/mac/signing/parts.py` and role-specific entitlement templates. Renderer/GPU signing intentionally differs from other helpers. Do not apply Electron entitlements or one blanket `codesign --deep` signing command.

## Ordered remaining actions

1. Authenticate through existing 1Password desktop integration. Validate only credential availability and certificate identity/expiry; never print secret values. Use an isolated temporary signing keychain, leaving existing keychains and identities intact.
2. Stage a new preview from the current incremental native output. Record source commit, source/output provenance, resource hashes and unsigned manifest. Never modify the running dev app or Google fixture.
3. Derive the signing inventory from Chromium's part definitions, adjusted for preview bundle/helper names and the small preview launcher. Sign nested Mach-O parts inside-out with the correct role entitlements and hardened runtime. Review keychain/service identity and updater exclusion explicitly.
4. Verify the entire signed bundle, Team ID, designated requirements, entitlement inventory and resource sealing. Reject unexpected development entitlements or unsigned code. Generate a new manifest after signing; the pre-sign digest cannot identify the final artifact.
5. Notarize through the existing credential source, retain submission/log result, staple and validate. No publishing action. On rejection preserve logs and repair the concrete issue.
6. Run isolated signed-artifact smoke on this host, then quarantined acceptance on supported macOS 26. Current macOS 27.2 testing does not satisfy that OS row. Complete one combined L2/L5/L6/L10 pass and L7 review on the identical digest.
7. Record exact-head CI/audits and obtain final artifact-specific release approval. Signing alone closes neither Decision 2 nor public-release gates.

Authentication is an external prerequisite, not a code or build failure. No latency tests or Electron diagnostic build are part of this sequence. Google baseline/profile and permanent tabs remain untouched.


Resolved October 22: owner identified MacBook Pro M5. Its Developer ID identity signed the preview through the desktop security session; notarization completed locally (Accepted bd03e98b-64b0-4573-a106-00ab9122220b), ticket stapled/validated and Gatekeeper accepted. Launcher minimum corrected to macOS26. Temporary SSH key removed from authorized_keys, revoked connection rejected, local private key deleted, remote staging removed. See ../evidence/signed-preview-20261022/README.md. Earlier access blockers are historical.
