# Blanc Chromium macOS beta release runbook

**Updated 2026-11-10. Identity and build decisions are approved, but the later owner hold in `chromium/CODEX-NOTES-beta-build.md` defers F and G until the owner resumes them. Publication, Developer ID signing, Apple, 1Password and production Sync remain separate owner operations.** The shell entrypoint is deliberately incapable of executing a release. Finish the staged patches and qualification below before replacing that guard in a reviewed change. Existing Electron release scripts and `src/`, `spec/`, `test/desktop/` are unchanged.

This beta is a separate application alongside shipping Electron Blanc, updates with Sparkle starting at beta 1, uses GitHub **pre-releases in bnfy/blanc**, has **no Widevine**, and requires production Blanc Sync. These owner decisions supersede the older replacement spec's same-ID migration design for this beta. They are not open questions. No production Sync, GitHub release API, Apple or 1Password connection was made during setup.

## 1. Inputs and immutable version ledger

Start from `chromium/lanes/desktop.json`, `chromium/upstream/manifest.json` and `chromium/source-map.json`. On `chromium/migration` at `6875f564` (this tooling was first written against `ed162e36` on the S3 branch and rebased), the desktop lane has 38 ordered patches and 142 pristine upstream files. Recount before relying on these figures. The pinned upstream is **681cd621e82e606d7536eae8ea2576afb3c7d65c**, version **158.0.8127.2**. Preserve the order, the reconstructed hashes, canonical `chromium/blanc/` source and asset manifest. `python3 chromium/tools/check-patches.py --lane desktop` reconstructs those inputs without a Chromium checkout.

Create a real `release.json` outside the repository from the *schema* in `chromium/release/fixtures/release.json`; its zero digests, keys and candidate IDs are test data, never release inputs. It must include:

- Exact clean source commit, upstream revision, patch/canonical-source inventory digest (`node chromium/release/preflight.mjs --inventory`), architecture set, candidate ID **for each architecture**, reviewed GN file digests, profile digest and pinned Sparkle distribution digest/public key.
- A version, tag and monotonically increasing build from an append-only beta release ledger. Check all local/remote tags and drafts, not just public releases. Reserve numbers before distributing any signed candidate; failed drafts retain their numbers. The ledger is `chromium/release/ledger.json` (`{build, version, tag?, date, note}` per consumed build, strictly increasing): append an entry in a reviewed commit whenever a build number is consumed, public or private. Preflight reads it, requires `previousBuild` to equal its highest build, and refuses a reused build, version or tag.
- Beta 1 is `arm64` only. Owner waiver, 2026-11-10: Intel is deferred until a separately qualified native build. Later releases require both architectures or a fresh explicit waiver. The fixture records this decision; the real release descriptor must carry it too.
- `prerelease: true`, `makeLatest: false`, minimum macOS version (upstream currently 13.0), and acceptance evidence tied to final artifact digests.

Approved beta version mapping (owner decision, 2026-11-10):

| Field | Beta 1 | Next distributed attempt |
| --- | --- | --- |
| Human release version | `2.0.0-beta.1` | `2.0.0-beta.2` |
| Git tag | `chromium-beta-2.0.0-beta.1` | `chromium-beta-2.0.0-beta.2` |
| Outer `CFBundleShortVersionString` and Sparkle `sparkle:shortVersionString` | `2.0.0-beta.1` | `2.0.0-beta.2` |
| Outer `CFBundleVersion` / Sparkle `sparkle:version` | `1` | `2` |
| Chromium `chrome/VERSION` | `158.0.8127.2` | unchanged until a reviewed upstream update |
| Chromium framework directory/version | `158.0.8127.2` | follows Chromium, not Sparkle |

