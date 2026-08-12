# Blanc Security & Privacy Audit — Remediation Record

**Original audit date:** August 12, 2026  
**Remediation date:** August 12, 2026  
**Working version:** 1.1.1  
**Original audited commit:** `fe664c3828f5`  
**Scope:** desktop application, marketing site, Cloudflare workers,
release/update pipeline, direct dependencies, and public security/privacy
claims

## Executive assessment

The working tree closes all five original high-severity findings and implements
source-level remediations for the medium and low findings. The result is a
materially stronger browser architecture:

- arbitrary local HTML no longer receives Electron `file://` privileges;
- blocker inputs are bundled and hash-verified; bundled page-context scriptlets
  remain enabled with declaration isolation under the owner's efficacy ruling;
- public Windows releases fail closed unless exact timestamped Authenticode
  signatures verify;
- the experimental credential SDK and library-validation exception are gone;
- sync keys and cookies use platform protection, with hardened Electron fuses
  verified from packaged binaries;
- retained sync keys are protected by the operating-system credential service;
  the separate authenticated Sync v2 protocol is approved as a follow-up
  project and intentionally absent from this reconciliation;
- internal-page and authentication-dialog IPC is capability-scoped;
- favicon inputs become bounded PNG pixels before entering chrome or storage;
- private-download metadata is memory-only;
- fresh-profile telemetry and suggestion choices must be saved before sending
  (both are presented on), sync and newsletter enrollment are opt-in, and the
  site keeps its shipped denied-storage GA4 Consent Mode; and
- releases gain pinned Actions, SBOMs, Sigstore evidence, and native provenance
  attestations.

This is a **source remediation**, not an external penetration-test certificate.
Several controls require deployment or native release infrastructure before the
corresponding public claim is true in production. Those release blockers are
listed explicitly below.

This record also separates security fixes from product-policy changes. The
owner ruled on every item individually; the reconciled outcomes are recorded
below and reflected in code, tests, public copy, and the data-flow inventory.

### Status summary

| Original severity | Original count | Source status |
| --- | ---: | --- |
| Critical | 0 | No critical finding was established |
| High | 5 | 5 remediated and regression-tested |
| Medium | 8 | 7 remediated in this tree; authenticated Sync v2 approved as a separate Worker-first project |
| Low | 4 | 4 substantially remediated; live advisory and disclosure operations remain ongoing |

## Verification performed

Current verification during remediation:

- focused security/privacy unit suites: passing;
- complete unit suite: 655 passed, 0 failed;
- Electron OAuth compatibility: 1 passed, 0 failed;
- Electron acceptance suite: 92 scenarios / 560 steps passed;
- acceptance dry run: 92 scenarios / 560 steps fully bound;
- Electron DNS/privacy smoke: passing on macOS;
- substrate drift checks: passing;
- Astro production site build: 17 pages, passing;
- `npm audit --omit=dev --audit-level=high`: 0 live-registry vulnerabilities;
- installed Electron: 43.4.0;
- `@1password/sdk`: absent from the dependency tree;
- bundled blocker hash check: passing;
- shell/Node syntax checks for release tooling: passing.
- a fresh untouched Developer-ID-signed directory package: Island chrome
  loaded from `blanc-chrome://`, with no missing-renderer or V8-snapshot
  failure;
- actual packaged executable fuse verification: all eight expected states;
- strict deep signature verification: valid on the finished package;
- hardened packaged CDP smoke harness: connects without weakening Node fuses,
  asserts the chrome document reached `readyState=complete`, and requires a
  visible, non-zero-size Island before first-run/recovery checks proceed;
- packaged first-run/default/opt-out/recovery smoke: passing against that
  binary; and
- packaged migration smoke: passing from the digest-verified official v1.0.3
  macOS ZIP into the same candidate, including authoritative-model assertion
  and activation of an inactive tab restored quiet.

An independent re-review then found two release-blocking defects in the first
remediation pass. Both were reproduced before correction:

- enabling the browser-process-specific V8 snapshot fuse made the packaged
  binary require a snapshot the Electron distribution did not contain; and
