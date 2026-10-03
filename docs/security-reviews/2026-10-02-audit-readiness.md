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
released build. Merged app/Worker source is
`90cdccebbf0ca2bd0d12c7d312c1be506183a527`. Focused PRs against protected main:

- [#471, CodeQL font-recipient guard](https://github.com/bnfy/blanc/pull/471).
- [#472, Windows update trust](https://github.com/bnfy/blanc/pull/472).
- [#473, Linux launch enforcement](https://github.com/bnfy/blanc/pull/473).
- [#474, sync v1 byte limits](https://github.com/bnfy/blanc/pull/474).
- [#475, assessment and evidence](https://github.com/bnfy/blanc/pull/475).

The initial candidate delivery performed no merge, release, production
deployment or independent retest. The later source-only squash-merge instruction
is recorded in [the authorization record](../release-incidents/2026-10-02-security-audit-source-merge.md);
release, deployment and independent retest remain separate pending milestones.
The pre-integration app/Worker candidate was
`88280bbea46e5a68b264741eb8461131e94d2e4a`, including post-review Windows
retry recovery. Prior native evidence at `610666e8` is retained as historical
evidence; it does not validate these later retry corrections.

## Findings and distinct milestones

| Finding | Source and isolated evidence | Residual / later milestones |
| --- | --- | --- |
| R1 Linux sandbox | Existing AppRun can add `--no-sandbox` on namespace-probe failure. Merged source rejects all seven unsafe switches shared with the desktop-entry verifier, including single-dash and assigned forms, before application modules or browser surfaces initialize. Permitted Linux calls official `app.enableSandbox()` before readiness. | Upstream launcher/runtime unchanged. Headless packaged matrix evidence is recorded below; real Ubuntu desktop session, affected-machine confirmation, release and independent retest remain pending. Public v1.25.0 is unchanged. |
| R2 Windows update verification | Source still accepted execution/parse failures at the public baseline. Locked electron-updater 6.8.9 bypasses its signature callback on cached installers and may skip it without publisher configuration. Merged source rejects errors, exceptions, malformed output, missing certificates/configuration. SHA-512 proofs bind expected publishers to bytes; cached completion must verify before UI/install-on-quit. Common synchronous install guard rechecks bytes. Fresh checks disarm any previously ready installer; both fresh and cached pending checks disable restart UI, and stale dialogs cannot install. Post-review fixes reset the restart latch on updater errors, evict definitively rejected cached installers, recheck in-process cache checksums and serialize cleanup before retry. Temporary verifier failures retain bytes; obsolete verifier results cannot evict a newer accepted installer. | 120-second timeout and publisher matching preserved. NSIS retains shutdown/relaunch ownership. Mocked tests do not prove production feed substitution or end-to-end exploitation. Signed staged Restart Now handoff beginning in public v1.25.0, affected-machine confirmation, release and independent retest remain pending. |
| R3 locator authorization | Unchanged by design: locator-only synthetic GET/PUT/DELETE works. AES-GCM still protects plaintext under the independent encryption key. | OPEN. Locator possession authorizes ciphertext retrieval, replacement and deletion. No separate credential, revoke/rotate migration or authenticated v2 exists here. v2 planning is neither acceptance nor closure. Keep explicitly disclosed in RFP. |
| R4 assessment documentation | Threat model refreshed from v1.17.0 to public v1.25.0 plus separately pinned merged source. Source-hashed preload/IPC inventory and network-counter retention corrected. | Merged documentation is not auditor approval. Dynamic channels and all payload/trust predicates require manual review. |
| R5 limits/concurrency | Merged source caps streamed PUT bodies at 513 KiB and serialized blobs at 512 KiB, in UTF-8 bytes. Declared oversize rejects early; actual stream cap cancels without blob storage. Tests cover boundaries, misleading lengths, chunking, Unicode, malformed JSON and legacy ciphertext. | PARTIAL SOURCE REMEDIATION, not deployed. Same-version writers can both succeed; one update can be lost. Pending write can recreate data after deletion. Coarse KV counters remain non-atomic. No guarantee of “no data loss.” |
| R6 operational evidence | Read-only GitHub protections and Worker deployment/version records inspected; expiring observation evidence preserved. Dependency gate passes with existing narrowly scoped VEX. | Native/UI failures and deployed-service/source linkage gaps below remain open. A green workflow is not an empty alert queue, deployed remediation or independent assessment. |

Electron's [sandbox documentation](https://www.electronjs.org/docs/latest/tutorial/sandbox)
and Cloudflare's [KV consistency documentation](https://developers.cloudflare.com/kv/concepts/how-kv-works/)
support the policy and residual atomicity limits. These source changes do not
patch or fork Electron/Chromium, alter app/signing identities, modify sync
account derivation/envelopes or move existing user data.

## Validation evidence

### Protected source integration

PRs #471–#474 were squash-merged after their current-head checks passed.
The merged code, scripts, tests, dependency manifests and workflows at
`90cdccebbf0ca2bd0d12c7d312c1be506183a527` are byte-identical to tested combined
candidate `469212495628bcde55d36bd42292e9479a900bb6`: lint, all 2,015 unit
tests and substrate passed. Hosted Windows/Linux modified-link checks passed;
the sync PR also passed its disposable local Worker-runtime smoke. The surface
inventory was checked against all 44 boundaries on merged source; all 10
registered preload entry points remain listed. Newer-main changes preserve
trusted opener sandbox/referrer state in main-process memory; they add no
literal IPC channels to these boundaries.

Current-main Linux branch `5982fb9a` also passed local macOS modified-link
validation (80 click/sandbox/referrer cases and three restricted-tab
recreations) and hosted Windows/Linux checks. Linux updater rehearsals
[37044854067](https://github.com/bnfy/blanc/actions/runs/37044854067) and
[37045662982](https://github.com/bnfy/blanc/actions/runs/37045662982) passed
on their recorded branch sources; logs/reports are preserved. The latter
includes Windows source integration. These hosted rehearsals do not establish
physical Linux desktop behavior or a staged Windows NSIS handoff. Earlier
private candidate evidence below retains its original source pins.

### Post-review Windows retry corrections

Two P2 review findings were reproduced with the locked updater: a synchronous
install rejection left the Restart Now latch set, and a corrupted in-process
cache was repeatedly selected without another download. Both are source-fixed
at `88280bbea46e5a68b264741eb8461131e94d2e4a`.

Lint and all 2,006 unit tests passed; substrate passed for these boundaries.
Sixteen targeted updater/restart regressions passed. Against unchanged pre-fix
source `17991f55`, the four new integration regressions had three expected
failures and one passing temporary-failure control. They use the real locked
DownloadedUpdateHelper, BaseUpdater download/install/quit methods and the app's
menu/restart flow. Signature, network and NSIS execution are synthetic; this
is not a native staged handoff. Recovery waits for cache cleanup, redownloads
bad bytes and reaches one silent force-run NSIS seam; valid temporary failures
recheck the existing cache. A separate supersession regression proves a delayed
bad signature cannot evict a newer accepted cached installer.

[Private Windows run 37040930798](https://github.com/bnfy/blanc/actions/runs/37040930798)
passed against this exact source: all 12 native Windows retry/trust regressions,
signing, real PowerShell verifier/cache, packaged payload/fuses/media and
installed protocol/browser registration gates. Its private artifact expires
October 5 and is preserved with logs in the follow-up evidence bundle.
Run 37040669963 was cancelled when its intermediate source was superseded;
it is not counted as completed validation. Physical-machine confirmation and
the signed staged Restart Now handoff from public v1.25.0 remain pending.

### Earlier readiness evidence

- The first implementation cut passed lint, full unit coverage and substrate: all 2,001 tests at
  `610666e87444094be1758044aa4652ba05429e06`, including fresh/cached pending
  UI and quit guards for a previously ready installer. Earlier 2,000-test runs
  are preserved separately.
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
- [Native verifier run 37034883292](https://github.com/bnfy/blanc/actions/runs/37034883292)
  at `34fe4dd6cbc00bd67ca293bcedb854e093c7edab` additionally passed the
  application's real PowerShell verifier against the signed installer, rejected
  unexpected publishers and missing files, and verified cached bytes before
  arming the install guard. The smoke delegates to a test installer seam; it
  does not claim an Electron Restart Now handoff.
- [Final pending-state native run 37036996853](https://github.com/bnfy/blanc/actions/runs/37036996853)
  at `610666e87444094be1758044aa4652ba05429e06` passed Windows signing,
  packaged gates, real verifier and cached-installer smoke after the final UI
  and previously-ready installer corrections. Restart Now during fresh/cached
  pending verification is covered by isolated runtime tests; a physical staged
  handoff is still pending.
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

CodeQL alert 61 was open in a test guard; PR #471 preserves the forbidden
font-recipient behavior without its URL-shaped regex. After squash merge, the
GitHub API reported `state: fixed`, with `fixed_at: 2026-10-02T18:12:13Z`
on main. This closes that specific test-file alert, not R1–R6 or an independent
audit finding. Dependabot alerts API reported disabled; update PR configuration is
not the same as enabled advisory alerts. Companion advisory
GHSA-86w9-cpqp-85rv remains unpatched upstream. The existing OpenVEX decision
specifically excludes adbkit's TCP-USB bridge AUTH_SIGNATURE/AUTH_RSAPUBLICKEY
node-forge verify path from Blanc's lint/build/sign/Safari-copy scripts and
packaged extension; web-ext's Android runner/client path is not used. Adding
Android/bridge execution invalidates that reachability decision. This is not
an upstream fix or blanket suppression. See the linked node-forge review and
security/openvex.json.

The v1 sync cipher helper receives only key/plaintext, sets no associated data,
and is called without store or server-version context. Source-confirmed lack of
that binding is an external-review question: cross-store/context replay and
rollback impact on each client merge path remain untested. Do not treat
AES-GCM payload authentication as storage authorization, context binding or
freshness; any protocol change needs a compatible versioned migration.

## Remaining acceptance gates

The owner subsequently requested source-only squash merges despite the
disclosed pending affected-machine checks, as recorded in
[the authorization record](../release-incidents/2026-10-02-security-audit-source-merge.md).
That instruction does not certify these checks or authorize a release or
production deployment.
Remaining work includes real Ubuntu 22.04/24.04 desktop sessions; signed staged
Windows Restart Now from public v1.25.0; native updater/cache/error recovery;
resolution/triage of existing macOS native-suite failures; deployed Worker
source/config/logging/access linkage; staging runtime validation and intentional
rollout of sync limits; atomic/authenticated v2 design and compatibility/migration
review; external scope authorization, audit freeze, third-party retest and
approved publication. Do not close a finding at a later evidence level merely
because its candidate source or synthetic test passed.
