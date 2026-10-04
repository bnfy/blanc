# Public Blanc v1.27.0 verification — October 3, 2026

[Blanc v1.27.0](https://github.com/bnfy/blanc/releases/tag/v1.27.0) was published
at `2026-10-04T03:14:49Z` (October 3 in America/New_York) from immutable tag
`602a1a85a9b80453b2561b3e10c5e5795c3ff659`. Both Mac architectures use bundle
build 1274. The release enables optional full uBO 1.75.0 on official Electron
44.5.1 for Apple Silicon, native Intel Mac, Windows x64 and Linux x64.

## Independent public artifact checks

A fresh unauthenticated GitHub API request and logged-out GET downloaded all
18 public assets. Their sizes and computed SHA-256 digests matched the public
metadata. The complete-manifest validator accepted 17 artifacts plus
SHA256SUMS; all 16 checksum entries passed. `cosign verify-blob` passed against
identity `anthony@bnfy.me` and issuer `https://github.com/login/oauth`.

Both public DMGs were mounted read-only. The contained apps passed Gatekeeper,
strict deep codesign verification, signer certificate pin
`55283A84D3706D5A22386D5F002A0CD4845ECFD4`, and stapled-ticket validation.
Version/build were 1.27.0/1274. All eight hardened fuse states, bundled
EasyList/EasyPrivacy bytes, 658 upstream uBO files, corresponding source,
adaptation records and 39 license records passed the packaged checks.
The two architectures have the same app.asar digest. No normal user profile
was opened or changed during this independent check.

GitHub attestation verification passed on the fresh public Windows installer
and Linux AppImage. Both provenance statements resolve to the immutable
release source. The packaged Windows signing receipt binds the timestamped
publisher observation to the public installer digest.

## Native and public execution

- [Native release run 37173147979](https://github.com/bnfy/blanc/actions/runs/37173147979)
  passed Windows and Linux signing/payload/fuse/compliance and packaged
  regression checks. The Linux sandbox matrix is skipped in release mode;
  its earlier final-runtime validation evidence remains separately recorded.
- [Exact-tag public run 37173603497](https://github.com/bnfy/blanc/actions/runs/37173603497)
  passed all four jobs: hosted public Mac DMG signature/ticket verification,
  public AppImage digest/provenance/launch, and Windows/Linux DNS and window
  geometry checks. Its checkout is the exact published tag.
- The final release press gate passed 2,225 unit tests, 168 desktop scenarios
  and 1,005 steps, plus the packaged regressions, 52 live favicon sites and
  Blanc vector canary, and public v1.26.0 profile migration.

[Machine-readable receipt](ublock-public-release-2026-10-03.json) retains the
public asset hashes, signer/fuse/payload results, provenance source, and job
outcomes. It contains no browsing data or private profile paths.

## Limits retained

Earlier installed candidates retain their original build/source/artifact
bindings. Their acceptance is not relabelled as an installed final build 1274
probe. Native hosted checks do not establish physical-machine results.
Rosetta is excluded; the existing Ubuntu 26.04 ARM64 VM was not changed and
cannot run the x64 AppImage. No new VM or sandbox bypass was introduced.

Adjacent **public-feed** v1.26.0 → v1.27.0 macOS and Windows Restart Now handoffs
remain pending. Earlier authenticated staged candidate handoffs are separate
evidence. No unperformed handoff is marked passed or waived.