- an early sync credential-unlock return left the process-wide
  `syncing` guard set forever.

The V8 fuse is now off and the actual packaged executable passes the eight-state
fuse verifier. Disabling extra `file://` privileges also exposed that the strip
and overlay still loaded through `file://`; they now load from a separate
`blanc-chrome://` handler that serves an exact per-host resource allowlist. Sync
now releases its guard in the whole-pass `finally`, including early
credential-store errors, and defers a coalesced rerun until after that release.
Regression tests cover credential retry and the queued follow-up pass. The
re-review also led to retryable transient favicon failures and a
case-insensitive exact Windows publisher-subject comparison.

The owner approved the ordinary public npm advisory request for round two. The
live production-dependency scan completed successfully with zero reported
vulnerabilities. CI and the real release gate must continue to run the same
scan because that result is time-sensitive.

## Finding-by-finding remediation

### 1. High — Untrusted local HTML received Electron `file://` privileges

**Status: remediated.**

- Removed HTML/XHTML OS file registration and local-path startup navigation.
- Centralized startup URL and top-level URL policy in
  `src/main/startup-urls.js` and `src/main/top-level-url-policy.js`.
- Homepages and restored/navigation targets reject `file:`, `data:`,
  `javascript:`, `view-source:`, and unsupported active/local schemes.
- Disabled Electron's `GrantFileProtocolExtraPrivileges` fuse.
- Added startup and top-level policy regression suites.

Blanc does not currently offer arbitrary local HTML viewing. Reintroducing it
requires a capability-scoped custom protocol and a new threat model.

### 2. High — Desktop blocker formed an unpinned page-script supply chain

**Status: remediated.**

- `adblock/sources/pinned.json` records each EasyList/EasyPrivacy digest plus a
  combined snapshot digest.
- `src/main/adblock-snapshot.js` verifies the release-bundled inputs before
  parsing and writes the compiled cache atomically.
- Runtime list fetching was removed; list changes now require a reviewed app
  release.
- `src/main/adblock-scriptlets.js` retains bundled executable cosmetic
  scriptlets and wraps each in a private declaration scope, preserving the
  shipped breakage-fixing behavior without cross-scriptlet helper corruption.
- Packaging includes the pinned sources; unit and `adblock:check` guards reject
  drift or tampering.

### 3. High — Windows production releases could fail open to unsigned output

**Status: remediated in pipeline; native configuration remains a release gate.**

- `.github/workflows/release-windows-linux.yml` requires a complete Azure
  Trusted Signing or CSC configuration and refuses unsigned output.
- Both installer and unpacked executable must report `Valid`, match the exact
  `WINDOWS_EXPECTED_PUBLISHER`, and contain a trusted timestamp.
- `windows-signature.json` binds publisher, signer, timestamp authority, and
  installer SHA-256 into the release artifact set.
- `scripts/verify-release-manifest.mjs` refuses missing or inconsistent Windows
  evidence before publication.

The repository variables/secrets and an actual Windows 11 clean-install and
upgrade test still have to pass for every included release.

### 4. High — A pre-release 1Password spike and broad entitlements shipped

**Status: remediated.**

- Deleted `src/main/onepassword.js` and its runtime wiring/tests.
- Removed `@1password/sdk` and its native dependency from `package.json` and
  the lockfile.
- Removed `com.apple.security.cs.disable-library-validation` from app and
  helper entitlements.
- Retained only Electron's required JIT/unsigned-executable-memory permissions
  plus the main app's provisioned WebAuthn keychain group.
- Marked 1Password design/legal instructions historical so they cannot be
  mistaken for a current feature.

### 5. High — High-value local secrets lacked at-rest protection

**Status: remediated; packaged migration must be tested on every OS.**

- `src/main/sync-key-storage.js` wraps the retained derived key with Electron
  `safeStorage`; Linux's reversible `basic_text` fallback is rejected.
- Legacy plaintext `sync.json` keys migrate only after the protected
  replacement reaches disk; failures leave sync disabled/fail-closed.
