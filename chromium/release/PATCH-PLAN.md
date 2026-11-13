# Beta patches — identity and updater implemented; release qualification pending

Updated 2026-11-10; upstream `681cd621e82e606d7536eae8ea2576afb3c7d65c`.
Stage A is selected by desktop patch 0046 and gated by `blanc_channel="beta"`.
Approved: Blanc Beta, me.bnfy.blanc.beta, blanc-beta, isolated profile,
2.0.0-beta.N, macOS 13, beta 1 arm64 with the owner Intel waiver, no Widevine.
The existing preview arguments and behavior remain the default. A beta/official
build requires a separate reviewed configuration and is not run by this queue.

## Budget and ordering

Current desktop lane: **46 patches, 154 distinct patched upstream paths,
560 hunks**. The pristine manifest contains 152 files. These figures are
not a new budget cap or a request to raise it. Record fresh totals after each
stage, keep estimates separate from measured counts, consolidate later where
possible, and follow the owner's direction not to ask for patch-budget increases.

Estimated beta implementation: **13 distinct touched upstream paths**, about
**32–50 additional hunks / 500–850 changed lines**, plus approximately 12–18
new or modified fork-owned source/tool/test files. Eight of the 13 paths are
already among the 139, so the beta adds five newly patched paths (139 → 144).
The table below makes the overlap explicit. Native code/API adaptation can
change these estimates; update this plan instead of quietly declaring a gate
passed. Tests, vendored Sparkle notices and generated-source registrations
are counted separately from upstream hunks.

## Stage A — beta identity and packaging version (implemented; beta build unverified)

Add `chromium/blanc/branding/beta/BRANDING`, select it only for the new beta
channel, and use the Sunrise assets. Name `Blanc Beta`, ID `me.bnfy.blanc.beta`,
team `XYGUCY4498`, data/cache domain `Blanc Beta`, external scheme `blanc-beta`.
Keep preview and the old release path reproducible; never use the old release
branding as beta. Add fork-owned config/buildflags and preparation tests;
source manifests must reproduce the new selection and pin any new upstream input.

| Upstream path | Intended change | Estimate |
| --- | --- | --- |
| `build/config/chrome_build.gni` | Implemented: select canonical beta BRANDING without changing preview branding | 3 hunks |
| `chrome/app/BUILD.gn` | Implemented: test-support dependency for the guarded identity header | 1 hunk |
| `chrome/BUILD.gn` | Beta metadata/entitlement inputs; outer-only version postprocessing; later Sparkle packaging/link inputs | 5–8 shared hunks across A/B |
| `chrome/app/app-Info.plist` | Beta data dir, release display version, feed/key/version substitutions; keep document/HTTP(S) registration | 3–5 shared hunks |
| `build/apple/tweak_info_plist.py` | Explicit beta-only direct-launch scheme/outer version support, or delegate outer override to a fork packaging action without changing other targets | 2–3 hunks (can eliminate if fork action suffices) |
| `components/os_crypt/common/keychain_password_mac.mm` | Beta-specific Safe Storage service/account using beta buildflag | 1–2 hunks |
| `chrome/app/chrome_main_delegate.cc` | Early beta data-root override/import guard, resolved paths/symlinks, before profile/keychain initialization | 2–3 hunks |
| `chrome/app/app-entitlements.plist` | Beta-only compiled template augmentation, ideally separate fork template supplied from chrome/BUILD.gn | 1–2 hunks (can eliminate using separate template) |

Fork-owned files: `blanc/config.gni`, `blanc/BUILD.gn`, new beta BRANDING,
new main-entitlement template, version-metadata generator, preparation/channel
identity tests and release policy fixtures. Inspect the actual preparation
entrypoint before extending it; don't assume a `--channel=beta` flag already
exists. `chromium/tools/channel-identity.test.mjs` deliberately asserts the old
release ID; extend it with a separate beta case, not a change that makes
Electron's identity disappear. Update `source-map.json`, upstream pins and
ordered patch list only when the actual patch is ready.

The WebAuthn group must match upstream's `.webauthn` suffix. With proper beta
`MAC_TEAM_ID`/`MAC_BUNDLE_ID`, `chrome/browser/webauthn/chrome_web_authentication_delegate.cc`
needs **no source edit**. Its touch-ID configuration is read in phase 1 and is
a qualification check, not an additional budgeted patch. Test that generated
entitlements, provisioned group and native runtime agree. Helpers receive neither
the restricted group nor a profile. Do not “fix” AMFI by broadening entitlements.

Prove side-by-side identity, default profiles and explicit CLI overrides,
Safe Storage/passkeys, Launch Services, default-browser consent and explicit
DRM page handoff without reading/writing stable's profile. No migration from
shipping Electron is part of this beta.

## Stage B — Sparkle browser owner and actions implemented; signing pending

Add fork-owned `blanc/browser/mac/beta_updater.{h,mm}` and a GN target. Use a
pinned Sparkle 2.10.1 distribution after the dated provenance/security review
and native architecture qualification; vendor via a hash-verified staging input, not a floating URL or build
hook. Record complete licence and component metadata. Re-sign default helpers
rather than trying to inherit ad-hoc distribution signatures.