The policy accepts integer builds 1–9999 and fails at exhaustion; review an extension before then. Beta sequence and build are distinct: private qualification attempts also consume build numbers. Never reset the build at a Chromium milestone change. Chromium's [mac plist generator](https://chromium.googlesource.com/chromium/src/+/681cd621e82e606d7536eae8ea2576afb3c7d65c/build/apple/tweak_info_plist.py) normally makes the outer short version `158.0.8127.2` and bundle version `8127.2`. A beta-only packaging action must override **only the outer app's two keys before signing**, set the short version to the full beta version (`2.0.0-beta.N`, the owner's choice on November 10, 2026, so About and the update prompt name the same version the feed does), and preserve framework/dylib/helper versions. Apple documents `CFBundleShortVersionString` as three period-separated integers; a suffixed string is common outside the App Store, but confirm on the first real build that notarization, Gatekeeper and Sparkle accept it. Do not rewrite `chrome/VERSION` to a three-part Blanc semver: Chromium depends on its four integers. The signing sanity check in `signing/parts.py::_sanity_check_version_keys` skips the Keystone comparison when `KSVersion` is absent; do not introduce Keystone keys to solve this.

Candidate IDs from the preview tracker are not beta qualification. Bind `chromium/tools/build.mjs`'s actual resulting candidates and compiled-input/args hashes to each release architecture. Evidence from an older candidate becomes stale after a code, GN, resource, signing or packaging change. Keep unsigned and signed binary digests distinct.

## 2. Approved dedicated beta output and reviewed GN configuration

`chromium/README.md`, `HANDOFF.md`, `STATUS.md` and the build wrapper document preservation of `out/BlancPrototype`, `out/BlancRelease`, SDK/compiler and GN arguments. The preserved host `out/BlancPrototype/args.gn` was read on 2026-11-10: `is_debug=false`, `is_component_build=false`, `symbol_level=0`, `target_cpu="arm64"`, and no other explicit assignments. Its SHA-256 is `414e3baad6c84730b3c17f411ed82c5065561ba344fe2a202675654e1e18a057`. The file was not changed. Its implicit channel is preview and official-build is false. The November 10 task queue explicitly approves a separate cold `out/BlancBeta` output and an incremental beta.2 rebuild. It does not authorize changing prototype arguments, caches or toolchains.

The intended semantic diff for review on the build host is:

| Setting | Observed prototype contract / before value | Approved beta value |
| --- | --- | --- |
| `blanc_channel` | `preview` default; current alternative `release` reuses Electron's ID | `"beta"` (implemented) |
| `is_official_build` | implicit `false` | `true` |
| `is_debug`, `is_component_build` | both explicitly `false` | both `false` |
| `target_os`, `target_cpu` | host macOS, explicit `"arm64"` | `"mac"`, `"arm64"` for this approved build |
| `is_chrome_branded` | Chromium branding source selected | `false` (never Google Chrome branding) |
| `enable_updater` | effective GN value unverified | `false` (this is Chromium/Google updater, not Sparkle) |
| `enable_widevine`, `bundle_widevine_cdm` | exact args unavailable | both explicitly `false` |
| Test hooks / disk assets | preview-only and `!is_official_build` in config.gni | absent in beta; keep these predicates fail closed |
| SDK/compiler, PGO, LTO, symbols and CPU tuning | exact values unavailable | retain pins where compatible; review every effective official-default change |

On the authorized build machine, save both args files, `gn args --list` effective values, toolchain/SDK hashes and the literal diff. Official defaults may change optimization, PGO inputs, symbol generation and SDK requirements: they are not a small packaging-only toggle. [mac_sdk.gni at the pin](https://chromium.googlesource.com/chromium/src/+/681cd621e82e606d7536eae8ea2576afb3c7d65c/build/config/mac/mac_sdk.gni) selects macOS 13.0 minimum, official SDK 27.0/26A425 (and the Intel-host universal alternative 26.5/25F70). Confirm the effective host path; do not silently select an SDK, fetch PGO data, run hooks, clean, or bypass the guard.

The dedicated configuration is approved for this machine and the new `out/BlancBeta` directory; execution is now held by the subsequent owner notice. `chromium/tools/build.mjs` now allowlists that output beside BlancPrototype/BlancRelease. Preserve both existing outputs and Siso caches. Inspect competing build **process names**; obtain a reviewed dry-run plan, then use the guarded wrapper with the approved action limit. A cold beta output is a separately authorized cold build, not disguised as incremental. After integration, preflight insists on explicit literal GN assignments, exact file hashes and the listed safety values, and refuses any other argument until it is added to `GN_REVIEWED_EXTRA` in `policy.mjs` in a reviewed change; it does not run GN or prove effective toolchain selection.

### Local qualification configuration

The initial free-space check found 1,230,791,700 KiB available (about 1.15 TiB),
128 GiB RAM and 18 logical CPUs. `out/BlancBeta` was absent. The local build
requires at least 200 GiB free before starting; actual disk use is monitored.
No `gclient sync`, hooks, clean or toolchain download is part of this run.

The official defaults request PGO profiles that are absent from
`chrome/build/pgo_profiles`. Reviewed fallback: explicitly `chrome_pgo_phase=0`
and retain `symbol_level=0`, with `is_official_build=true`, non-component release
optimization and the existing LLVM/Xcode/SDK. ThinLTO remains the official
default. Both macOS deployment/minimum arguments are explicitly `"13.0"`.
`validateGN` accepts only these reviewed fallback values; it still refuses
arbitrary additional arguments, debug/component mode, Widevine or Google updater.

To perform the owner's local updater/Sync exercise without contacting production,
this private build sets `blanc_beta_local_qualification=true`. That compile-time
choice fixes Sync to `http://127.0.0.1:49261` and the appcast to
`http://127.0.0.1:49262/arm64.xml`, with only the matching loopback beta DMG name
accepted. It uses a throwaway EdDSA key in an owner-only temporary directory.
No runtime argument, renderer message or edited plist selects these endpoints.
A relaunch therefore cannot fall back to production Sync. Normal official builds
ignore the preview Sync endpoint switch and retain the immutable production feed.

The private app is marked `BlancLocalQualification=true` in its metadata.
Production release validation, GN preflight and artifact verification refuse
that marker/configuration. `verify.mjs --local RELEASE.json arm64 APP` performs
layout, nested-ID, no-Widevine, notices, linkage and architecture checks without
Developer ID, a ticket, Gatekeeper or a launch. It cannot establish release
acceptance. Production requires a fresh unused build/version, production key,
`blanc_beta_local_qualification=false` and the normal verifier.

The beta bundles the repository's full grants/identity carve-outs and generated
compliance notices, Sparkle's entire license and Chromium's actual generated
credits. The broad repository notice file is a source notice collection, not an
attestation that every listed Electron component ships in this fork; a complete
artifact-bound SBOM/compliance audit remains a publication gate.

## 3. Branding, profile and OS identity

These identity decisions are approved by the owner (2026-11-10) and enforced by the beta build and release policy:

| Surface | Beta value |
| --- | --- |
| App / executable / display name | `Blanc Beta.app` / `Blanc Beta` |
| Main bundle ID | `me.bnfy.blanc.beta` |
| Framework | `Blanc Beta Framework.framework`, ID `me.bnfy.blanc.beta.framework` |
| Ordinary/GPU/Aperitif helper IDs | `me.bnfy.blanc.beta.helper` (Chromium deliberately shares this ID) |
| Renderer/Aperitif Renderer helper IDs | `me.bnfy.blanc.beta.helper.renderer` |
| Alerts/Aperitif Alerts helper IDs | `me.bnfy.blanc.beta.framework.AlertNotificationService` |
| `CrProductDirName` / default data root | `Blanc Beta` / `~/Library/Application Support/Blanc Beta` |
| Safe Storage service / account | `Blanc Beta Safe Storage` / `Blanc Beta` |
| Application identifier | `XYGUCY4498.me.bnfy.blanc.beta` |
| WebAuthn keychain group | `XYGUCY4498.me.bnfy.blanc.beta.webauthn` |
| External direct-launch URL scheme | `blanc-beta` |
| Web/file scheme handlers | `http`, `https`, `file`, registered to this app only |

Use the Sunrise mark and visibly label the app Beta. Never select `chromium/blanc/branding/release/BRANDING` unchanged: it explicitly sets `MAC_BUNDLE_ID=me.bnfy.bowser`. Add beta branding, don't change the preserved Electron identity. Chromium's [chrome_paths_mac.mm](https://chromium.googlesource.com/chromium/src/+/681cd621e82e606d7536eae8ea2576afb3c7d65c/chrome/common/chrome_paths_mac.mm) reads `CrProductDirName` and derives a separate cache path. This verifies a default-path mechanism, not runtime isolation. Add a beta startup guard that rejects any resolved/symlinked `--user-data-dir` or migration/import source inside shipping Blanc's profile. Do not import, migrate, open or write shipping data during beta startup. Private tabs must stay out of disk/session/Sync evidence.

Preserve the internal `blanc://` UI scheme; it is not an OS-level launch registration. Replace the external `%DIRECT_LAUNCH_URL_SCHEME%` substitution with `blanc-beta` only for this channel (upstream otherwise generates `chromium`). Keep the browser document declarations and explicit default-browser chooser, using the beta bundle ID. Installing/launching/updating must not silently make Beta the default or commandeer stable's Dock/Login Items/notifications/protocols. Verify HTTP, HTTPS, file and direct-launch dispatch with both apps installed, including when stable is the default.

The WebAuthn suffix matters: [ChromeWebAuthenticationDelegate::TouchIdAuthenticatorConfigForProfile](https://chromium.googlesource.com/chromium/src/+/681cd621e82e606d7536eae8ea2576afb3c7d65c/chrome/browser/webauthn/chrome_web_authentication_delegate.cc) constructs `MAC_TEAM_IDENTIFIER_STRING + "." + MAC_BUNDLE_IDENTIFIER_STRING + ".webauthn"`. Populate beta branding's `MAC_TEAM_ID=XYGUCY4498` and authorize that exact group. Do not copy Electron's group (which lacks that suffix), Safe Storage item or provisioning profile.

## 4. Signing, provisioning, notarization and DMG

Read `CLAUDE.md` Commands/provisioning/release protocols and `docs/release-verification.md` again immediately before any real release. The reference Electron scripts are read-only. The current public certificate pin in `package.json` is **55283A84D3706D5A22386D5F002A0CD4845ECFD4**, team **XYGUCY4498**. Its presence/private-key access and expiry were not queried. Existing documentation records a 2027-02-01 certificate expiry; plan certificate and profile rotation together before then. Never fall back to a name match or another available Developer ID.

The beta's **Developer ID, all-devices macOS provisioning profile** was issued on November 10, 2026 ("Blanc Beta Developer ID", App ID `XYGUCY4498.me.bnfy.blanc.beta`) and is committed at `chromium/release/blanc-beta.provisionprofile`, the same way the stable app's profile is committed at `build/embedded.provisionprofile`; a profile holds no secret. It embeds exactly the pinned leaf certificate (serial `6B295A744C69F0C8`) and expires in 2044, but is unusable once that certificate expires on 2027-02-01. Apple issues Developer ID profiles with the team-wildcard keychain group `XYGUCY4498.*`, not the exact WebAuthn group, so policy requires the profile to cover the beta group within the beta team and enforces the exact group on the signed app's entitlements. `release.test.mjs` pins the file's SHA-256 and checks its decoded contents. A replacement must meet the same rules: `ProvisionsAllDevices=true`, no `ProvisionedDevices`, `Platform` containing OSX, unexpired dates, matching team/app entitlements, no debugging grant, and the pinned leaf. It belongs only at the outer app's `Contents/embedded.provisionprofile`, before signing. Helpers must not carry the group or a profile. Preflight decodes via local `security cms -D`; verification rechecks actual embedded bytes and actual signer.

The operator command is `chromium/release/operator.mjs`, with a concrete sequence
in §10. It uses the pinned Chromium code-part/entitlement inventory shared with
`verify.mjs`, including Sparkle's inner code, and signs a new copy in child-before-
container order. This replaces the nonexistent private signing adapter. It does
not change the upstream driver or stable release scripts. Unknown native code,
bundles, paths, local-qualification metadata and profile mismatches fail before
key access. Every signature uses the pinned fingerprint and a secure timestamp;
there is no development mode, automatic identity selection or `codesign --deep`
signing. Offline tests cover order, library refusal and notarization credential
redaction; actual signing and notarization remain unverified and unauthorized.

Reviewed entitlement matrix, derived from pinned Chromium `chrome/app/*-entitlements.plist` and `signing/parts.py`, not Electron entitlements:

| Part | Entitlements / runtime |
| --- | --- |
| Main browser | Upstream audio-input, Bluetooth, camera, print, USB, location and photos-library booleans; add beta application/team identifiers and exact WebAuthn group. Hardened runtime; retain library validation. |
| Renderer, GPU, Aperitif Renderer/GPU | `com.apple.security.cs.allow-jit=true` only; upstream restrict/kill/runtime signing flags. No WebAuthn group or blanket unsigned-memory/library-validation entitlement. |
| Ordinary, Aperitif and Alerts helpers; crashpad, app_mode_loader, web_app_shortcut_copier | No entitlements; upstream hardened runtime/restrict/kill/library validation. |
| Chromium framework and shipped dylibs | Pinned Developer ID; no entitlement additions. Runtime flags are not executable requirements for dylibs. |
| Sparkle framework, Autoupdate, Updater, Installer.xpc, Downloader.xpc | Re-sign all with the same Developer ID; runtime on executables, no debug or App Sandbox entitlement for the default distribution. Exact IDs are pinned in verifier. |

The verifier checks the DMG signature/leaf/ticket as well as the contained app. The verifier compares **DER** entitlements, strict deep signatures, TeamIdentifier, Developer ID authority, timestamp and the extracted leaf fingerprint for every known code part; rejects unknown Mach-O payloads, unknown nested bundles, escaping symlinks, helper profiles and Widevine names. It checks nested plist IDs, Sparkle version, Chromium framework version, beta feed/build/name/default directory and all required notice files. Real DER layout and actual distribution contents still need qualification; do not loosen a failure without reviewing source and updating tests.

Authentication and wrapping follow stable's existing `OP_BIOMETRIC_UNLOCK_ENABLED=true
op signin` and `op run --env-file=.env.1password --no-masking` pattern. The exact
future commands are in §10. The operator tool captures child output and returns
only fixed errors or a validated Accepted receipt; it never prints credentials,
child arguments, environment or raw notarization diagnostics. Notary credentials
exist in the private child argv, as in the stable library; monitor process names
only (`ps ... comm`), never full arguments. No shell tracing or environment dumps.

Require native foreground Terminal or explicitly approved unsandboxed agent PTY; don't spoof `TERM_PROGRAM`. After one agent-mode policy rejection, follow the existing Terminal handoff protocol, not repeated bypass attempts. Cancel manual 1Password account setup. The future script must require `op` before any build and fail closed on authentication/notarization failure.

Await Apple **Accepted**, staple/validate the application, then package the stapled app in an architecture-specific DMG with an Applications link, using Chromium's DMG pipeline. Sign/notarize/staple the DMG too as additional beta policy. The required app stapled ticket is independent of the container ticket. Preserve symlinks/permissions. Verify the final read-only mounted DMG's app and Gatekeeper before hashing/signing its exact bytes; never mutate it after Sparkle/manifest signing. Future command:

```sh
node chromium/release/verify.mjs /private/release.json arm64 /private/Blanc-Beta-2.0.0-beta.1-mac-arm64.dmg
# Separately, after service-contact authorization:
spctl --assess --type execute --verbose /Volumes/Blanc-Beta/Blanc\ Beta.app
```

`verify.mjs` does not run Gatekeeper, launch the app, or sign anything. It mounts a DMG read-only and detaches in `finally`; on detach failure it preserves the mount directory rather than deleting it. Treat its success as structural/signature evidence, never release acceptance or permission to contact Apple.

## 5. Sparkle integration and custody

Approved implementation pin: **Sparkle 2.10.1** (framework build 2065), the newest stable 2.x in the first-party release data checked November 10, 2026. The owner approved replacing 2.8.0. The [release](https://github.com/sparkle-project/Sparkle/releases/tag/2.10.1) requires macOS 12; Blanc Beta retains macOS 13. The downloaded 16,346,336-byte archive matches the published SHA-256 `1a856d2a9edb8e628de88121d7be04cf0e2167f8641650b78fca00b14244cf27`. Its [full LICENSE](https://github.com/sparkle-project/Sparkle/blob/2.10.1/LICENSE), including third-party terms, is byte-identical to the committed full notice. Package all of it. [The dated review](../chromium/release/sparkle-review-2026-11-10.md) covers all five published post-2.8.0 advisories, their fixed versions, source hashes and remaining native qualification. This source/security review does not qualify an actual updater installation. Upstream Sparkle release access was authorized; no Blanc GitHub release, Apple or production Sync contact occurred.

Patch 0047 implements a macOS browser-process owner under `chromium/blanc/browser/mac/` holding `SPUStandardUpdaterController`, created on the main thread at app startup, retained until shutdown. Wire app-controller lifecycle and a visible **Check for Updates…** action in the native app menu and Settings → About. The setting should explain checking/downloading/installing; automatic checks must function in beta 1 after the normal user choice. Use Sparkle's [programmatic API](https://sparkle-project.org/documentation/programmatic-setup/), with graceful browser close/session flush and relaunch handling. No page/renderer may set a feed URL, invoke privileged install, or substitute a trust key. Official builds must not honor test endpoint overrides.

Copy `Sparkle.framework` into the outer `Contents/Frameworks`, preserve its `Versions/B` symlinks, link the browser code with the correct loader rpath from Chromium's versioned framework, and verify `otool -L` on the built result. Embed an architecture-specific `SUFeedURL` and `SUPublicEDKey` before signing, set `SUVerifyUpdateBeforeExtraction=true`, and avoid deltas for beta 1. Keep automatic check preference and updater state in the beta defaults domain. No Google Keystone/updater service is enabled.

Chromium's child-process sandbox is **not** the macOS App Sandbox. The browser process is not App Sandbox-entitled in this design. Keep Sparkle's default framework-contained Installer/Downloader XPCs signed but do not enable sandbox-specific `SUEnableInstallerLauncherService` / `SUEnableDownloaderService` or add mach-lookup exceptions. Sparkle's [sandboxing guide](https://sparkle-project.org/documentation/sandboxing/) documents those only for an App Sandbox host; an actual sandbox change reopens this decision. Verify spawn/relaunch, both XPC signatures, privileged-install prompt behavior, and inherited-sandbox isolation on real artifacts. The stock IDs are `org.sparkle-project.InstallerLauncher`, `org.sparkle-project.DownloaderService`, `org.sparkle-project.Sparkle.Updater` and `org.sparkle-project.Sparkle.Autoupdate`. Do not infer IDs from the on-disk XPC names.

Key ceremony (future explicit operator action): use pinned Sparkle `bin/generate_keys` once under the operator's login Keychain. Public key goes into source/Info.plist and release policy. Back up/export the EdDSA private key into a dedicated **Dev / Blanc Chromium Beta Sparkle Signing** 1Password item with restricted access; do this in a private operator workflow, never captured tool output. Sparkle's documented export/import options use a file; if needed, use an owner-only temporary directory/file outside Git, import into 1Password, verify a recovery/import ceremony, then remove the plaintext. Never put a private key in arguments, environment dumps, CI artifacts, `release.json` or this repository. Normal `sign_update` should use the login Keychain; 1Password is recovery custody. Reusing Electron or another product's updater key is forbidden. No key generation or 1Password access occurred in phase 1.

Approved beta feeds are independent HTTPS resources (not deployed):

- `https://blanc.day/updates/chromium-beta/arm64.xml`
- `https://blanc.day/updates/chromium-beta/x64.xml`

They are not deployed. A later website-only delivery must reserve these routes, MIME `application/rss+xml`, short revalidation caching and atomic promotion, without adding beta to stable releases.json. Each contains one canonical RSS 2 item, Sparkle namespace, monotonic build, beta display version, minimum OS and an enclosure URL under `https://github.com/bnfy/blanc/releases/download/<beta-tag>/`. Enclosures carry byte length and a verified 64-byte Ed25519 signature. `appcast.mjs` signs nothing: it checks the supplied signature against actual DMG bytes and the pinned public key, then generates/validates that restricted format. It intentionally rejects noncanonical feeds, alternate URLs, duplicate/extra elements, DTDs and deltas. Compare its result with Sparkle's own tools during qualification; Node cryptographic tests alone cannot prove Sparkle integration.

```sh
# After all signing/stapling is complete; signature.txt contains ONLY sign_update's
# public base64 edSignature, not its XML fragment and never a private key.
node chromium/release/appcast.mjs generate /private/release.json arm64 /private/assets /private/signature.txt /private/assets/appcast-arm64.xml
node chromium/release/appcast.mjs validate /private/release.json arm64 /private/assets /private/signature.txt /private/assets/appcast-arm64.xml
```

Sparkle validates the archive against the embedded EdDSA key before extraction; native code signatures and Gatekeeper provide a separate platform identity check. HTTPS protects transport. An archive signature does not authenticate feed prose or prevent replay of an older valid feed; builds must not downgrade. Sparkle 2.10.1 supports signed feeds, but this integration does not configure that option: do not claim the XML itself is cryptographically signed. Keep the feed minimal with no externally supplied notes HTML. The immutable published appcast is also covered by the Sigstore-authenticated release manifest for independent verification.

Before beta 1 is public, stage two real signed/notarized beta-identity builds **N and N+1** on a private qualification feed, consuming unique build numbers. Start inside installed N, discover N+1, download the public-format signed archive, click the updater's install/relaunch action, and prove replacement/relaunch/profile continuity, Sync credentials and passkeys survive. Also reject wrong key, tampered bytes, wrong bundle ID, older/equal build and wrong architecture; test offline/error/retry and read-only-DMG behavior. A direct installer launch is not an updater handoff. Record N/N+1, source/DMG hashes and both architecture results. The first public beta contains that verified updater, and its eventual public N→N+1 transition remains a separate post-publication gate. Do not reuse a private sequence number for different public bytes.

## 6. Candidate gates before any public release

No preview aggregate establishes these passes. `chromium/STATUS.md` and the S4a notes still contain failures/undefined cases; resolve each applicable beta blocker or record a specific owner-approved scope decision without converting failure to pass. Phase-one manifest policy accepts only **pass** for its required gates.

1. **Acceptance on the exact official candidate:** run the complete applicable desktop corpus with the display rendering, preserve raw/JUnit output and candidate/platform bindings. `node chromium/tests/runner.mjs CONFIG EVIDENCE` is the existing runner, not proof official images are testable. Hooks are compiled out of official builds: add external native/CDP/UI acceptance adapters or a reviewed official-image harness before the gate can pass. A separately instrumented sibling may diagnose faults but cannot substitute for exact-candidate acceptance.
2. **Local Sync:** run `/usr/local/bin/node chromium/tests/desktop-sync.mjs CONFIG EVIDENCE`. Its current source launches a local Worker, mocks Keychain, uses `--blanc-sync-endpoint` and preview test hooks. Preserve that regression check on the matching instrumented source, and adapt the native gate to exercise the official artifact without enabling production hooks. Until that adapter exists, the exact-candidate `desktop-sync` gate is blocked, not waived.
3. **Production Sync, real device:** later, with service access authorized, use the production endpoint `https://blanc-sync.bnfy-441.workers.dev` pinned in `chromium/blanc/services/sync_runner/sync_endpoint.h` (not Google Chrome Sync), pair the beta with an owner-controlled real iPhone/other supported device through normal UI. Test existing-data upload consent, bidirectional Favorites/settings, relaunch/keychain persistence, offline merge, disconnect and no private data upload. Retain only sanitized aggregates and evidence hashes, never account tokens, pairing codes, profile contents or device credentials. Local S4a evidence is not this pass.
4. **Packaged compliance:** audit `Contents/Resources/notices/` against the actual dependency inventory: Blanc LICENSE, reserved identity terms, both third-party notices, upstream Chromium LICENSE and generated full Chromium credits, full Sparkle license, all included fonts/filter lists/extensions and their sources/required offers. Verify `chrome://credits` works offline. The presence check is only a floor; a copied placeholder credits file is not compliance.
5. **Blocker payload:** verify embedded Island resources and pinned blocker/filter payload digests, parser/rules versions, extension/provider payloads actually included, startup without a disk-assets folder, ordinary and private protection, and failure behavior. Reuse relevant source tests but add a fork packaged-payload extractor; Electron `app.asar` checks cannot inspect Chromium's paks. No Widevine/CDM or protected-playback claim; test the required explanatory EME notice and user-initiated current-page stable handoff without opening stable's profile from Beta.
6. **Outbound isolation:** re-run the macOS gate under `chromium/tests/outbound/` on the final candidate with approved firewall/test-user scope, controls/leak-probe and process attribution. Record intended beta appcast/GitHub update and production Sync traffic separately from blocked Google/background services. No allow-all, fake passing capture or production-contact bypass. Existing Android allowlists are not macOS evidence.
7. **Packaged native behavior:** verify all code/entitlements/notarization, Gatekeeper and native launch, passkeys, both profile roots untouched across coexistence, protocol/default-browser choice, privacy, notices, no test hooks or disk-assets override, and full N→N+1 Sparkle handoff per selected architecture.

`acceptance.json` contains `sourceCommit`, `inputDigest`, `build`, and `arches[arch]` with `candidate`, `dmgSHA256`, `gnArgsSHA256`, and `gates[name] = {status:"pass", evidenceSHA256:"<raw evidence bundle digest>"}`. Required names are exported as `GATES` in `chromium/release/manifest.mjs`. The operator must independently inspect the actual evidence; this file is an attestation index, not proof produced by tests. All evidence must bind the final signed DMG or document the signed/unsigned equivalence plus final packaged repeat. Never fill it from fixture data.

## 7. Asset set, manifest and immutable pre-release publication

The complete two-architecture set has 11 assets:

- Two `Blanc-Beta-2.0.0-beta.N-mac-<arm64|x64>.dmg` files and two `appcast-<arch>.xml` files.
- `release.json`, `acceptance.json`, `Blanc-Beta.cdx.json`, `NOTICES.txt`.
- `RELEASE-MANIFEST.json`, `SHA256SUMS`, `SHA256SUMS.sigstore.json`.

An architecture waiver removes its DMG/appcast pair, not integrity assets. No `latest*.yml`, `beta*.yml`, Electron ZIP, blockmap or stable-named installer is allowed. Store debug symbols privately, keyed by candidate/UUID, unless an expanded public asset schema is reviewed.

Generate a full CycloneDX SBOM from the actual pinned Chromium DEPS/build dependency graph, bundled native libraries/resources, canonical Blanc source, Sparkle and third-party payloads. Include versions, licences, hashes/provenance and component relationships. Electron's npm runtime SBOM is insufficient. The fork's adapter is `chromium/release/sbom_scan.py` plus `sbom.mjs` (see *SBOM, NOTICES.txt and the notices-and-credits gate* below); `manifest.mjs` itself still checks only the CycloneDX envelope, the Chromium/Sparkle floor and that the SBOM names this release's source commit and input digest. Audit the contents against the packaged dependency closure before setting the notices gate to pass.

In a new staging directory containing only the eight payloads, with the gate evidence bundles in a separate private directory as `<arch>/<gate>.evidence` (one file per gate named in `GATES`, each matching the digest recorded in `acceptance.json`):

```sh
node chromium/release/manifest.mjs build /private/release.json /private/assets /private/evidence
(cd /private/assets && shasum -a 256 -c SHA256SUMS)
```

The deterministic manifest lists name, size and digest of every payload; checksums cover those plus the manifest. `SHA256SUMS` cannot hash itself, and its Sigstore bundle authenticates it rather than forming a checksum cycle. Builder refuses existing/extra files, symlinks, mismatched gates, a missing or altered evidence bundle, malformed feeds and overwrites. `manifest.mjs verify` on a public download cannot see the evidence bundles and says so in its result. At this intermediate stage the complete verifier correctly refuses the absent Sigstore bundle.

Future publication sequence (the shell draft only prints this sequence): require clean tree and matching HEAD/inputs; require `op`, `gh`, `cosign`; check local tag plus successful `git ls-remote --tags` and authenticated GitHub release absence. Network/auth errors are **not** “not found.” Recheck immediately before creating a tag. Create immutable `chromium-beta-…` at the exact commit, push that one tag, and create a **draft with `--prerelease --latest=false`** in bnfy/blanc. This is future release work, not permission to push this setup branch. Do not dispatch Electron's native release workflow.

Download the staged draft afresh and compare bytes to the approved local artifacts. Validate exact payloads, build checksum metadata, then authenticate through the same fresh Safari/IPv4 loopback Sigstore flow as `scripts/release.sh`:

```sh
# FUTURE AUTHORIZED RELEASE ONLY; all values here are public trust pins.
PATH="$PWD/scripts/release-bin:$PATH" cosign sign-blob --yes \
  --oidc-redirect-url http://127.0.0.1:49197/auth/callback \
  --bundle /private/assets/SHA256SUMS.sigstore.json /private/assets/SHA256SUMS
cosign verify-blob --bundle /private/assets/SHA256SUMS.sigstore.json \
  --certificate-identity anthony@bnfy.me \
  --certificate-oidc-issuer https://github.com/login/oauth \
  /private/assets/SHA256SUMS
node chromium/release/manifest.mjs verify /private/release.json /private/assets
```

Pin identity/issuer independently to `docs/release-verification.md`, not values extracted from an untrusted bundle. Complete the fresh Safari page immediately, never in Blanc. Upload final metadata without clobbering assets. Only after every gate passes publish the same draft with `--prerelease --latest=false`. Archive previous feed bytes and promote only the matching architecture feeds **after** independent public-download checks pass. Stable's canonical changelog does not get a beta entry.

Why stable stays unaffected, with actual boundaries:

- `src/main/updater-policy.js::production()` sets `allowPrerelease:false`; `package.json` on this branch has stable `1.45.1` (the public Electron release is newer; any stable semver behaves the same). `src/main/updater.js::setupAutoUpdater()` only overrides that property for an explicit staging feed. Lockfile-installed `electron-updater/out/AppUpdater.js` initializes it from the running app semver (false for the shipping version).
- `electron-updater/out/providers/GitHubProvider.js::getLatestVersion()` uses `getLatestTagName()` → GitHub `/releases/latest` when prereleases are disabled, then fetches that tag's `latest-mac.yml`. GitHub's prerelease/non-latest flags keep the beta out of that stable endpoint. The beta tag is also not a valid stable semver; that is defense in depth, **not** the stable provider's principal filter.
- `scripts/generate-site-changelog.mjs::normalizeReleases()` filters `!draft && !prerelease && published_at`, writes `site/src/data/releases.json`, and `site/src/pages/changelog.astro` / `changelog.xml.js` consume it. It also refuses any `chromium-beta-*` tag whatever its flags, so one wrong flag cannot put a beta on the site. GitHub's `/releases/latest` has no such rule: publishing the beta as an ordinary release would still be a bug there, and policy rejects that input.
- `chromium/release/isolation.test.mjs` runs the actual lockfile-installed provider against an in-memory Atom feed with beta first and mocked GitHub `/latest`, asserts only stable metadata is requested, and runs the real site normalizer. It also tests that the site refuses the beta tag when the flag is wrong. This proves source behavior under GitHub's API contract, not an observed production endpoint; verify the real flags and `/latest` after publication.

## 8. Completion, recovery and rollback

Publication is not completion. From a fresh logged-out download directory: validate the exact asset set and manifest, all SHA-256 entries, pinned Sigstore identity/issuer, both appcasts' EdDSA signatures against DMGs, and immutable source/candidate metadata. Mount each public DMG read-only; run `verify.mjs`, Gatekeeper, native architecture launch, expected Developer ID/leaf and stapled app ticket checks. Qualify Apple Silicon and Intel on native hosts. Add a **fork-specific exact-tag hosted smoke workflow**; `.github/workflows/prerelease-smoke.yml` is Electron-specific and cannot count as fork evidence unchanged. Local Gatekeeper and hosted smoke complement each other.

Confirm GitHub still reports `prerelease:true` and non-latest; stable `/latest`, stable feed metadata and the canonical changelog still show Electron. Verify live beta feed bytes equal the signed release asset and contain the expected build. Keep public beta 1→beta 2 handoff pending until it actually starts inside beta 1, discovers the feed, downloads, installs and relaunches beta 2 on each architecture. Record evidence in a new beta incident file; do not update Electron baseline paragraphs, migration baseline, Bangs pin or releases.json as though this were an Electron release.

On takeover, reconcile foreground process, tag SHA, draft/public state, exact assets, notarization IDs and future native run. If public with a Sigstore bundle, do not authorize signing again. If tag/draft exists, never rerun the entire pipeline or overwrite a native asset. Resume only independently verified finalization against the same bytes; otherwise use a new version/build. Before tag creation a failed candidate may be repaired under a new ledger reservation as needed. Never delete evidence to free a name.

Rollback: withdraw/restore the beta feed atomically to the last verified feed to stop new uptake, retaining immutable releases and a dated incident. This does not downgrade already updated clients. Prefer a fix-forward build **greater** than every distributed build, even if based on older source. If a manual downgrade is necessary, quit Beta, back up only its isolated profile, assess schema compatibility and restore a matching beta backup; never open a newer profile with older Chromium blindly. Do not touch stable's app/profile/keys/default-browser choice. Do not overwrite a beta tag or point the beta feed to Electron. Key loss/compromise requires Sparkle's reviewed key-rotation path (do not rotate Developer ID and EdDSA trust simultaneously without a proven bridge), incident handling and a tested recovery build. Feed rollback alone cannot repair a compromised signing key.

## 9. Local tooling and remaining decisions

Safe phase-one validation:

```sh
npm ci
/usr/local/bin/node --test chromium/tools/*.test.mjs chromium/release/*.test.mjs
npm run lint
bash scripts/release-chromium-beta.sh --plan
```

`npm ci` runs the existing pinned blocker preparation hook; no native compilation is requested. The lint script covers existing first-party desktop/Worker JavaScript; new release `.mjs` logic is exercised by the explicit Node suite. The draft exits 78 for **every invocation except exactly `--plan`**, independent of environment, so it cannot contact services or build accidentally.

Future local-input file (kept private, paths never in public release.json). `profile` is the absolute path of the committed `chromium/release/blanc-beta.provisionprofile` in the release checkout, and `profileSHA256` in release.json is that file's digest:

```json
{
  "profile": "/absolute/path/to/checkout/chromium/release/blanc-beta.provisionprofile",
  "sparkleArchive": "/private/beta/Sparkle-2.10.1.tar.xz",
  "gnArgs": {"arm64": "/private/beta/arm64-args.gn", "x64": "/private/beta/x64-args.gn"}
}
```

`node chromium/release/preflight.mjs RELEASE.json LOCAL-INPUTS.json` checks clean HEAD (no ignored files in the input directories either), local tag absence, the build ledger, dedicated beta branding, input hashes/reconstruction, literal safety args, Sparkle/profile bytes, local signer and decoded profile. It does not contact GitHub/Apple/1Password or prove remote version uniqueness. Remote tag/draft checks, effective GN environment, trusted ledger, source review and acceptance remain separate hard gates in the future operator sequence. Successful preflight is not release authorization.

Remaining owner operations, in exact order, are in §10. The current stop is the
explicit F/G hold, plus the locked display for final desktop regressions. Identity,
version format, macOS 13, blanc.day feeds, Sparkle 2.10.1 and Apple Silicon scope
are approved decisions. No new identity decision is requested. Production key
custody, signing/service access and finished-release publication still need the
owner's separate authorization.

Unverified / cannot be proven without the later work:

- Full literal prototype/release GN files and effective defaults, compiler/SDK/PGO availability, official rebuild cost, both machine outputs and candidate hashes.
- Native Sparkle framework/ID/rpath inventory after packaging, EdDSA key custody/recovery, real feed serving/caching and updater callbacks/sandbox behavior.
- Certificate/private-key access and expiry, AMFI/WebAuthn/TCC behavior, real DER parsing/code signature/notarization/stapling/Gatekeeper and native DMG launch.
- Runtime profile/keychain/OS registration isolation, explicit override rejection, actual no-CDM payload, no protected playback, no hook/disk-asset release bypass.
- Exact-official-candidate acceptance, local Sync harness compatibility, production real-device Sync, packaged blocker/credits/full SBOM and outbound isolation.
- Both N→N+1 private handoffs and the eventual public handoff, hosted smoke and post-publication stable/latest/changelog isolation.

Source URLs and SHA-256 hashes for the public source reads, including all referenced signing/branding/version files, are in `chromium/release/sources.json`. Failed guessed entitlement/tweak paths were resolved to the actual pinned paths above; the archive/generated signing config and built distributions remain unread/unverified. No local Chromium checkout was assumed. See `chromium/release/PATCH-PLAN.md` for implemented identity changes, later stages and current patch counts.


## Implemented identity patch (2026-11-10)

Patch 0046 selects dedicated beta BRANDING through `branding_file_path`, adds
beta-only outer plist metadata and the main-only WebAuthn entitlement template,
isolates Safe Storage, and validates both command-line and policy-resolved data
roots before profile creation. Existing and missing paths are checked through
resolved ancestors; aliases into stable/preview profiles, traversal, invalid
profile directory components and unattended import switches are refused. The
native pure path guard is compiled and exercised against temporary fixture
folders, including symlinks, without opening the owner's Electron profile.
This is not a hostile-same-user filesystem race boundary; OS user isolation
remains responsible for an attacker who can replace directories during launch.

`blanc_channel="beta"`, `blanc_beta_version="2.0.0-beta.N"` and the monotonic
`blanc_beta_build` are explicit release inputs. Preview remains the default;
its hooks and disk assets retain their original predicates. No Widevine or
Chromium updater is permitted in beta. The existing Sunrise app assets are
retained (the gold Sunrise ICNS was inspected). Helpers derive from beta's
branding and keep Chromium framework/helper versions. Signing/profile embedding
and OS/runtime isolation still require the separately approved beta artifact.


## Implemented updater patch and remaining qualification (2026-11-10)

Patch 0047 and `blanc/browser/mac/beta_updater.mm` supply the beta-only native
menu and Settings About actions, main-thread ownership and termination hook.
The preview channel has no updater owner, framework, feed or key. The feed is
fixed by native code; the bridge accepts no feed/key/install command. Full
archives only, increasing build numbers and exact beta artifact URLs are
required. Root-host execution and release-notes downloads are refused.

Stage an independently reviewed local archive with:

```
python3 chromium/release/stage-sparkle.py --help
```

The staging tool performs no download or signing, refuses reuse of its
hash-named directory, validates safe symlinks and the complete file inventory,
and records the source archive hash. Set `blanc_sparkle_stage` to that immutable
absolute directory, `blanc_sparkle_archive_sha256` to its reviewed archive hash,
and `blanc_sparkle_public_key` to the owner-supplied public key. Set
`blanc_blocker_bundle` to the absolute folder holding the blocker's `engine.js`
(made by `experiments/chromium-extension-spike/native/blocker/bundle.mjs`): the
beta embeds it as `Contents/Resources/blanc_blocker/engine.js`, and the build
(`services/blocker/verify_bundle.py`), preflight, `verify.mjs` and the browser
each refuse any bytes but the hash pinned in `services/blocker/bundle_hash.h`.
These are beta build arguments; leave preview's args.gn alone. The public key is passed to the
metadata generator in a generated JSON input, not command-line output. No
private key is generated, stored or passed by this integration.

The loopback appcast test proves HTTP discovery, monotonic version selection,
Ed25519 verification and rejection of changed bytes using a published RFC 8032
public test vector. Its one-byte artifact is not a DMG, and it is not a native
Sparkle N-to-N+1 handoff. Real framework linking, rpaths, native discovery and
validation, user consent, session/Sync flush, signed install/relaunch,
Gatekeeper, profile/passkey continuity and both helper signatures remain owed.
The owner-approved dedicated beta output uses the reviewed configuration in
section 2. Prototype arguments remain untouched.

The owner approved upgrading the old 2.8.0 pin to the newest stable 2.x.
The selected 2.10.1 archive and all published post-2.8.0 advisories are reviewed
in [the dated security record](../chromium/release/sparkle-review-2026-11-10.md).
Disabling deltas alone did not address the later installer races; their upstream
fixes are included in this pin. Native installation and distribution still need
the separate artifact-bound gates above.


## 10. Operator handoff — ordered commands, none executed here

**Start only after the owner lifts the F/G hold.** First unlock the display and
finish D's owed runs on the prototype. Preserve `out/BlancPrototype`, its args,
cache and toolchain. Build 1 is reserved in `ledger.json`; the premature beta.1
cold attempt failed at ANGLE's missing optional Metal Toolchain after 6.42 seconds,
781 actions. No app exists. Its private EdDSA seed was deleted after the hold was
noticed. Do not resume that output using a nonexistent key or publish its local
configuration. Review the missing Metal input before another build; downloading
Apple's component is not authorized. ANGLE has a runtime source-shader path but
no stock GN argument to select it on this host; no fallback patch was applied.
The partial output and failure evidence remain available.

Use a fresh unused beta sequence/build for each distinct candidate, including
private N and N+1; `2.0.0-beta.1` is not available for new public bytes. Every
release descriptor must use real hashes and candidate IDs, never the fixture.
Apple Silicon only is approved; keep the explicit Intel waiver in the ledger,
release descriptor and evidence. Production builds set
`blanc_beta_local_qualification=false`; local qualification images are refused
by production preflight, signing and verification.

The following commands are future operator instructions, not authorization to
run them now. Run in a visible native Terminal from the release checkout. Set
`BETA_WORK` to a new private directory, `BETA_SPARKLE` to the verified extracted
2.10.1 archive (including its `bin/` tools), and `BETA_UNSIGNED` to the qualified
production-configured app. These are paths, not secrets. Put the final reviewed
`release.json` and `local-inputs.json` there before step 3. Keep temporary files
outside Git and shared evidence. Shell variables below are task-specific.

### 1. Dedicated production EdDSA key and recovery custody

After explicit key/1Password authorization, use the pinned Sparkle tool's
separate account, never the default account or Electron's updater identity:

```sh
set -eu
umask 077
BETA_WORK=$(mktemp -d /private/tmp/blanc-beta-operator.XXXXXX)
# Set BETA_SPARKLE to the reviewed extracted Sparkle 2.10.1 directory.
OP_BIOMETRIC_UNLOCK_ENABLED=true op signin
"$BETA_SPARKLE/bin/generate_keys" --account me.bnfy.blanc.beta > "$BETA_WORK/key-ceremony.txt" 2>&1
"$BETA_SPARKLE/bin/generate_keys" --account me.bnfy.blanc.beta -p > "$BETA_WORK/public-key.txt"
"$BETA_SPARKLE/bin/generate_keys" --account me.bnfy.blanc.beta -x "$BETA_WORK/private-seed.txt" > "$BETA_WORK/key-export.txt" 2>&1
op document create "$BETA_WORK/private-seed.txt" --vault Dev \
  --title 'Blanc Chromium Beta Sparkle Signing' > "$BETA_WORK/key-document.json"
op document get 'Blanc Chromium Beta Sparkle Signing' --vault Dev \
  --output "$BETA_WORK/recovered-seed.txt"
cmp "$BETA_WORK/private-seed.txt" "$BETA_WORK/recovered-seed.txt"
rm "$BETA_WORK/private-seed.txt" "$BETA_WORK/recovered-seed.txt"
```

**Split ceremony (2026-11-14):** when 1Password is unusable, the owner may run
the Keychain half alone (`~/Projects/Blanc/scripts/sparkle-key-make.command`:
the key in Keychain, the public key saved, a `BACKUP-PENDING` marker) and the
1Password half later (`sparkle-key-backup.command`: export, store, read back,
compare, delete, marker removed). `release.mjs` refuses `draft` and `publish`
while the marker exists, so nothing ships with the key on one Mac only.

If the dedicated Keychain account or 1Password title already exists, inspect and
recover it privately instead of generating a replacement or creating duplicates.
Cancel any manual account-setup prompt. Record custody/recovery success only;
do not capture key bytes or ceremony files. Populate the production GN/public
trust pin from the public-key file through a private structured input workflow.
Rebuild under the guarded procedure after the hold is lifted. Public key bytes
are trust metadata, but neither key file nor private ceremony output belongs in
this queue's evidence. Production private material stays in Keychain and the
restricted Dev recovery item. This task did not perform this ceremony.

### 2. Build and qualify the real production configuration

Complete F/G after explicit resumption, resolve the Metal prerequisite without
silently changing toolchains, review fresh effective GN/environment and the dry
plan, reserve unused N/N+1 numbers, and use only `chromium/tools/build.mjs`.
The already approved identity is Blanc Beta / `me.bnfy.blanc.beta` /
`blanc-beta`, macOS 13, `2.0.0-beta.N`, no Widevine, arm64. Retain phase-0 PGO
fallback only with its recorded review. Run exact-candidate acceptance and local
Sync proof with no production contact; G's local loopback image is separate from
the eventual production-configured signing input. All §6 gates need actual
artifact-bound evidence, including credits/SBOM and compiled-out test hooks.
No command that fabricates fixture IDs or pass records is provided.

### 3. Preflight and Developer ID signing of a new copy

After separate signing authorization and review of the operator tool:

```sh
/usr/local/bin/node chromium/release/preflight.mjs \
  "$BETA_WORK/release.json" "$BETA_WORK/local-inputs.json"
/usr/local/bin/node chromium/release/operator.mjs sign-app \
  "$BETA_WORK/release.json" arm64 "$BETA_UNSIGNED" \
  "$BETA_WORK/signed/Blanc Beta.app" chromium/release/blanc-beta.provisionprofile
```

This uses **55283A84D3706D5A22386D5F002A0CD4845ECFD4**, team **XYGUCY4498**, for
all native parts and explicitly assigns Sparkle Autoupdate its reviewed identity.
Never substitute a certificate or relax a profile/entitlement failure. Rotate
certificate and profile together before the certificate's 2027-02-01 expiry.
The tool copies the committed profile into the outer app only. Its success
means signed-copy creation, not notarization or release qualification.

### 4. Notarize the app through op run, then staple

After explicit Apple/notarization authorization, retain the same Terminal:

```sh
/usr/bin/ditto -c -k --keepParent "$BETA_WORK/signed/Blanc Beta.app" "$BETA_WORK/Blanc-Beta-notary.zip"
OP_BIOMETRIC_UNLOCK_ENABLED=true op run --env-file=.env.1password --no-masking -- \
  /usr/local/bin/node chromium/release/operator.mjs notarize "$BETA_WORK/Blanc-Beta-notary.zip"
/usr/bin/xcrun stapler staple "$BETA_WORK/signed/Blanc Beta.app"
/usr/bin/xcrun stapler validate "$BETA_WORK/signed/Blanc Beta.app"
```

The helper waits for **Accepted** and fails closed. Do not continue after a
failed submission, dump raw diagnostics to shared logs, or rerun signing over
the same output. Investigate privately and preserve the receipt and candidate.

### 5. Package, sign/notarize/staple the DMG, verify the real artifact

```sh
BETA_VERSION=$(/usr/local/bin/node -p 'JSON.parse(require("fs").readFileSync(process.argv[1])).version' "$BETA_WORK/release.json")
BETA_DMG="$BETA_WORK/Blanc-Beta-$BETA_VERSION-mac-arm64.dmg"
mkdir "$BETA_WORK/dmg-root"
/usr/bin/ditto "$BETA_WORK/signed/Blanc Beta.app" "$BETA_WORK/dmg-root/Blanc Beta.app"
ln -s /Applications "$BETA_WORK/dmg-root/Applications"
/usr/bin/hdiutil create -fs HFS+ -format UDZO -volname 'Blanc Beta' \
  -srcfolder "$BETA_WORK/dmg-root" "$BETA_DMG"
/usr/local/bin/node chromium/release/operator.mjs sign-dmg "$BETA_WORK/release.json" arm64 "$BETA_DMG"
OP_BIOMETRIC_UNLOCK_ENABLED=true op run --env-file=.env.1password --no-masking -- \
  /usr/local/bin/node chromium/release/operator.mjs notarize "$BETA_DMG"
/usr/bin/xcrun stapler staple "$BETA_DMG"
/usr/bin/xcrun stapler validate "$BETA_DMG"
/usr/local/bin/node chromium/release/verify.mjs "$BETA_WORK/release.json" arm64 "$BETA_DMG"
/usr/sbin/spctl --assess --type execute --verbose "$BETA_WORK/signed/Blanc Beta.app"
```

Also assess the app from a fresh read-only mount/download as §8 requires. Audit
visual DMG layout and native launch. `verify.mjs` checks every reviewed native
part and both tickets; it does not prove acceptance or Gatekeeper. Hash and sign
only the final stapled DMG, and never mutate those bytes afterward.

### 6. Signed N → N+1 updater qualification

Repeat steps 2–5 for the next reserved build, retaining N and its isolated Beta
profile. Use the dedicated Keychain account to sign the final N+1 archive:

```sh
"$BETA_SPARKLE/bin/sign_update" --account me.bnfy.blanc.beta -p "$BETA_DMG" > "$BETA_WORK/ed-signature.txt"
```

The pinned tool's `-p` writes only the archive signature. Stage the archive and
generate/validate the canonical production feed. Keep `assets/` free of private
inputs:

```sh
mkdir -p "$BETA_WORK/assets"
cp -n "$BETA_DMG" "$BETA_WORK/assets/"
/usr/local/bin/node chromium/release/appcast.mjs generate "$BETA_WORK/release.json" arm64 \
  "$BETA_WORK/assets" "$BETA_WORK/ed-signature.txt" "$BETA_WORK/assets/appcast-arm64.xml"
/usr/local/bin/node chromium/release/appcast.mjs validate "$BETA_WORK/release.json" arm64 \
  "$BETA_WORK/assets" "$BETA_WORK/ed-signature.txt" "$BETA_WORK/assets/appcast-arm64.xml"
open -a '/Applications/Blanc Beta.app'
```

Staging the signed DMG/feed requires separately approved hosting operations.
Production binaries accept only the pinned blanc.day feed and canonical GitHub
asset URLs; do not add a runtime override to make a private test convenient.
Start **inside installed N**, choose Check for Updates, discover N+1, download,
install and relaunch through Sparkle. Record exact N/N+1 hashes, application
replacement, build advancement, profile/Sync/passkey continuity and rejection
of wrong-key/tampered/older/wrong-identity/wrong-architecture updates. Test failure,
offline/retry and read-only-DMG paths. Do not substitute a direct installer
launch. Sparkle's normal installer can invoke Apple assessment; that is another
reason the held local attempt cannot proceed under this queue's no-Apple rule.

### 7. Production Sync with the owner's real iPhone

After explicit service/account/device approval, launch the final production-
configured Beta using the command above. Turn on Sync in Settings, pair the real
iPhone through the normal UI, and perform §6's consent, bidirectional edits,
Shared Spaces, relaunch, offline merge, disconnect and private-data exclusions.
No CLI can substitute for this device interaction. Keep pairing codes, tokens,
keys, URLs and profile contents out of screenshots/logs; record sanitized gate
results bound to the signed candidate. Local Worker results do not pass this gate.

### 8. Publish only after final owner approval and all gates

Complete and review the actual SBOM, notices, release notes, evidence and asset
set (§7); the arm64 waiver yields **nine** assets. Check remote tag/draft absence
with authenticated network access, treating all network/auth failures as blockers.
The following irreversible commands are future owner-authorized operations only:

```sh
BETA_TAG=$(/usr/local/bin/node -p 'JSON.parse(require("fs").readFileSync(process.argv[1])).tag' "$BETA_WORK/release.json")
BETA_COMMIT=$(/usr/local/bin/node -p 'JSON.parse(require("fs").readFileSync(process.argv[1])).sourceCommit' "$BETA_WORK/release.json")
git ls-remote --tags origin "refs/tags/$BETA_TAG"
gh release view "$BETA_TAG" --repo bnfy/blanc
# Continue only after positively establishing absence; an auth/network error is not absence.
/usr/local/bin/node chromium/release/manifest.mjs build "$BETA_WORK/release.json" "$BETA_WORK/assets" "$BETA_WORK/evidence"
git tag "$BETA_TAG" "$BETA_COMMIT"
git push origin "refs/tags/$BETA_TAG"
gh release create "$BETA_TAG" --repo bnfy/blanc --verify-tag --draft --prerelease --latest=false \
  --title "Blanc Beta $BETA_VERSION" --notes-file "$BETA_WORK/release-notes.md" "$BETA_WORK/assets/"*
```

Complete §7's fresh Safari Sigstore flow, validate the draft download against
local bytes and upload only the previously absent signature asset (no clobber):

```sh
gh release upload "$BETA_TAG" "$BETA_WORK/assets/SHA256SUMS.sigstore.json" --repo bnfy/blanc
/usr/local/bin/node chromium/release/manifest.mjs verify "$BETA_WORK/release.json" "$BETA_WORK/assets"
gh release edit "$BETA_TAG" --repo bnfy/blanc --draft=false --prerelease --latest=false
```

Then perform independent logged-out download/digest/manifest/Sigstore/native
verification and the fork-specific hosted smoke before promoting feed bytes.
Deliver the approved `site/public/updates/chromium-beta/arm64.xml` and reviewed
RSS/cache headers through a normal website PR; after merge, use
`npm run site:deploy` from that exact clean main commit, verify Cloudflare's
Production SHA and canonical feed bytes. Do not publish a route with unreviewed
headers or call the undeployed route a working feed. Leave Intel absent under
the waiver. Verify stable latest/feed/changelog remain Electron, preserve all
immutable assets, and record the future public N→N+1 handoff separately.

The guarded `scripts/release-chromium-beta.sh` remains plan-only. The commands
above deliberately do not turn it into an unqualified automated release path.

### Staged operator: `chromium/release/release.mjs` (2026-11-13)

The owner asked for the build, signing and publish stages to be written, and
chose **2.0.0-beta.2** (build 2) for the first public beta; `ledger.json`
keeps beta.1 reserved for the private local-qualification build, and the
Intel waiver moves with the first beta to beta.2. `release.mjs` runs the
§10 commands above as named stages, one per invocation, from a foreground
Terminal:

```sh
node chromium/release/release.mjs status "$BETA_WORK"
node chromium/release/release.mjs preflight "$BETA_WORK"      # §10.3, preflight.mjs
node chromium/release/release.mjs sign "$BETA_WORK"           # §10.3, operator.mjs signApp
OP_BIOMETRIC_UNLOCK_ENABLED=true op run --env-file=.env.1password --no-masking -- \
  node chromium/release/release.mjs notarize-app "$BETA_WORK" # §10.4: zip, notarize, staple
node chromium/release/release.mjs dmg "$BETA_WORK"            # §10.5: hdiutil, sign the DMG
OP_BIOMETRIC_UNLOCK_ENABLED=true op run --env-file=.env.1password --no-masking -- \
  node chromium/release/release.mjs notarize-dmg "$BETA_WORK" # §10.5: notarize, staple, verify.mjs, spctl
node chromium/release/release.mjs sparkle "$BETA_WORK"        # §10.6: sign_update -p, appcast
node chromium/release/gate-evidence.mjs plan  "$BETA_WORK" SOURCES.json  # every gate ready?
node chromium/release/gate-evidence.mjs write "$BETA_WORK" SOURCES.json  # evidence/ + payloads/acceptance.json
node chromium/release/release.mjs manifest "$BETA_WORK"       # §7: payloads, evidence, manifest
node chromium/release/release.mjs draft "$BETA_WORK"          # §10.8: absence, typed OK, tag, draft, re-download
node chromium/release/release.mjs sigstore "$BETA_WORK"       # §7: Safari Sigstore, verify, upload bundle
node chromium/release/release.mjs publish "$BETA_WORK"        # typed OK; pre-release, not latest
node chromium/release/release.mjs verify-public "$BETA_WORK"  # §8: logged-out download, all checks
```

`$BETA_WORK` is an owner-only folder outside Git holding `release.json`,
`local-inputs.json` (preflight's inputs plus `unsigned: {arm64: <built app>}`
and `sparkle: <extracted pinned Sparkle>`), and before `manifest`,
`payloads/` (`acceptance.json`, `Blanc-Beta.cdx.json`, `NOTICES.txt`,
`release-notes.md`) and `evidence/<arch>/<gate>.evidence`. `gate-evidence.mjs`
writes the last two from `SOURCES.json` (per architecture and gate: the
evidence files and, where the owner decided one, the `basis` that lets them
count). Each bundle embeds its sources with their digests and the final DMG's
digest; a JSON source must report a pass, a gate the descriptor waives is
written `waived` with the owner's reason, and nothing is overwritten. Each stage checks
the one before it and records what it made in `state.json`, bound to the
digest of `release.json`. From `draft` on, nothing earlier can run again and no
stage reruns: fix forward with a new ledger build. Absence of the tag and of
every release, drafts included, must be answered by Git and GitHub; an error
is not absence. `draft` and `publish` require typing a confirmation phrase.
`publish` checks GitHub shows a published pre-release and that `/latest` is
still an Electron release. Feed promotion stays the reviewed website PR.

Still owed before the first public run: the production key ceremony (§10.1)
and the production-argument build at beta.2 (§10.2); the gate adapters that
produce real `acceptance.json` evidence on an official image (§6: acceptance
harness, desktop Sync on the official artifact, packaged blocker extractor, outbound isolation, native checks, signed N→N+1);
the fork's hosted smoke workflow and the blanc.day feed routes (§8). Tests:
`chromium/release/release-stages.test.mjs` (ordering, no rerun, absence,
unconfirmed draft and publish, `/latest`), with a fake runner throughout.

### SBOM, NOTICES.txt and the notices-and-credits gate (2026-11-13)

Three steps per candidate, all read-only on the build folder and offline:

1. `python3 chromium/release/sbom_scan.py --src SRC --out-dir out/<dir> SCAN.json`
   runs Chromium's own `tools/licenses/licenses.py` discovery (the one
   `chrome://credits` is generated from) for `//chrome:chrome` with
   `shipped_only`, adds each component's version, revision and CPE, hashes
   every licence text, and records every folder the tool skipped. `gn desc`
   runs on a temporary copy of `args.gn`, never in the build folder. Run it
   with depot_tools on `PATH` and `DEVELOPER_DIR` set, as for builds.
2. `node chromium/release/sbom.mjs build RELEASE.json SCAN.json SRC OUT_DIR`
   writes `Blanc-Beta.cdx.json` (CycloneDX 1.6, deterministic: Blanc Beta as
   the subject with its source commit and input digest, Chromium, Sparkle with
   its archive digest, the Blanc interface assets and every Chromium
   component, with licences, licence-text digests and the dependency tree) and
   `NOTICES.txt` (every component with its licence, each distinct licence text
   once). It refuses a licence text that changed since the scan, an Island
   asset that isn't the pinned or reviewed file, and any skipped folder not
   reviewed in `chromium/release/sbom-extra.json`. That file is the reviewed
   list of what Chromium's metadata doesn't cover: the Island's fonts, Kagi
   bangs and Lucide icons; four components in folders `licenses.py` skips
   (upstream Chrome's credits skip them too); and what the beta deliberately
   doesn't bundle. Put both outputs in the work folder's `payloads/`.
3. `node chromium/release/sbom.mjs audit RELEASE.json SCAN.json SRC APP SBOM EVIDENCE`
   checks the packaged app and writes the evidence file whatever the result
   (copy it to `evidence/<arch>/notices-and-credits.evidence` only on a pass):
   every file in `Contents/Resources/notices` present and equal to its
   reviewed source, `Chromium-credits.html` naming every shipped component,
   the SBOM rebuilt byte for byte, `THIRD_PARTY_NOTICES.txt` naming every
   Blanc asset and none of the Electron app's components, and the app's
   `CFBundleVersion` equal to the release build.

The first run (2026-11-13) found two gaps, both fixed the same day: the
packaged `THIRD_PARTY_NOTICES.txt` was the Electron app's notice, and desktop
builds loaded the blocker only from `--blanc-blocker-assets`, so a beta opened
from Finder blocked nothing. The beta now embeds the pinned engine (see the
`blanc_blocker_bundle` argument above), and its notice is generated by
`chromium/release/fork-notice.mjs` from compliance/policy.json, sbom-extra.json
and `chromium/blanc/third_party/blocker/bundle.json` (the engine bundle's
provenance and licence texts), with full licence texts; `--check` fails when
it is stale. The SBOM lists the engine bundle and what it was built from.

Chromium's credits page is a folder walk, and DevTools' list of its credited
folders (`additional_readme_paths.json`) leaves out `@vscode/web-custom-data`,
which ships; upstream Chrome's credits omit it too. DevTools is a separate
checkout the fork's patches don't cover, so `sbom-extra.json`
`creditsAdditions` credits it in the beta's notice with its committed licence
text, which must equal the tree's; the audit accepts a component missing from
the credits page only on that list. On the rebuilt local-qualification beta
(2026-11-13) the audit passed, the embedded engine blocked two EasyList hosts
that the preview build without the blocker let through (loopback only), and
the Aperitif helpers link exactly Chromium's libraries.
Tests: `chromium/release/sbom.test.mjs`.

### Blocker payload evidence (2026-11-14)

`node chromium/release/blocker-evidence.mjs RELEASE.json APP EVIDENCE` writes
the `blocker-payload` gate evidence (copy it to
`evidence/<arch>/blocker-payload.evidence` only on a pass). Static: the
embedded `blanc_blocker/engine.js` is the pinned bundle, its committed
provenance matches the pinned filter lists, the probe hosts are on the pinned
EasyList, and the app is the release build. Runtime, with no development
switch and loopback only (every other host resolves to nothing): an ordinary
and a private window each load a page whose allowed image arrives and whose
two EasyList-listed requests never do. A page cookie proves which window ran:
an ordinary window must save it to the profile, a private one must not, so
both wait 35 seconds for Chromium's cookie commit. Two APFS clones of the app,
one with a byte of the engine changed and one with none, must let nothing
past the page through. Clones need an ad-hoc signed candidate (a changed
resource can't be tested inside a sealed, signed app), so on the final
signed build run it on the unsigned candidate that produced it and record the
equivalence. On the local-qualification beta (2026-11-14) all four scenarios
passed. Not covered here: the Island resources and the EME notice and stable
handoff (`no-drm-handoff`). Tests: `chromium/release/blocker-evidence.test.mjs`.

### Outbound isolation of the packaged beta (2026-11-14)

The S1.1 harness (`chromium/tests/outbound/`) drives the prototype through
test hooks, a recording proxy and `--disable-background-networking`, so it
can't show what a beta contacts on its own. The beta variant runs the app as
a person does: `setup.sh --refresh --beta APP CONFIG` copies the beta to
`/Users/Shared/blanc-outbound/beta`; `sudo root.sh start` loads the owner-
approved pf anchor (2026-10-31: every packet the `blanc-test` user sends off
the Mac is dropped and logged); in the `blanc-test` session,
`Run beta outbound check.command` (`beta-user.sh`) runs the negative controls,
then `beta-scenarios.mjs` (startup and three minutes idle on a loopback page,
a relaunch, a private window, about six minutes, each with Chromium's
`--log-net-log`), then the controls again; `sudo root.sh stop`; then
`node chromium/tests/outbound/analyze-beta.mjs /Users/Shared/blanc-outbound/results/beta-<UTC time>` (the test user can write only in `results/`).
The run is valid only if every control reaches the pf log and every network
log names the page's unresolvable probe host; it passes only if no blocked
packet could have come from a Blanc process and no network log names an
outside host. For a local-qualification beta nothing outside is intended
(its feed is on loopback, a fresh profile has no Sync); a production run
names its feed and release hosts with `--allow`. The network log covers
Chromium's own requests; Sparkle and macOS frameworks are covered by the pf
log alone. An offline dry run as the owner (2026-11-14, every host resolving
to nothing) showed only localhost and the probe in all three logs. Chromium
resolves names itself, so the probe also appears as DNS queries the pf block
drops; analyze-beta.mjs reads each query's name and counts the probe's as the
probe. The first real run on the local-qualification beta (2026-11-14, run
`beta-20261114T013208Z`) passed: all 20 controls in the pf log (the IPv6 one
has no route on this Mac), no blocked packet a Blanc process could have sent
beyond 14 probe lookups, and only localhost and the probe in the three network
logs; the account's own services (Apple, Creative Cloud, OneDrive) were
blocked and recorded as background. Evidence stays local, in
`evidence/foundation/outbound-beta-20261114.json`. Run the beta-root.sh
wrapper from Terminal.app, not an app's terminal panel: an app restart there
killed the pf logger once.
Tests: `chromium/tests/outbound-beta.test.mjs`.

### No test hooks and profile separation (2026-11-14)

`node chromium/release/hooks-evidence.mjs RELEASE.json APP EVIDENCE` writes
the `official-hooks-absent` evidence: no Mach-O file in the app carries the
name of a test or research switch as a C string (the prototype, which keeps
its hooks, shows seven), and the beta launched with every one of them, its
disk-assets and test data home pointed at a loopback collector, opens its
page while the collector hears nothing and the data home stays empty. The
first audit found four reads of `--blanc-test` outside the test-hooks build
flag (first-run state, reported version and data home in `first_run.inc`,
the telemetry collector in `telemetry.inc`, a Sync test call in
`desktop_sync_service.cc`); they now go through `blanc::BlancTestLaunch()`
(`chromium/blanc/common/test_launch.h`), always false where hooks are
compiled out. The hash-pinned `--blanc-blocker-assets` and
`--blanc-sync-assets` overrides are not hooks.

`node chromium/release/profile-evidence.mjs RELEASE.json APP EVIDENCE` writes
the `profile-coexistence` evidence. Every launch gets a throwaway `HOME`
(and `CFFIXED_USER_HOME`) seeded with decoys of the reserved folders: the
Electron app's (`Blanc`, `Bowser`, `me.bnfy.bowser`), the release fork's
(`Blanc Browser`) and the preview's (`Blanc Chromium Preview`), under both
Application Support and Caches. A default launch must create its profile
under `Blanc Beta` and nothing else named for Blanc or Chromium; pointed at a
decoy (directly, through a symlink, as a cache folder), at `--profile-directory=..`
or asked to import, the beta must quit before opening its page; every decoy
must stay byte for byte as it was, and the owner's real `Blanc Beta` folder
unchanged. Both passed on the local-qualification beta (2026-11-14; evidence
in `evidence/foundation/`). Tests: `chromium/release/hooks-profile-evidence.test.mjs`.

### Local Sparkle update proof (2026-11-14)

`local-update-proof.mjs` ran on two local-qualification builds made from
the same tree with only `blanc_beta_version`, `blanc_beta_build` and the
throwaway `blanc_sparkle_public_key` changed (each a guarded re-pin of the
args hash, a few build steps, saved under `artifacts/local-update/`; the
beta's args are back at beta.1 afterwards). Each feed starts from a fresh
stage: `good` installed build 2 at quit; `wrong-key` (signed by another
key) and `tampered` (a byte changed after signing) were downloaded and
refused, leaving build 1. Keep the throwaway key out of `/tmp`: the first
one was lost in a restart. It now lives in `records/local-update-key`
(owner-only, outside Git). Evidence: `evidence/foundation/sparkle-local-update-20261114.json`.

### Desktop Sync on the local beta (2026-11-14)

`node chromium/tests/beta-sync.mjs APP EVIDENCE.json` runs the beta's own
Sync with no test hooks: the local-qualification build's fixed endpoint
(`127.0.0.1:49261`) is relayed to the local Worker, and the check drives
only Settings → Sync's controls over Chromium's standard remote-debugging
connection (throwaway `HOME`, mock keychain, every other host resolving to
nothing). It turns Sync on with the embedded runner, pairs an independent
peer running the iPhone's bundle with the code the beta shows, and, with
Settings' tab-sharing switch on, the peer lists the beta with its open page.
It passed on 2026-11-14 (82 Worker requests, all loopback). Favorites, tabs,
Spaces, recovery and profiles stay with `desktop-sync.mjs` on the prototype,
whose hooks the beta compiles out; production Sync with a real iPhone is the
owner's.

### Hosted smoke workflow (2026-11-14)

`.github/workflows/chromium-beta-smoke.yml` is the fork's exact-tag hosted
smoke (§8), run by hand after publication with
`gh workflow run chromium-beta-smoke.yml -f tag=chromium-beta-2.0.0-beta.N`
(add `-f check_feed=true` after feed promotion). It checks out the release's
own tag on a GitHub-hosted Apple Silicon Mac and runs
`chromium/release/public-smoke.mjs`: every public asset downloaded logged
out; the exact asset set, manifest, checksums and appcast signatures
(`manifest.mjs`); GitHub showing a published pre-release that isn't latest,
with a stable `vX.Y.Z` still latest; the DMG through `verify.mjs`; and the
app, copied off the read-only image, launching and opening a loopback page.
With `check_feed`, blanc.day's live feed must equal the release appcast.
Sigstore's pinned identity stays with `release.mjs verify-public` on the
owner's Mac, where cosign is installed. GitHub only dispatches a workflow
that exists on `main`, so it becomes runnable once `chromium/next` reaches
`main`. Tests: `chromium/release/public-smoke.test.mjs`; the launch step was
tried on a local image of the local-qualification beta.

### Blanc Beta 2.0.0-beta.2: the first public beta (2026-11-14)

Published as a GitHub pre-release, not latest:
<https://github.com/bnfy/blanc/releases/tag/chromium-beta-2.0.0-beta.2>, tag at
`058277389`, candidate `macos-176939e3a1706e6f`, DMG SHA-256
`d155c31638b7a7c7d849269cae75be81977f4b8293d1bcbcad00493c6d382e62`, nine assets.
Every `release.mjs` stage ran from the owner's Terminal through one-command
wrappers in `~/Projects/Blanc/scripts/` (`beta2-sign`, `beta2-notarize`, which
takes the two Apple values by hidden input instead of `op run` because
1Password won't stay unlocked on the Mac Studio, `beta2-sparkle`,
`beta2-draft`, `beta2-publish`). The update key's 1Password copy was made on
the MacBook Pro (`sparkle-key-airdrop.command`: export, proven against the
production public key, AirDropped, saved, both copies deleted). The release's
gate evidence was assembled by `gate-evidence.mjs`: 11 passed (acceptance by
equivalence, desktop Sync, notices and credits, blocker, outbound, profile,
Touch ID passkeys on the notarized app, test hooks absent, the local update
proof, native signature, Gatekeeper) and 2 waived (no-drm-handoff,
production-sync-real-device). Known issue for beta.3: after a relaunch the
vertical tab rail can reopen at its narrow-window cap (intermittent,
`vertical-tabs.feature:58`). Sigstore's first attempt hung because cosign ran
without a terminal; `release.mjs` now gives it one. After publication the website PRs shipped the feed, the Download page tile
and `/dl/beta` (#1511, #1512; blanc-ping version `62dc6a5a`), and the hosted
smoke check passed all six checks (run 43561295021, `check_feed=true`). Still
owed: the first signed Sparkle handoff, beta.2 to beta.3.

### Blanc Beta 2.0.0-beta.3 (2026-11-14)

Published at 07:16 UTC as a GitHub pre-release, not latest:
<https://github.com/bnfy/blanc/releases/tag/chromium-beta-2.0.0-beta.3>, tag at
`c3a3bc898`, candidate `macos-39d309c3cba37076`, DMG SHA-256
`a31422ed7f63b4664e03906406827491bae91f513e9ea76abcaad63791bedb57`, nine assets.
It carries the Sync lockout fix and Safe Browsing off by default (patch 0079).
The owner never touched the Mac Studio: every `release.mjs` stage ran from
the MacBook Pro, through `chromium/release/owner/remote/beta3-*.command`
calling the Mac Studio's `beta3-*.command` over SSH, with the notarization
values and the update key read from 1Password on the MacBook Pro and sent as
SSH environment (`chromium/release/owner/README.md`). Gates: 11 passed
(acceptance and desktop Sync by the targeted decision above, notices and
credits, blocker payload, outbound isolation, profile coexistence, Touch ID
passkeys on the notarized app, test hooks absent, the update proof carried
from beta.2, native signature, Gatekeeper) and 2 waived (no-drm-handoff,
production-sync-real-device). The outbound check passed only after Safe
Browsing was turned off and Adobe Creative Cloud was quit for the run (its
traffic was attributed to the beta's test user). What cost time: the SBOM
was built before the descriptor's source commit was rebound, so `manifest`
refused it until it was rebuilt; the first DMG stage failed because the SSH
session couldn't reach the login keychain (the notarize wrapper now unlocks
it); `gh` wasn't on the SSH search path for `draft`. After publication the
website PR shipped the feed, the Download page tile and `/dl/beta` (#1518;
blanc-ping version `9d4bd37d`), and blanc.day's feed equals the release
appcast byte for byte. The hosted smoke check passed all six checks (run
43573427182 on `main`, `check_feed=true`) once #1519 brought this record and
beta.3's `GATE_WAIVERS` there. The first signed Sparkle handoff passed the
same day on the MacBook Pro: the public beta.2 (DMG `d155c316…`, reinstalled
over beta.3 with the profile kept) found beta.3 through Check for Updates…,
installed it and relaunched. About shows 2.0.0-beta.3, and the installed app
is notarized and stapled, with the released beta.3's code hash
(`b9a1e9d53dc4cf6bc2ef105068cd8e4828909fed`).

### Blanc Beta 2.0.0-beta.4 (2026-11-14)

Published at 19:02 UTC as a GitHub pre-release, not latest:
<https://github.com/bnfy/blanc/releases/tag/chromium-beta-2.0.0-beta.4>, tag at
`57e3109dd`, candidate `macos-e8eb804f1ebb87a8`, DMG SHA-256
`fd42bf1265db3fe3844372a34a5c7ce14e58307ca989a811186b474ec0658ed1`, nine assets.
It carries 1Password's Unlock fix (patch 0081: an extension's own popup opens
under the Island), the red button keeping the main window's tabs (patch 0083,
like shipping Blanc's Dock close), Sync publishing open pages after every
window closes, the Mac's name as shipping Blanc gives it, the Sunrise Gold icon
(0082), the Island's pointer response and the vertical tabs' Space row. A first
notarized beta.4 from `e47bf1bcf` was superseded by the red-button fix before
publication. Every stage ran from the MacBook Pro over SSH, as for beta.3.
Gates: 11 passed (acceptance by the owner's targeted decision, desktop Sync,
notices and credits, blocker payload and test hooks absent on a copied
candidate on the MacBook Pro, outbound isolation, profile coexistence, Touch
ID passkeys carried from the first notarized beta.4, the update proof carried
from beta.2, native signature, Gatekeeper) and 2 waived (no-drm-handoff,
production-sync-real-device). After publication the website PR shipped the
feed, the Download page tile and `/dl/beta` (#1529), and blanc-ping was
deployed from `main` plus the unmerged Android ping change already live, so
nothing rolled back. The hosted smoke check passed all six checks (run
43631733437, dispatched on `chromium/next` with `check_feed=true`). The signed
Sparkle handoff passed the same day on the MacBook Pro without touching the
installed beta: a separate copy of the public beta.3 (DMG `a31422ed…`) with a
throwaway profile (`--user-data-dir`) found beta.4 through Check for
Updates…, downloaded and installed it. The updated copy reports 2.0.0-beta.4
(build 4), passes Gatekeeper and the stapled ticket, and has the released
beta.4's code hash (`2600f9dde659db1df04972ca3e2afbb6412b706f`). Its relaunch
went to the Blanc Beta already running (the relaunch doesn't keep
`--user-data-dir`, so Chromium hands it to the default profile's process);
started again by hand, the copy opened as beta.4.

### Runbook for the next beta: lessons from beta.2 (2026-11-14)

Beta.2 shipped, but cost hours on things that are now known. Do the next beta
in this order. Each item says what went wrong the first time.

**Before building**

1. **Decide every gate waiver first.** `release.json` is bound to each finished
   stage (`state.json` keeps its digest), so a waiver decided after `preflight`
   can't be added to it without starting the signing run over. Beta.2's Sync
   waiver came after signing and had to ride in `acceptance.json` instead
   (`policy.mjs` `GATE_WAIVERS`). Put every waiver in `release.json`'s
   `gateWaivers` before `preflight`, and add the release to `GATE_WAIVERS`.
2. **Know which Mac signs.** The Developer ID certificate (`55283A84…`, with
   its private key) was only on the MacBook Pro. It was exported as a `.p12`
   and imported into the Mac Studio's login keychain. A sandboxed
   `security find-identity` shows no identities at all, so check outside the
   sandbox before deciding it's missing.
3. **Have every tool on the signing Mac before starting:**
   - The pinned Sparkle tools: `~/Projects/Blanc/records/sparkle-2.10.1`.
   - `cosign`: the Mac Studio had none, so beta.2 used the checksum-verified
     v3.1.3 copy from the release Mac's Homebrew (`sha256 77bbab24…`).
   - Node 22 at `/usr/local/bin/node`, which Astro needs; the default
     `node` on the Mac Studio is 20.
   - Wrangler: `npx wrangler@4.86.0`, signed in to BNFY.
4. **Plan for 1Password locking on the Mac Studio.** It re-locks every ~20
   seconds, which makes `op run` unusable. Instead:
   - Notarization: `beta2-notarize.command` asks for `APPLE_ID` and the
     app-specific password with hidden input, pasted from 1Password on the
     MacBook Pro. The values live only in that window's memory.
   - Update-key backup: `sparkle-key-airdrop.command` exports the key,
     proves it against the production public key, waits while it is
     AirDropped and saved in 1Password (Dev) on the MacBook Pro, then deletes
     the Mac Studio's copy and clears `BACKUP-PENDING`.
5. **Run evidence against the real descriptor, not a draft.** Beta.2's first
   blocker, hooks, profile and notices runs used a draft `release.json` with
   placeholder hashes and had to run again on the real one. Write
   `release.json` and `local-inputs.json` first, then run the evidence.

**Acceptance**

6. **The full suite takes about 75 minutes, and the Mac must stay idle.**
   Pointer and window cases (`island-and-commands.feature:348`/`:372`) fail
   when someone uses the Mac during the run. Rerun just those with
   `run-cases.sh` afterwards, rather than the whole suite.
   `vertical-tabs.feature:58` is a known intermittent failure until beta.3
   fixes it. Report progress as "N of total" from the run's `progress.json`.
7. **Quit the installed Blanc Beta before the profile check.** It verifies the
   real `Blanc Beta` data folder stays untouched, and an open beta writes to it.

**Signing to publishing**

8. **Run every `release.mjs` stage from a one-command wrapper the owner opens
   in Terminal.** Each wrapper writes a status file that Claude watches. For
   beta.2: `beta2-sign`, `beta2-notarize`, `beta2-sparkle`, `beta2-draft` and
   `beta2-publish` in `~/Projects/Blanc/scripts/`. Copy them with the new
   version. Keychain prompts appear twice:
   - `codesign` asks for the Developer ID key: choose **Always Allow**.
   - `sign_update` asks for the update key: choose **Allow**. A Deny fails
     the stage without writing anything; just run it again.
9. **Commit nothing to the source branch between writing `release.json` and
   `preflight`.** Preflight requires a clean tree with HEAD equal to
   `sourceCommit`. After preflight HEAD may move, and the tag still goes on
   `sourceCommit`.
10. **Sigstore needs a terminal.** cosign without one fell back to a hidden
    device-code sign-in and hung. `release.mjs` now gives it the Terminal
    (`99bcadb21`); Safari opens the sign-in.
11. **Checking a public download:** GitHub's file storage answers `HEAD` with
    404. Check a release file with a ranged `GET` (`curl -r 0-1023`).

**Owner checks**

12. **The Touch ID passkey and Sync checks** run from
    `beta2-owner-checks.command` (and `beta2-sync-check.command` for Sync
    alone). If the iPhone already syncs:
    - in the regular Blanc, open Settings → Sync → **Add another device**;
    - in Blanc Beta, open Settings → Sync → **Add this device with a code**.

    Ignore Turn on Sync and Connect your iPhone: they start a new Sync. The
    Sync screen's choices confused the owner; simplifying them is a
    follow-up.

**Website and checks after publishing**

13. **Update three things in one website PR, after publication:**
    - `site/src/data/blanc-beta.json`;
    - `BETA_DOWNLOAD` in `cloudflare/ping-worker/src/dl.js`;
    - `site/public/updates/chromium-beta/arm64.xml`, the release's appcast
      byte for byte.

    `test/unit/site-blanc-beta.test.js` keeps them equal.
14. **Before deploying, check the merged PR's commits.** #1511 was merged ten
    minutes before the reimagined page was pushed, and the redesign needed its
    own PR (#1512).
15. **Deploy the Worker before the site.** Until blanc-ping is deployed,
    `/dl/beta` falls back to the stable release page.
    - Worker: deploy from `cloudflare/ping-worker` after comparing bindings
      with the live version (`wrangler versions view`).
    - Site: deploy from the clean `main` checkout at
      `~/Projects/Blanc/worktrees/deploy-main`, with the Blubird fonts
      installed from `~/Downloads/blubird` (`blubird-fonts.mjs install`).
    - Confirm Cloudflare reports Production on `main` at the expected SHA.
16. **Dispatch the hosted smoke check on a branch whose `policy.mjs` knows the
    release's waivers.** `main` does only after `chromium/next` is merged
    there; for beta.4, `gh workflow run chromium-beta-smoke.yml --ref
    chromium/next -f tag=… -f check_feed=true` worked without that merge.
17. **`main` requires review conversations to be resolved, and only the owner
    can resolve them.** CodeQL failed #1513 on code that is now fixed:
    - checking a file and then reading or writing it separately: open once,
      `fstat` the descriptor, write `wx`;
    - file data in a request URL: ask fixed questions;
    - Node writing downloaded data: download with `curl`;
    - splicing values into page script without escaping: JSON plus `\u`
      escapes for `<`, `>`, `/`, U+2028 and U+2029.

    Write new release and test code this way from the start.

### Lessons from beta.3: releasing from the MacBook Pro (2026-11-14)

The owner asked for beta.3 to run without anyone at the Mac Studio. Every
`release.mjs` stage still runs on the Mac Studio, from a one-command wrapper on
the MacBook Pro that connects over SSH. Each item says what went wrong first.

1. **Wrappers live in `chromium/release/owner/remote/`** (copied to
   `~/Projects/Blanc-Remote/betaN/` with the new version). Start them with
   `osascript -e 'tell application "Terminal" to do script "bash …"'`: after a
   few runs, `open -a Terminal x.command` opened a bare prompt without running
   the script. Every wrapper keeps its window open at the end, because Terminal
   closes a finished window and its error with it.
2. **An SSH session can't reach the Mac Studio's login keychain** until
   `security unlock-keychain` runs in that session (the owner types the
   password). Every stage that signs or uses `gh` needs it: sign, the DMG
   stage (it signs the DMG, and runs in the notarize wrapper), draft and
   publish. Launch checks over plain SSH lack it too: Chromium can't encrypt
   cookies, so the blocker check's ordinary-window cookie is never saved (a
   false failure) and Sync can't start. Run the blocker and hooks checks on the
   MacBook Pro against a copy of the candidate (framework hash checked), or
   unlock first. The profile and notices checks don't depend on it.
3. **Secrets come from 1Password on the MacBook Pro.** In Terminal, `op` isn't
   signed in even when another app's is, so the wrappers run
   `OP_BIOMETRIC_UNLOCK_ENABLED=true op signin` first, read each value into a
   variable and refuse to send an empty one. Every `release.mjs` stage
   refuses a stdin that isn't a terminal, so stages run under `ssh -t` and
   secrets travel as SSH environment (`LC_*`, which macOS's sshd accepts):
   `LC_BLANC_APPLE_ID` and `LC_BLANC_APPLE_PW` from "Apple Notarization"
   (fields `username` and `credential`), and the update key as
   `LC_BLANC_SPARKLE_KEY`, handed to `release.mjs` as `BLANC_SPARKLE_KEY`,
   which it drops from its environment on load and gives `sign_update` only on
   stdin. Never on a command line or disk.
4. **Never print a secret, even to test it.** In zsh, `cmd 2>&1 >/dev/null |
   …` still sends stdout down the pipe (MULTIOS). On November 14 that put the
   notarization app password in a session transcript, and the owner revoked
   it. Check a secret by its field labels or a command's exit status only.
5. **The outbound check needs a run long enough to catch background fetches.**
   Chromium's default Safe Browsing fetched Google's lists after a relaunch;
   beta.2's run ended before the first fetch, so it passed. Patch 0079 turns
   Safe Browsing off by default. Adobe Creative Cloud in the `blanc-test`
   session is built on Chromium too: it resolves names itself and updates from
   Google, so its blocked packets can't be told from the beta's.
   `tests/outbound/beta-root-remote.sh` quits it for the run, and starts the
   test user's half through `launchctl asuser` in its existing login session,
   so both users must stay logged in. A run takes about 8 minutes and is done
   only when its window says Done.
6. **Evidence tools never overwrite** (`wx`). After a rebuild, move the old
   candidate's evidence aside first, or the run stops with "unexpected error".
7. **Rebuilding mid-release.** `apply.py` may meet a tree whose files come from
   several commits: give it a previous map of the committed versions (each
   tree file's blob found in Git history) rather than forcing it. A commit
   before `preflight` means rebinding `release.json`'s `sourceCommit`; the
   input digest and the candidate change only when `chromium/blanc/` or the
   patches change. Only `preflight` checks `HEAD`. Afterwards, move the Mac
   Studio's repo only to the commit you need, not the branch tip, because other
   sessions push to `chromium/next`. No other session applies sources or builds
   on the Mac Studio until the release is published.
8. **The ledger entry comes after publication.** `preflight` requires
   `previousBuild` to equal the ledger's highest build.
9. **The hands-on checks run on the MacBook Pro** from the notarized DMG,
   which replaces its installed beta. Reinstall the previous public beta
   before checking the signed N → N+1 update.

### Owner gate decisions for the first public beta (2026-11-14)

- **acceptance:** the shipping corpus drives the app through test hooks the
  beta compiles out, so its evidence is an equivalence: the full suite on the
  prototype built from the same Blanc source as the beta candidate (desktop
  sources unchanged between them), plus the beta's own checks (blocker,
  no test hooks, profile separation, notices and credits, outbound
  isolation, Sync, update proof). This supersedes §6.1's "a separately
  instrumented sibling cannot substitute" for this beta only.
- **desktop-sync:** `beta-sync.mjs` on the local-qualification build (same
  code, local Worker) counts; production Sync is covered by the owner's
  real-device gate on the signed build.
- **sparkle-N-to-N+1:** the local update proof (good feed installs; wrong key
  and tampered refused) counts for beta.2; the first signed handoff is
  beta.2 → beta.3 after publication, recorded then.
- **no-drm-handoff (waived for beta.2):** the protected-video notice and its
  open-in-Electron-Blanc action (D3/X2) are not built yet. The owner waived
  the gate for 2.0.0-beta.2 only, choosing to ship without the notice: on a
  site that asks for protected video, playback simply fails. The notice is
  due in beta.3. `policy.mjs` `GATE_WAIVERS` holds the only waivable gate and
  release; beta.2's descriptor carries `gateWaivers["no-drm-handoff"]` with
  the owner's reason, its `acceptance.json` marks the gate `waived`, and the
  evidence bundle is the waiver record. `manifest.mjs` refuses a `waived`
  gate without that descriptor entry. Make no public claim about protected
  video in Blanc Beta.
- **production-sync-real-device (waived for beta.2):** decided after the
  signing run began, so `release.json` (bound to every finished stage) does
  not carry it. `GATE_WAIVERS` lists it for 2.0.0-beta.2; the owner's reason
  goes in SOURCES as `{"waiver": "…"}`, and `gate-evidence.mjs` writes it into
  the gate's evidence bundle and its public `acceptance.json` entry, where
  `manifest.mjs` requires it. Desktop Sync (local Worker) still passes. The
  hosted smoke check runs the verifier from the dispatching commit, not the
  tag, because the tag's verifier predates this rule. The Touch ID passkey
  gate passed on this notarized build (owner, 2026-11-14).

### Owner gate decisions for beta.3 (2026-11-14)

Beta.3 is 2.0.0-beta.3, build 3, and carries the Sync lockout fix
(`dc054f0bf`): on beta.2, Settings → Sync could say "Could not check sync"
until a relaunch after a long first join. Since beta.2's source
(`058277389`) the fix is the only desktop source change. The owner decided
these with buttons on 2026-11-14:

- **arch:** Apple Silicon only again (a fresh Intel waiver in `release.json`).
- **no-drm-handoff:** waived again. The protected-video notice moves to
  beta.4. `GATE_WAIVERS` lists it for 2.0.0-beta.3, and the descriptor
  carries the reason.
- **production-sync-real-device:** runs on the notarized beta.3; not waived.
  Your iPhone's existing Sync is joined with a code from the regular Blanc.
- **acceptance and desktop-sync (targeted):** beta.2's full-suite equivalence
  plus the fork unit suite at the beta.3 source. The Sync fix has its own
  unit tests (runner always answers, lane release, Sync page). The beta's own
  checks (blocker, hooks absent, profile, notices and credits, outbound) run
  on the beta.3 candidate. The real-iPhone pass is the desktop Sync evidence.
- **sparkle-N-to-N+1:** the updater is unchanged since beta.2, so beta.2's
  local update proof counts. The first signed handoff, beta.2 → beta.3 from
  an installed beta.2, is checked after publication.
- **Safe Browsing off by default (found by beta.3's outbound check):** after
  a relaunch the beta fetched Google's Safe Browsing lists
  (`safebrowsing.googleapis.com/v5/hashLists`). Chromium's default leaves it
  on, and the desktop spec's §6.1 "default-off Google traffic" gate forbids
  it. Beta.2's run ended before the first fetch, so the published beta.2
  most likely does the same. The owner chose off by default, with a line in
  beta.3's notes saying earlier betas could check those lists. Patch 0079
  sets `safebrowsing.enabled` to false by default for every profile, so
  Chromium neither updates the lists nor sends download checks; the Settings
  choice stays. The outbound check runs again on the rebuilt candidate.
- **production-sync-real-device (waived for beta.3 after it failed):** the
  owner's real-iPhone pass on the notarized beta.3 (2026-11-14, on the
  MacBook Pro) found two faults. The beta published itself to the account
  with no open tabs (device `MacBook-Pro`, 0 tabs, while tabs were open), so
  the iPhone didn't list it. Joining with a code showed no "what will sync"
  step (possibly by design: nothing new would upload; compare with shipping).
  The lockout fix itself passed on real hardware: after joining, Settings
  showed Sync on, with no "Could not check sync", and kept it after a
  relaunch. Owner: ship beta.3 with the gate waived, its notes keeping
  beta.2's caution that Sync isn't checked end to end, and fix both faults in
  beta.4. `GATE_WAIVERS` lists it for 2.0.0-beta.3; the reason goes in the
  gate sources, because `release.json` was fixed before the check ran.

### Lessons from beta.4 (2026-11-14)

1. **Point the outbound check's config at the new candidate** before the owner
   types the `blanc-test` password; it still named an old prototype and
   refused with "Candidate identity mismatch", costing a second password.
2. **The Sigstore page doesn't open on its own in a remote run.** Read the
   exact sign-in URL from the wrapper's Terminal window and open it on the
   MacBook Pro.
3. **Another session may push patches to `chromium/next` mid-release.** Fetch
   before committing a new patch and renumber if its number is taken (the
   red-button patch became 0083).
4. **The live blanc-ping Worker can carry unmerged code** (beta.4: the Android
   ping branch). Compare the live version with `main` before deploying and
   keep what is live, or the deploy rolls it back.
5. **Check whether the website PR already merged** before acting on it.
6. **Check the signed handoff on a copy, not the owner's install:** stage the
   previous public beta in a scratch folder, launch its binary with its own
   `--user-data-dir`, and drive Check for Updates… by process id (System
   Events `first process whose unix id is …`), because both copies share one
   bundle id. Compare the updated copy's code hash with the released DMG's.

### Daily betas (2026-11-14)

The owner ships a beta every day until the fork is stable. Design:
`docs/superpowers/specs/2026-11-14-daily-beta-release-design.md`. The owner's
decisions, made with buttons on 2026-11-14:

- **The full suite runs nightly, plus a targeted rerun.** A beta releases on a
  passing night's evidence. Source newer than that night may release after a
  rerun of only the scenarios its changes touch.
- **Gate decisions carry until the owner changes them**
  (`chromium/release/standing.json`).
- **Hand checks run only when their code changed** since the last beta where
  they passed.
- **The outbound check runs inside the one release command.** No sudo rule was
  added on the Mac Studio.

Per-version wrappers (`betaN-*.command`) and per-version `GATE_WAIVERS`
entries are no longer written; the earlier ones stay for the record.

**1. Every night (the Mac Studio, unattended).** The LaunchAgent
`me.bnfy.blanc.beta-nightly` runs `chromium/release/daily/nightly.mjs` at
02:00 (installed by `daily/install-nightly.sh`, removed with `--remove`). The
suite can't draw on a locked screen, so the same installer adds
`me.bnfy.blanc.display-awake` (`caffeinate -d`), which keeps the display from
sleeping into the lock (owner, 2026-11-14; no security setting changed). Unlock
the Mac Studio once over Screen Sharing after installing and after every
restart. The night skips, writing why to `records/nightly/skipped.log`, if the
screen is locked, if `records/RELEASE-IN-PROGRESS` exists, a build or the test runner is going,
the checkout has uncommitted changes, or it has commits `chromium/next` lacks.
Otherwise it moves `~/Projects/Blanc/repo` to `chromium/next`'s tip and:

1. Builds the prototype with `scripts/rebuild.sh`. If the build leaves any
   committed generated file changed (other than `tracker.json`), the night
   fails: the committed source map or asset hashes are stale. Commit them.
2. Builds the beta as the next version (ledger + 1). Only
   `blanc_beta_version` and `blanc_beta_build` may change in `args.gn`
   (`bumpBetaArgs`), then `gn gen`. The guard's environment is re-recorded
   only when its own check names nothing but `argsSha256`. The build is capped
   at 3000 actions, so it is never a cold build.
3. Runs the full suite, reruns anything that failed once, and judges it
   against `daily/known-failures.json`. Add a case there only with its reason;
   remove it once fixed.
4. Runs the blocker, test-hooks, profile and notices checks (with the SBOM)
   under the release descriptor the release will use.
5. Writes `records/nightly/<stamp>/result.json`, and `latest-pass.json` when
   the night passed.

`nightly.mjs --plan` says what it would do and changes nothing.
`nightly.mjs --targeted` runs the targeted rerun on the checkout as it is
(Claude moves it to the release commit first). `daily/scenario-areas.json`
maps changed files to features. Anything shared or unmapped, a build file, a
lane or upstream change, or a change to the runner needs the full suite.

**2. Prepare (Claude, on the Mac Studio).** Write `CHANGES.md` (the "Fixed in
this beta" and "New in this beta" sections, in the style of beta.4's notes)
from the commits since the last beta, then run:

```
node chromium/release/daily/beta-prep.mjs records/nightly/<stamp>/result.json CHANGES.md [TARGETED-result.json]
```

It refuses a night that didn't pass, a checkout not at the night's commit, or a
descriptor that differs from the one the checks ran under. It writes
`records/beta<N>-work` with frozen copies of the unsigned app and `args.gn`,
the release notes, `gate-sources.json` and `hand-checks.json`. It points the
outbound check at the candidate and writes `RELEASE-IN-PROGRESS`.

Carried checks use their pinned evidence. A check whose code changed is due:
Claude runs the ones marked `claude` (the update proof, desktop Sync) before
telling the owner. `beta-prep.mjs --abandon` clears the marker if no tag
exists.

**3. Release (the owner, on the MacBook Pro).** Run
`chromium/release/owner/remote/beta-release.command`, the same file for every
beta. It asks for:

- Touch ID for 1Password;
- the Mac Studio password (for sudo while the outbound check is still due,
  then the keychain);
- "tag and draft" (after the release notes are shown);
- the Sigstore sign-in (Command-click the address);
- "publish".

The steps run in this order (`daily/release-steps.mjs`):

1. outbound check;
2. preflight, sign, notarize-app, dmg, notarize-dmg;
3. signed evidence;
4. sparkle;
5. any due hand check;
6. gate evidence, manifest;
7. draft, Sigstore, publish, verify-public;
8. the website PR.

Every step is logged in `records/beta<N>-release-status.txt`. Running the
command again resumes at the first unfinished step and never repeats one. If
the passkey check is due, the command stops with exit 2. The owner then runs
`owner/remote/beta-passkey-check.command`, which installs the notarized
build, asks five questions and sends the answers, and then runs the release
command again.

**4. After publication (Claude).**

1. `daily/site-pr.mjs <tag>` opens the website PR if the release command
   didn't. It downloads the public `release.json` and appcast, checks them
   against the Sigstore-signed checksums, and writes the feed (byte for byte),
   the Download tile, `/dl/beta`, `dl.js`'s audit digest and the claims
   ledger. If the waivers differ from the limitations the page lists, it
   refuses, because the page's text changes and that needs the owner.
2. Merge the PR when its checks pass.
3. Deploy blanc-ping (compare the live version first), then the site from
   the clean `main` checkout.
4. Dispatch `chromium-beta-smoke.yml` with `check_feed=true`.
5. Check the signed handoff on a copy (the lessons from beta.4, item 6).
6. Run `daily/beta-record.mjs <WORK> <checkout of chromium/next>`. It adds
   the ledger entry, moves `standing.json`'s `lastPass` for checks that ran
   again, logs the beta in `chromium/release/daily-log.md` and clears
   `RELEASE-IN-PROGRESS`. Commit and push to `chromium/next`.
7. Open the PR that merges the release tag into `main`.

**Changing a decision.** Edit `standing.json` only on the owner's word, quoting
it in the commit. Retire a waiver with `until` (the first beta it no longer
covers); never delete it, so earlier releases still verify. A changed waiver
needs a new night, because the evidence binds the descriptor.