- Key buffers are zeroed after use where practical.
- `JsonStore` now tightens legacy file modes, writes owner-only temporary files,
  fsyncs, and atomically replaces the target.
- `EnableCookieEncryption` is enabled as a production Electron fuse.
- Package smoke/migration gates inspect the real executable and exercise the
  public upgrade path.

Cookie encryption and `safeStorage` migrations are platform behavior; macOS,
Windows, and Linux packaged tests remain mandatory before promotion.

### 6. Medium — Sync used its account locator as an unauthenticated capability

**Status: accepted as a separate project; not remediated by this tree.**

The current client and Worker remain on the released v1 protocol: possession of
the opaque account locator authorizes ciphertext reads, writes, and wipes. The
owner approved an authenticated v2 direction with separate authentication,
context-bound ciphertext, rollback protection, and strongly consistent
per-account storage, but explicitly removed that protocol migration from this
commit so it can receive its own review and Worker-first rollout.

The independent high-severity local-at-rest fix remains here: v1's retained
derived key is OS-wrapped with fail-closed migration from legacy plaintext.
The v2 project may not ship client code until its Worker is deployed and its
v1→v2 migration, conflict, rollback, unauthorized-request, and wipe tests pass.

### 7. Medium — Internal-page IPC shared a broad trust domain

**Status: remediated.**

- `src/main/pages-ipc-trust.js` maps every `pages:*` channel to its exact
  allowed host and verifies main frame, owned WebContents, session, and surface.
- `src/main/tab-preload.js` exposes host-specific APIs instead of the entire
  internal-page bridge.
- Utility-sheet and new-tab WebContents ownership is explicit.
- `src/main/auth-dialog-trust.js` binds replies to the exact dialog sender,
  main frame, URL, and per-dialog id; popups and unexpected navigation are
  denied.
- The strip and overlay now share a dedicated non-persistent chrome partition,
  separate from regular and private browsing sessions.
- Their main-frame navigation, frame navigation, redirects, and new-window
  creation all fail closed; `preload.js` independently checks the exact two
  committed chrome document URLs before exposing `browserAPI`.
- Dedicated unit suites cover confused-deputy and prefix-confusable cases.

### 8. Medium — Production Electron fuses were not hardened

**Status: remediated in configuration and release verification.**

The build now sets and verifies this exact fuse policy:

- `RunAsNode`: off;
- cookie encryption: on;
- `NODE_OPTIONS` and Node CLI inspect: off;
- embedded ASAR integrity: on;
- only load app from ASAR: on;
- browser-process-specific V8 snapshot: off — Electron's distribution does not
  contain the required `browser_v8_context_snapshot.bin`;
- extra `file://` privileges: off.

`scripts/verify-electron-fuses.mjs` inspects packaged macOS, Windows, and Linux
executables; configuration alone is not accepted as evidence. Blanc's strip
and overlay use the tightly allowlisted `blanc-chrome://` scheme, so this fuse
policy does not depend on privileged `file://` documents.

The macOS `afterSign` hook now also runs strict deep `codesign` verification on
the sealed app. Certificate and entitlement inspection alone does not prove
that every nested binary and sealed resource still verifies. The clean
round-two build passed the new complete-bundle check before its successful
packaged launch; a broken seal now fails before notarization or artifact
creation.

### 9. Medium — Remote favicons caused background tracking and rebinding risk

**Status: remediated for all privileged/persistent surfaces.**

- `src/main/favicon-network.js` resolves targets, rejects local/private/special
  IPv4 and IPv6 ranges and mixed public/private answers, pins the lookup, and
  verifies the connected address.
- Requests omit cookies/referrers, reject redirects, bound time/bytes/type, and
  are never issued from a privileged renderer. Private tabs never trigger this
  additional main-process network request; only bounded inline icon data may
  be sanitized for them.
- `src/main/favicon-sanitizer.js` rasterizes accepted input to validated 32×32
  PNG pixels.
- Chrome, Favorites, sessions, and optional sync accept/persist only bounded
  PNG data URLs; old remote bookmark icons are purged.
