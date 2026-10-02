# October 2 security-audit readiness continuation

This is maintainer/internal evidence, not an independent audit, an exploitability
assessment, or acceptance of residual risk. The original R1–R6 identifiers and
October 2 v1.25.0 baseline remain intact. The commissioning shortlist remains
Trail of Bits and NCC Group; architecture review, manual source review,
desktop/backend penetration testing, remediation retesting, and an
auditor-approved public report or executive summary remain required. No firm
has been contacted through this work.

## Baselines and review units

Public desktop: v1.25.0, `ff55d5948f5c71e802ba2ac464659ef96e055ca9`.
Planning inspected main `fc1eda0870bb24cbf433de580cc5abe88b0f572e`.
Implementation started from newly fetched main
`5b8fa03bda00cbd7fbcafba16384e63c7e85ff9a`, which already included the scoped
node-forge VEX decision. The older dirty primary checkout was preserved.

The integrated implementation revision is recorded by
[the surface inventory](../../security/audit-surface-inventory.json); its hashes
pin the reviewed source rather than implying the documentation commit is a
released build. Independent draft PRs against protected main:

- [#471, CodeQL font-recipient guard](https://github.com/bnfy/blanc/pull/471).
- [#472, Windows update trust](https://github.com/bnfy/blanc/pull/472).
- [#473, Linux launch enforcement](https://github.com/bnfy/blanc/pull/473).
- [#474, sync v1 byte limits](https://github.com/bnfy/blanc/pull/474).

No merge, release, production deployment or independent retest occurred.
The source identity in the inventory is the implementation revision with all
current app/Worker changes; later CI and documentation commits do not alter
those hashed boundaries.

## Findings and distinct milestones

| Finding | Source and isolated evidence | Residual / later milestones |
| --- | --- | --- |
| R1 Linux sandbox | Existing AppRun can add `--no-sandbox` on namespace-probe failure. The candidate rejects all seven unsafe switches shared with the desktop-entry verifier, including single-dash and assigned forms, before application modules or browser surfaces initialize. Permitted Linux calls official `app.enableSandbox()` before readiness. | Upstream launcher/runtime unchanged. Headless packaged matrix evidence is recorded below; real Ubuntu desktop session, affected-machine confirmation, release and independent retest remain pending. Public v1.25.0 is unchanged. |
| R2 Windows update verification | Source still accepted execution/parse failures at the public baseline. Locked electron-updater 6.8.9 bypasses its signature callback on cached installers and may skip it without publisher configuration. Candidate rejects errors, exceptions, malformed output, missing certificates/configuration. SHA-512 proofs bind expected publishers to bytes; cached completion must verify before UI/install-on-quit. Common synchronous install guard rechecks bytes. | 120-second timeout and publisher matching preserved. NSIS retains shutdown/relaunch ownership. Mocked tests do not prove production feed substitution or end-to-end exploitation. Signed staged Restart Now handoff beginning in public v1.25.0, affected-machine confirmation, release and independent retest remain pending. |
| R3 locator authorization | Unchanged by design: locator-only synthetic GET/PUT/DELETE works. AES-GCM still protects plaintext under the independent encryption key. | OPEN. Locator possession authorizes ciphertext retrieval, replacement and deletion. No separate credential, revoke/rotate migration or authenticated v2 exists here. v2 planning is neither acceptance nor closure. Keep explicitly disclosed in RFP. |
| R4 assessment documentation | Threat model refreshed from v1.17.0 to public v1.25.0 plus separately pinned candidate. Source-hashed preload/IPC inventory and network-counter retention corrected. | Candidate documentation is not auditor approval. Dynamic channels and all payload/trust predicates require manual review. |
| R5 limits/concurrency | Candidate caps streamed PUT bodies at 513 KiB and serialized blobs at 512 KiB, in UTF-8 bytes. Declared oversize rejects early; actual stream cap cancels without blob storage. Tests cover boundaries, misleading lengths, chunking, Unicode, malformed JSON and legacy ciphertext. | PARTIAL SOURCE REMEDIATION, not deployed. Same-version writers can both succeed; one update can be lost. Pending write can recreate data after deletion. Coarse KV counters remain non-atomic. No guarantee of “no data loss.” |
| R6 operational evidence | Read-only GitHub protections and Worker deployment/version records inspected; expiring observation evidence preserved. Dependency gate passes with existing narrowly scoped VEX. | Native/UI failures and deployed-service/source linkage gaps below remain open. A green workflow is not an empty alert queue, deployed remediation or independent assessment. |

Electron's [sandbox documentation](https://www.electronjs.org/docs/latest/tutorial/sandbox)
and Cloudflare's [KV consistency documentation](https://developers.cloudflare.com/kv/concepts/how-kv-works/)
support the policy and residual atomicity limits. These source changes do not
patch or fork Electron/Chromium, alter app/signing identities, modify sync
account derivation/envelopes or move existing user data.

## Validation evidence

- Final integrated lint and full unit coverage: all 2,000 tests passed at
  `7ac039fce28978f845f5acca52bd91a14f79f454`.
- Local locked Wrangler 4.144.0 test harness passed sync legacy responses,
  conflicts, malformed JSON, Unicode and chunked request limits, unchanged
  ciphertext after rejection and locator-only deletion, using disposable KV.
- Substrate, acceptance dry-run (168 scenarios), macOS DNS and site/SEO build
  passed. Companion Firefox lint reported zero errors/warnings and produced
  its archive. Its optional web-ext update-check warning did not fail either
  command; no Firefox signing/submission occurred.
- Candidate full macOS desktop suite: 165/168 scenarios passed. Profile
  deletion, the following secondary-window scenario, and credential capsule
  native focus failed. OAuth: 1/2 passed, failing popup native focus/target.
  Unchanged main reproduces OAuth plus profile deletion and capsule focus
  failures; the isolated secondary-window baseline scenario passes. The
  secondary-window failure in the full run may be fallout from pending
  deletion, an inference requiring investigation. These are unresolved gates,
  not silently waived or evidence of a demonstrated cross-profile exploit.
- [Private native run 37032129973](https://github.com/bnfy/blanc/actions/runs/37032129973),
  integrated source `1a79ab0b6f819aaa5d503811816f3316919f3363`, passed ordinary
  Windows signing/packaging and Linux AppImage gates. This is a private
  candidate carrying package version 1.25.0, not the public v1.25.0 binary.
- [Expanded run 37032406703](https://github.com/bnfy/blanc/actions/runs/37032406703)
  exposed a harness cleanup bug: matching `/blanc` anywhere in arguments also
  matched the harness. Fixed by matching the executable token, with a
  regression. Its partial refusal record is not a passed matrix.
- [Corrected run 37032709736](https://github.com/bnfy/blanc/actions/runs/37032709736),
  source `27f12d4696cd4d1b17f16fe52d3c0dbc63c6e6c1`, passed and verifies direct AppImage,
  GTK desktop entry, nested launcher and extracted executable. The Ubuntu
  24.04 job passed: all allowed paths had five renderers, each with separate
  user/PID namespaces, seccomp mode 2 and NoNewPrivs 1. Restricted paths and
  21 explicit unsafe-switch variants had zero renderers and zero synthetic
  loopback browsing requests. Benign `--no-sandbox-helper` launched sandboxed.
  Ubuntu 22.04 also passed, with the same five sandboxed renderers on each
  allowed path and no renderers/loopback requests on refusals. Xvfb/DBus is a virtual
  desktop test environment, not a physical interactive desktop confirmation.

- [Final Windows validation 37033670236](https://github.com/bnfy/blanc/actions/runs/37033670236)
  at `7ac039fce28978f845f5acca52bd91a14f79f454` passed native signing,
  fuses, packaged blocker/compliance/media and installed protocol/browser
  registration gates. Its signed candidate artifact expires October 5;
  preserved bytes and windows-signature.json are in the private evidence bundle.
  This is not the staged Restart Now handoff from public v1.25.0.
- Required checks passed on the four focused implementation PRs. Windows PR's
  wallpaper resource-settlement assertion failed once then passed on a targeted
  retry; only bundled Sunrise images were still loading, and OAuth itself
  passed. The initial failure remains in the evidence record. Private Linux
  updater rehearsal [37034295034](https://github.com/bnfy/blanc/actions/runs/37034295034)
  from public v1.25.0 passed the private staged AppImage replacement/restart
  rehearsal at `318bec99c78f320379ba81213679d44da67a7f5d`. This supplements
  sandbox kernel evidence and does not supply a physical desktop confirmation.

Prior hosted observation [36901972196](https://github.com/bnfy/blanc/actions/runs/36901972196)
used candidate source `ba6eb6fc` with harness commit
`3bc577c5f7b0b7eefddd498c9d03f4c08c091172`. Restricted direct/menu launches
had four renderers, none sandboxed; allowed launches had four, all sandboxed.
This was inspected hosted evidence, not a fresh public v1.25.0 test. Artifact
`11182681003` was downloaded before its October 15 expiry, with raw records,
logs and a local digest manifest preserved alongside the assessment package.

## Source inventory and trust boundaries

The inventory lists all 10 preload files and literal IPC channel references
with source hashes. It is a review aid, not an assertion that every operation
is authorized. Review registration and payload validation in context:

| Surface | Capability / authority and evidence |
| --- | --- |
| Island, overlay and permission chrome | `preload.js` exposes tab/window/workspace/profile/navigation operations to exact owned `blanc-chrome://` documents. `ipc-trust.js`, chromeHandle/chromeOn and sender-derived runtime ownership gate main-frame IPC. |
| Internal `blanc://` pages | `tab-preload.js` exposes host-specific settings, Favorites, history, downloads, sync, Patron, handoff and utility operations. `pages-ipc-trust.js`/`pages.js` recheck current owned WebContents, host, frame and session. Ordinary external pages receive no internal-page bridge. |
| Credential status capsule | `fill-status-preload.js` exposes show/hide and a narrow reply capability; main binds the reply to the pending fill request. |
| Ordinary tab session instrumentation | `chrome-compat-preload.js`, `webrtc-audio-buffer-preload.js`, `badge-api-preload.js` and platform-selected `capture-preload.js` / `capture-preload-linux.js` / `capture-preload-playout.js`. Capture-mainworld reexports inline instrumentation; hostile page instrumentation is display input, not permission authority. Sender, frame, live-document, capture grant and held-view checks require review. |
| Linux display capture helper | `display-capture-helper-preload.js`; controlled helper receives a bounded capture control contract. OS/portal behavior remains native audit scope. |
| Sessions | Personal retains Electron default persistent session. Named profiles use `persist:blanc-profile-<id>`; private sessions `private-browsing` / `private-browsing-<id>` have no persist prefix. Chrome uses in-memory `blanc-chrome`. Temporary import sessions are destroyed on exit paths. Review popup/adopted/held/quiet view ownership, profile deletion markers and legacy cleanup. |
| Native authority | Permissions/capture, file dialogs/download execution, external app callbacks, protocol handlers, clipboard, default-browser integration, macOS Touch ID WebAuthn and user-invoked 1Password Plugin utility process. Restricted entitlements/profile/signing gates and Plugin-only library-validation exception remain in scope. No custom Electron runtime. |
| Sensitive storage | Root/named-profile history, Favorites, downloads, remembered permissions, Electron cookies/cache/site storage, session/workspace/profile metadata, device settings and Patron state; sync key wrapped by safeStorage (rejects insecure Linux backend); updater log/cache. Quiet/closed-tab page state/POST snapshots and returned credentials are bounded transient main-process memory. Confirm private mode, crash residue and profile wipe natively. |
| Services/recipients | Sync KV, tab-import Durable Objects/MCP, ping/event/download measurement, newsletter/Resend and Pages/site analytics. Desktop also reaches selected sites/search suggestions, chosen DNS, GitHub update assets, favicon sources and Polar/1Password integrations. Complete payload/default/retention map: network-data-inventory.json. No testing authorization for external providers' infrastructure is implied. |

## Read-only operational observations and gaps

Observed with cached Wrangler 4.146.0 on October 2; production was not changed.
The following version IDs were each deployed at 100% in the last deployment:

| Worker | Deployment ID | Version ID / observation |
| --- | --- | --- |
| blanc-sync | `ea394d05-54bb-495a-9459-b75e8e9bf852` | `a8f81a1c-1faa-4ec2-a47b-40aca4127163`, August 9. Deployed SYNC KV binding matches repo namespace; script etag `9ba8d70623c0bdd9e8996a0803368740a23bee4c30882a06e57e64ed41e83700`. No source SHA annotation; exact source linkage pending. New limits are not deployed. |
| blanc-ping | `a9daf393-b138-4b3c-8b67-8c0cfde359f0` | `c5fee10c-1c82-487b-bbfb-2cd039db7517`, August 31. Repo enables Workers Logs and best-effort 250,000/day cap. Effective logging, WAF and billing alerts need separate control export. |
| blanc-newsletter | `b7788d42-ad63-4c30-9bb6-732c95d4f5d9` | `f4c5e036-000d-4720-ae36-e48e2823b27d`, September 2. Repo enables logs and ambassador limiter 4/min. Effective logging, secrets/access and all route-level caps require verification. |
| blanc-tab-import | unresolved | Cloudflare returned 10007: configured Worker does not exist in authenticated account. This is a deployment/account/name mismatch requiring reconciliation, not proof the public relay is absent. |

Raw deployment/configuration exports contain identifiers, not secret values or
stored user records. Source claims about retention do not establish Cloudflare
log controls. Sync has only coarse 120/IP/minute and 30/account GET/minute KV
counters; distributed abuse, guessing, WAF/global quotas and billing alerts
remain operational gaps. Account/IP counter retention was corrected in the
network inventory.

Main protection readback requires PRs, strict up-to-date checks `substrate`,
`acceptance-wiring`, `oauth-compatibility`, `javascript` bound to GitHub Actions
app 15368, admin enforcement and conversation resolution; force push/deletion
are disabled. Required approval count is zero for the sole maintainer. CodeQL
merge ruleset `23236533` was observed. Signing ownership is still concentrated
in the maintainer's Apple/Windows/GitHub/Cloudflare identities. Secret names
were inventoried without values; access grants, second-operator recovery,
certificate/profile rotation and service backup/rollback exercises require
owner and auditor review. Existing release recovery procedures are in
release-verification.md and dated release incidents. Procedural release
immutability must not be represented as an enabled GitHub immutable-release
setting; API readback reported false.

CodeQL alert 61 was open in a test guard; candidate preserves the forbidden
font-recipient behavior without its URL-shaped regex. Closure needs main
analysis. Dependabot alerts API reported disabled; update PR configuration is
not the same as enabled advisory alerts. Companion advisory
GHSA-86w9-cpqp-85rv remains unpatched upstream. The existing OpenVEX decision
specifically excludes adbkit's TCP-USB bridge AUTH_SIGNATURE/AUTH_RSAPUBLICKEY
node-forge verify path from Blanc's lint/build/sign/Safari-copy scripts and
packaged extension; web-ext's Android runner/client path is not used. Adding
Android/bridge execution invalidates that reachability decision. This is not
an upstream fix or blanket suppression. See the linked node-forge review and
security/openvex.json.

## Remaining acceptance gates

Keep PRs draft until affected-machine confirmation is obtained for sensitive
platform changes. No merger/release waiver has been requested or given.
Remaining work includes real Ubuntu 22.04/24.04 desktop sessions; signed staged
Windows Restart Now from public v1.25.0; native updater/cache/error recovery;
resolution/triage of existing macOS native-suite failures; deployed Worker
source/config/logging/access linkage; staging runtime validation and intentional
rollout of sync limits; atomic/authenticated v2 design and compatibility/migration
review; external scope authorization, audit freeze, third-party retest and
approved publication. Do not close a finding at a later evidence level merely
because its candidate source or synthetic test passed.
