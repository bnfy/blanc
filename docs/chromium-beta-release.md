# Blanc Chromium macOS beta release runbook

**Updated 2026-11-10. The owner approved one dedicated local beta build and an incremental N+1 qualification build. Publication, Developer ID signing, Apple, 1Password and production Sync remain separate owner operations.** The shell entrypoint is deliberately incapable of executing a release. Finish the staged patches and qualification below before replacing that guard in a reviewed change. Existing Electron release scripts and `src/`, `spec/`, `test/desktop/` are unchanged.

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

The intentional rebuild is approved for this machine and the new `out/BlancBeta` directory. `chromium/tools/build.mjs` now allowlists that output beside BlancPrototype/BlancRelease. Preserve both existing outputs and Siso caches. Inspect competing build **process names**; obtain a reviewed dry-run plan, then use the guarded wrapper with the approved action limit. A cold beta output is a separately authorized cold build, not disguised as incremental. After integration, preflight insists on explicit literal GN assignments, exact file hashes and the listed safety values, and refuses any other argument until it is added to `GN_REVIEWED_EXTRA` in `policy.mjs` in a reviewed change; it does not run GN or prove effective toolchain selection.

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

Use pinned Chromium's [sign_chrome.py](https://chromium.googlesource.com/chromium/src/+/681cd621e82e606d7536eae8ea2576afb3c7d65c/chrome/installer/mac/sign_chrome.py) → `signing/driver.py`, `config_factory.py`, `parts.py`, `pipeline.py`. `--identity` accepts a SHA-1 fingerprint. `ChromiumCodeSignConfig.provisioning_profile_basename` is currently `None`; stage a beta config selected explicitly by the factory, with the beta profile basename and DMG distribution. Do not use `--development`, disable verification, or assume a `--config` flag exists. The generated `Blanc Beta Packaging` folder must contain the pinned signing modules, generated build properties, entitlements, profile and DMG tools. Include Sparkle's nested parts in the inner-to-outer signing order **before** sealing the app. Never sign with `--deep`; use it for verification.

Reviewed entitlement matrix, derived from pinned Chromium `chrome/app/*-entitlements.plist` and `signing/parts.py`, not Electron entitlements:

| Part | Entitlements / runtime |
| --- | --- |
| Main browser | Upstream audio-input, Bluetooth, camera, print, USB, location and photos-library booleans; add beta application/team identifiers and exact WebAuthn group. Hardened runtime; retain library validation. |
| Renderer, GPU, Aperitif Renderer/GPU | `com.apple.security.cs.allow-jit=true` only; upstream restrict/kill/runtime signing flags. No WebAuthn group or blanket unsigned-memory/library-validation entitlement. |
| Ordinary, Aperitif and Alerts helpers; crashpad, app_mode_loader, web_app_shortcut_copier | No entitlements; upstream hardened runtime/restrict/kill/library validation. |
| Chromium framework and shipped dylibs | Pinned Developer ID; no entitlement additions. Runtime flags are not executable requirements for dylibs. |
| Sparkle framework, Autoupdate, Updater, Installer.xpc, Downloader.xpc | Re-sign all with the same Developer ID; runtime on executables, no debug or App Sandbox entitlement for the default distribution. Exact IDs are pinned in verifier. |

The verifier checks the DMG signature/leaf/ticket as well as the contained app. The verifier compares **DER** entitlements, strict deep signatures, TeamIdentifier, Developer ID authority, timestamp and the extracted leaf fingerprint for every known code part; rejects unknown Mach-O payloads, unknown nested bundles, escaping symlinks, helper profiles and Widevine names. It checks nested plist IDs, Sparkle version, Chromium framework version, beta feed/build/name/default directory and all required notice files. Real DER layout and actual distribution contents still need qualification; do not loosen a failure without reviewing source and updating tests.

Authentication and wrapping must match stable's pattern:

```sh
# FUTURE OPERATOR SESSION ONLY; disabled in the phase-one draft.
OP_BIOMETRIC_UNLOCK_ENABLED=true op signin
OP_BIOMETRIC_UNLOCK_ENABLED=true \
  op run --env-file=.env.1password --no-masking -- \
  python3 /private/reviewed-beta-signing-adapter.py
```

The adapter does not exist yet. It will invoke the pinned generated signing driver with `--identity <pin> --input <unsigned-dir> --output <new-signed-dir> --notarize staple`, using beta config/invoker and `package_as_dmg=true`. It must consume `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` from that `op run` environment (the existing Dev / Apple Notarization item), without printing them. Chromium's `commands.py` logs complete argv and its `notarize.py` accepts `--notary-arg`; **do not pass credentials through that path**. Implement a beta notarizer invoker with redacted subprocess handling and tests that inject fake secrets and assert none reach stdout/stderr/exceptions. It may pass credentials to `notarytool` in its private child argv as the stable library does, but never logs those arguments. Monitor only `ps ... comm`, never full args. No shell tracing, environment dumps or raw failed-notary output in shared evidence.

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

Generate a full CycloneDX SBOM from the actual pinned Chromium DEPS/build dependency graph, bundled native libraries/resources, canonical Blanc source, Sparkle and third-party payloads. Include versions, licences, hashes/provenance and component relationships. Electron's npm runtime SBOM is insufficient. A fork SBOM/credits extraction adapter is **not implemented here** and is a phase-2 gate; `manifest.mjs` only validates the CycloneDX envelope and Chromium/Sparkle component floor, not completeness. Audit the contents against the packaged dependency closure before setting the notices gate to pass.

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

Remaining owner work before a distributable beta:

1. Identity, `2.0.0-beta.N`, macOS 13 and the beta 1 Intel waiver are approved. Qualify the real beta first-run/default-browser consent and side-by-side OS registrations.
2. Supply the dedicated EdDSA public key after the owner-only key ceremony; approve hosting/promotion operations, reviewed distribution provenance and updater UX. Sparkle 2.10.1 and the blanc.day beta-only routes are approved; production key inputs and runtime qualification are still required.
3. Approve the scheduled official-build GN/environment diff, separate output/cache arrangement and action budget. Beta 1 is Apple Silicon only under the recorded waiver. No cold or official build is implied here.
4. (The beta provisioning profile is issued and committed.) Approve adapter/entitlement review and notarization service use; resolve any certificate rotation needed.
5. Approve the beta acceptance scope after unresolved migration failures, exact-candidate harness work, real-device production Sync account/device and testing window, and final release notes/publication. Sync itself remains required.

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
and `blanc_sparkle_public_key` to the owner-supplied public key. These are beta
build arguments; leave preview's args.gn alone. The public key is passed to the
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