- Chrome/internal CSPs no longer permit remote images.

The privacy policy discloses the remaining fact that a separate icon-host
request reveals the network address to that host. For regular tabs, the pinned
Node socket currently bypasses Electron's proxy and encrypted-DNS settings.
Replacing it requires preserving the rebinding/SSRF guarantees while routing
through the configured resolver/proxy; that remains an explicit residual, not
silently "fixed" by dropping address pinning.

### 10. Medium — Public Workers lacked robust abuse controls

**Status: implemented; production edge configuration remains a release gate.**

Newsletter:

- rejects absent/unexpected origins for enrollment;
- uses a 24-hour double-opt-in confirmation delivered by Resend;
- creates a subscriber only after mailbox confirmation;
- generates opaque one-click unsubscribe links;
- quarantines valid honeypot addresses for at most 30 days so browser-autofill
  false positives are reviewable, without mailing or subscribing them;
- applies per-IP and keyed per-address throttles; and
- fails closed when mail/token secrets are missing.

Telemetry:

- validates the exact current payload and caps body size;
- requires an edge client address and limits it per minute;
- deduplicates exact install/session replays;
- applies a configurable daily ingest cap; and
- logs structured rejection reasons without bodies or identifiers.

Cloudflare route-level WAF/rate limits and billing alerts are still necessary
because KV counters are best effort, not an atomic cost boundary. The
newsletter deploy wrapper now checks Resend's domain API and refuses deployment
unless the sender is covered by a domain whose status is exactly `verified`.
Secrets and the complete confirmation/quarantine/export/unsubscribe flow still
require a production test before publishing the new newsletter claim.

### 11. Medium — Public privacy/security claims drifted from implementation

**Status: remediated in source; counsel and deployment review remain external.**

- Fresh-profile telemetry and suggestion choices are presented on but cannot
  send until the user saves the card; existing profiles retain their setting
  and are not re-asked.
- The site retains shipped GA4 Consent Mode: analytics storage is denied by
  default and restricted cookieless measurement may occur before Allow.
- The privacy policy now inventories blocker provenance, favicon requests,
  protected sync keys, private downloads, updates, analytics, newsletter
  confirmation, processors, retention, legal bases, transfers, rights, and
  contact procedure.
- Security and download pages describe pinned blocker inputs, protected sync,
  signed Windows artifacts, and release verification accurately.
- `security/network-data-inventory.json` is the machine-readable data-flow
  source, and `test/unit/security-controls.test.js` rejects key claim drift.

Jurisdiction-specific legal review remains advisable; this engineering audit
is not legal advice.

### 12. Medium — Private downloads left a persistent Blanc activity ledger

**Status: remediated.**

- Download listeners distinguish regular and private sessions.
- Completed/cancelled private records stay in process memory and never enter
  `downloads.json`.
- The file explicitly saved by the user remains on disk.
- The download UI labels private entries; policy and private-mode copy explain
  the boundary.

### 13. Medium — Release provenance depended on one GitHub trust channel

**Status: implemented; public trust-anchor publication remains a release gate.**

- All GitHub Actions are pinned to full reviewed commit SHAs.
- CodeQL and Dependabot configuration were added.
- Native CI artifacts receive GitHub OIDC build-provenance attestations.
- Releases include a CycloneDX SBOM and checksums for the complete artifact set.
- `release.sh` creates a Sigstore bundle for `SHA256SUMS` and verifies exact
  expected certificate identity and OIDC issuer before publishing.
- `docs/release-verification.md` explains checksum, Sigstore, platform
  signature, and Linux limitations without presenting same-channel hashes as
  independent authentication.

The expected Sigstore identity and issuer must be fixed and published through
an independently served Blanc security page/release policy. Until then, the
bundle is evidence but not a publicly pinned trust anchor.

### 14. Low — The public site lacked defense-in-depth headers

**Status: remediated in site output; production response must be rechecked.**

`site/public/_headers` adds CSP, HSTS, `frame-ancestors 'none'`, restrictive
Permissions-Policy, nosniff, referrer policy, COOP, CORP, and cross-domain-policy
denial. `/.well-known/security.txt` receives explicit content/cache metadata.
The Astro build copies both files into the deploy artifact.

