## Result

Phase 1 is implemented on `chromium/beta-release-setup`, based on migration tip
`ed162e364389f322a68908a7b930a7394bae3d45`, since rebased onto `chromium/migration`
(PR #1438). No build. The beta provisioning profile is now issued and committed.

- Runbook: `docs/chromium-beta-release.md`; staged, unapplied upstream work and
  patch-cost estimates: `chromium/release/PATCH-PLAN.md`.
- Offline fixture tests cover preflight policy/GN/profile/certificate checks,
  signed-app inspection policy, real Ed25519 appcasts, complete manifests and
  the installed stable updater + real site normalizer's beta exclusion.
- `scripts/release-chromium-beta.sh` only prints `--plan`; every execution attempt
  exits 78. Native inspection tools exist but have not inspected a real beta.
- Required checks: `npm ci`; Node tools/release suite (249 passed, 7 existing
  skips, 0 failed); `npm run lint` passed. Skips are not native qualification.
- No production Sync, GitHub release API, Apple or 1Password was contacted.
  Public pinned Chromium/Sparkle source reads are recorded in `release/sources.json`.
- Owner decisions still open: proposed beta names/ID/scheme/version and minimum
  OS; feed hosting and updater UX/custody; scheduled official build machines/GN
  diff or Intel waiver; beta provisioning; final acceptance scope and release.
- Existing fork release branding reuses Electron's ID and cannot ship as beta.
  Complete desktop prototype GN args were absent here; literal diff is unverified.

Ordered work requiring the build host / real artifacts:
1. Apply reviewed beta identity, profile isolation, Sparkle and signing patches;
   recover actual GN args, approve the official rebuild/environment/output budget.
2. Build both architectures (or recorded waiver), bind exact candidates and inputs;
   establish external acceptance on official images with hooks absent.
3. Run local desktop Sync, authorized production Sync with a real device,
   packaged notices/credits/SBOM/blocker, outbound and coexistence/passkey gates.
4. Sign with beta profile/pinned leaf; notarize/staple app and DMG; verify DER,
   Gatekeeper, native launch, sandbox/XPC and complete packaged payloads.
5. Prove real private Sparkle N→N+1 before beta 1, then publish immutable pre-release
   only after approval; independently verify downloads/native hosted smoke/feed.
6. Observe the eventual public beta N→N+1 handoff on every shipped architecture.