| Upstream path | Intended change | Estimate |
| --- | --- | --- |
| `chrome/browser/app_controller_mac.mm` | Create/retain/stop browser-process updater; native menu action and safe quit/relaunch integration | 3–5 hunks |
| `chrome/browser/BUILD.gn` | macOS-only beta updater dependency | 1–2 hunks |
| `chrome/browser/ui/webui/settings/settings_ui.cc` | Trusted About/settings check-update action/status; no renderer feed/key override | 2–3 hunks |
| `chrome/BUILD.gn` / `chrome/app/app-Info.plist` | Already counted in A: framework copy/rpath, architecture-specific feed, public key, before-extraction verification and outer build number | included above |

Use a fork-owned menu insertion at app-controller initialization; only if that
cannot use the existing menu model, add a separately recorded upstream menu file
and revise this estimate. The source layout here is a plan, not proof that native
API linkage or shutdown order works. Keep test actions out of official builds.

Include `Sparkle.framework/Versions/B/Autoupdate`, `Updater.app`, `Installer.xpc`
and `Downloader.xpc` with the source-derived IDs in `verify.mjs`. Retain the
browser's existing child-process sandbox; no App Sandbox/mach-lookup entitlements
by default. Verify rpaths, sandbox/XPC spawning, helper user context, authorization
prompts, graceful session/Sync flush and install/relaunch on both architectures.

## Stage C — Chromium signing config and credential-safe notarizer

| Upstream path | Intended change | Estimate |
| --- | --- | --- |
| `chrome/installer/mac/BUILD.gn` | Copy beta config/invoker/profile/entitlements and notices into generated packaging inputs | 2–3 hunks |
| `chrome/installer/mac/signing/config_factory.py` | Select explicit beta config/invoker, fail if missing, never Google internal config or development fallback | 2–3 hunks |
| `chrome/installer/mac/signing/parts.py` | Add Sparkle inner code parts and deterministic signing order, preserve Chromium's per-part flags | 4–6 hunks |

These three paths plus the ten distinct paths in A/B total **13**. Prefer
fork-owned config and notarizer subclasses to changes in `notarize.py`,
`commands.py`, `pipeline.py` and `signing.py`; those four were inspected but are
**zero planned hunks** unless integration proves an extension point necessary.
The beta subclass provides the new profile basename and DMG distribution/name.
Default Chromium config embeds no profile and signing CLI defaults to no
notarization, so require both explicitly. Don't use Google `channel_customize`
paths that expect Keystone keys. Set a beta packaging basename including beta
version and architecture; keep framework version Chromium-native.

The custom notarizer obtains existing Apple variables only inside the exact
`OP_BIOMETRIC_UNLOCK_ENABLED=true op run --env-file=.env.1password --no-masking --`
boundary. It must not use upstream logged `--notary-arg` for credentials. Test
all successful/error/timeout paths with fake secrets and captured output before
real notarization. Avoid logging exception objects carrying subprocess argv.
No production signing/authentication is authorized by this plan.

## Stage D — qualification and publishing adapters (fork-owned, no upstream hunks)

1. Extend guarded build output selection after review of the actual GN before/after
   diff, environment changes, machines/action budget and existing cache preservation.
2. Implement the exact-official-candidate external acceptance harness and local
   desktop-Sync adapter; never re-enable preview hooks in the public artifact.
3. Implement packaged blocker/credits/SBOM extraction and evidence receipts tied to
   final DMGs; keep the fixture manifest's schema checks separate from provenance.
4. Implement native signer/notarizer/packager adapter, public-input ledger and remote
   tag/draft uniqueness checks (network errors fail closed). Add orchestration tests
   for partial signing, timeout, changed inputs, existing draft and takeover.
5. Generate/custody the EdDSA key, implement beta feed hosting/promotion rollback,
   run private real N→N+1 qualification before beta 1. No generic stable metadata.
6. Add a fork-specific hosted macOS smoke workflow for both native architectures.
   Do not dispatch the Electron smoke/release workflow on these artifacts.
7. Only after those pass, replace the unconditional shell execution guard in a
   reviewed follow-up; require foreground operator, exact source, all evidence,
   `op`, immutable pre-release publication and post-download verification.

No production migration, Windows/Linux fork release, Widevine, general Electron
extension runtime, toolchain switch or automatic rebuild is included. See the
runbook for open owner decisions; this phase-1 commit can be reviewed entirely
without a Chromium checkout or native build.


Stage A actual scope: five upstream paths (`build/config/chrome_build.gni`,
`chrome/BUILD.gn`, `chrome/app/BUILD.gn`, `chrome/app/chrome_main_delegate.cc`,
`components/os_crypt/common/keychain_password_mac.mm`) and six new canonical
files. The outer-only metadata action eliminates the proposed tweak_info_plist
and app-Info template edits; the separate entitlement template eliminates an
upstream entitlement change. Native pure path tests and metadata tests are
available in `release/beta-identity.test.mjs`; actual beta launch, passkeys,
Launch Services and signed isolation remain later qualification.


Stage B actual scope: patch 0047 touches six existing upstream paths: outer
chrome BUILD, browser BUILD, AppController, settings_ui and the two About-page
TS/template files. Fork-owned sources hold the native owner/policy, offline
stager/tree verifier, pinned license and metadata generator. No distribution
binary or signing key is committed. Preview remains default-off. The native
framework build and N-to-N+1 handoff require a separate approved beta output;
loopback public-vector tests are not credit for those gates. The owner-approved Sparkle 2.10.1 upgrade includes the reviewed later installer
security fixes; see `sparkle-review-2026-11-10.md`. Native linkage and updater
installation remain separate gates. Stage C/D remain unimplemented.