The current CSP retains `'unsafe-inline'` for application-owned JSON-LD and
style attributes. Moving to hashes/nonces is a future hardening opportunity,
not a reason to omit the rest of the policy.

### 15. Low — Homepage settings accepted arbitrary schemes

**Status: remediated.**

`normalizeHomepage` accepts only the empty start page, HTTP(S), or the exact
supported `blanc://newtab/` surface and is applied on read, write, and
navigation. Active/local/unknown schemes fail closed. Unit tests cover scheme
and migration cases.

### 16. Low — Browser patch and security automation cadence needed tightening

**Status: substantially remediated; continuous operations are required.**

- Electron moved from 43.3.0 to the current audited 43.x patch, 43.4.0.
- Dependabot covers npm and GitHub Actions.
- CodeQL runs security-extended JavaScript queries.
- Existing parity CI now covers the new security guards and full unit suite.
- Release output includes an SBOM and actual-binary fuse/signature assertions.
- `SECURITY.md` publishes urgent response targets.

The round-two live `npm audit --omit=dev --audit-level=high` result is zero
reported vulnerabilities. The same networked scan and review of any
browser/runtime advisory remain mandatory in CI/release. Browser patch
response is an ongoing operational commitment, not a one-time code change.

### 17. Low — Vulnerability-disclosure operations were minimally specified

**Status: substantially remediated.**

- `SECURITY.md` identifies the supported branch, acknowledgement/triage and
  critical/high remediation targets, coordinated-disclosure expectations,
  safe harbor, scope limits, sensitive-material handling, and release-integrity
  evidence.
- `site/public/.well-known/security.txt` publishes contact, expiry, language,
  canonical, and policy fields.
- The policy asks reporters to arrange protected transfer before sending
  exploit material or credentials in ordinary email.

A public PGP/age key, GitHub private-vulnerability-reporting confirmation, CVE
assignment runbook, and future bounty remain program-maturity follow-ups. They
do not block the code fixes but should precede a major security campaign.

## Canonical privacy data-flow inventory

The versioned source is
`security/network-data-inventory.json`. It includes ordinary browsing, search
navigation, suggestions, telemetry, sync, favicon sanitization, updates,
secure DNS, supporter activation, website release resolution, website
analytics, and newsletter enrollment. Each entry records trigger/default,
recipient, fields, retention, and owning code.

Any new endpoint, third-party recipient, persistent identifier, or
network-affecting default must update that inventory and the public privacy
policy in the same change. The unit guard enforces structure, referenced source
existence, approved defaults, major public claims, site headers, fuses, removal of
the credential SDK, and full-SHA action pinning.

## Product-owner decisions exposed by remediation

The owner ruled on the seven policy items individually:

1. **Approved — remove 1Password fill.** Runtime code, SDK, entitlement, and
   current-feature documentation remain removed; history and the personal-dev
   branch preserve the spike.
2. **Approved — remove arbitrary local HTML viewing.** The file-handler removal
   and top-level URL policy stand.
3. **Rejected — keep shipped telemetry/suggestion behavior.** Both fresh-profile
   choices are presented on, the user must save before either can send, existing
   profiles are not reset or re-asked, and the first-run version remains 1.
4. **Rejected — keep blocker scriptlets.** Hash-pinned bundled inputs stand;
   `installScriptletIsolation` is restored so scriptlets retain shipped efficacy.
5. **Rejected — keep shipped GA4 Consent Mode.** The site loads GA4 with
   analytics storage denied and restricted cookieless measurement before Allow.
6. **Approved as a separate project — Sync v2.** The protocol/client/Worker/
   Durable Object migration is absent from this reconciliation. SafeStorage key
   wrapping remains because it is independent and may ship first.
7. **Approved conditionally — Resend double opt-in.** Honeypot quarantine is
   restored and deployment is fail-closed on verified-domain status; production
   deployment still waits for domain verification and end-to-end proof.

The hardened favicon fallback/rasterization behavior and release/Worker/WAF
controls are technical remediation work, not additional policy reversals.

The quiet-tab glyph was **not** an approved policy change. Round one had deleted
`quiet-glyph.js`, removed the panel/rail glyphs, and rewritten the acceptance
contract instead of adding the asset to the new protocol allowlist. Round two
restores the shared Zzz glyph, adds `/quiet-glyph.js` to the exact
`blanc-chrome:` allowlist, restores the panel/rail rendering and original
perceivability checks, and aligns the feature contract with the existing design
specification.

The packaged first-run smoke now proves the real chrome document and Island
render before it reaches the policy checks, then asserts the approved checked
defaults and version-1 completion marker. The policy gate is no longer an
intentional red.

The Electron 43.4.0 patch bump is also a material release input and must be
listed explicitly in any approval/release summary, rather than riding inside a
generic remediation bundle.

## Mandatory production/release gates

The remediated version must not be promoted as audited or security-led until
all applicable items have evidence:

1. Keep Sync v2 out of this release. In its separate project, deploy its Worker
   first and pass disposable authenticated CRUD, conflict, rollback, wipe, and
   v1→v2 migration tests before releasing its client.
2. Verify the Resend domain, install the restricted Worker sending key, keep the
   full-access Resend domain-check key local to the deploy preflight, deploy only
   through `cloudflare/newsletter-worker/deploy.mjs`, and complete a real
   confirmation/quarantine/export/one-click-unsubscribe test.
3. Configure Cloudflare WAF/rate rules and billing notifications for ping,
   newsletter, and sync endpoints; inspect logs for sensitive fields.
4. Configure the exact Windows publisher and a complete signing path, then pass
   Windows 11 clean install, signature/SmartScreen, v1.0.3 upgrade, and updater
   tests.
5. Pass the new strict sealed-bundle check plus signed/notarized macOS clean
   install and v1.0.3 upgrade tests; verify fuses, protected-key migration,
   cookie compatibility, and Gatekeeper on the actual packaged binary.
6. Pass Linux AppImage install/launch, fuse, secure-credential-backend behavior,
   and update-manifest verification.
7. Fix and independently publish the expected Sigstore identity/OIDC issuer,
   then verify the public instructions from a clean machine.
8. Run the approved online dependency/advisory scan and resolve or explicitly
   assess every runtime/browser advisory.
9. Deploy the site and verify live CSP/HSTS/Permissions-Policy,
   `security.txt`, denied-storage GA4 Consent Mode, and newsletter behavior.
10. Commission a focused independent assessment of hostile web content,
    IPC/preload boundaries, favicon SSRF/rebinding, sync crypto/protocol,
    updater downgrade/provenance, private-mode residue, and packaged binaries.

## Residual risks and honest positioning

- Blanc inherits Chromium/Electron parser and renderer risk; rapid patching is
  essential.
- A same-user administrator or malware process can still read displayed data
  and exercise the user's authority; platform key wrapping is not a malware
  sandbox.
- No blocker catches every tracker or fingerprinting technique.
- Private browsing prevents Blanc persistence but cannot hide activity from
  sites, downloads left on disk, the network, employer, or ISP.
- The site CSP's inline allowances and Cloudflare KV's best-effort counters are
  accepted residuals with compensating controls.
- Regular-tab favicon sanitization's pinned Node resolver does not inherit
  Electron proxy/DoH settings; private tabs now suppress the extra request.
- Server-blind v1 sync protects content confidentiality, not availability or
  account-authority separation; a configured device remains the source of
  truth and authenticated v2 remains a separate accepted follow-up.

The defensible marketplace claim is:

> Blanc is a browser with a narrow, documented trust model: sandboxed pages,
> no extension runtime, deny-by-default permissions, pinned blocker inputs,
> documented user-controlled data features, protected encrypted sync, fail-closed signed
> releases, and public data flows continuously checked against the product.

Do not claim perfect privacy, anonymity, zero telemetry, independent
certification, or a completed production audit until the external gates above
are evidenced.
