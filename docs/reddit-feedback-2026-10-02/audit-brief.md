# Independent security audit preparation brief

Status: preparation only. No external audit commissioned, firm contacted, money
committed or completion date announced. Anthony J. Loria owns decisions and
release approval. AI assists implementation and security review; this brief and
the internal assessments are not independent review or external certification.

## Baseline and evidence

Public desktop **v1.26.0**, tag/source
`4624b229c1a50814c42714e6175902671497e391`, official unmodified Electron 44.5.1.
Use installed official packages for native testing. The completed
[release record](../release-incidents/2026-10-02-v1.26.0.md) is separate from
pre-publication candidate evidence. Public download checks authenticate bytes
and publisher; they do not certify architecture or absence of vulnerabilities.

The [maintainer assessment](../security-assessment.md),
[October 2 readiness continuation](../security-reviews/2026-10-02-audit-readiness.md),
[source-merge record](../release-incidents/2026-10-02-security-audit-source-merge.md),
[source-hashed boundary inventory](../../security/audit-surface-inventory.json)
and network-data inventory supply preparation evidence. Earlier records retain
their v1.25.0/source pins. This brief reconciles later v1.26.0 publication without
rewriting historical findings or calling them independently closed.

## Scope to price and authorize

| Area | Questions and requested review | Evidence / entry points |
| --- | --- | --- |
| Page isolation and IPC | Can hostile top/subframes, popups, opener families, modified links, internal-scheme navigation or stale views reach privileged operations? Validate sender, frame, document, profile and window ownership; fuzz payloads. Inspect held/quiet views and capture preload boundaries. | `main.js`, `tab-view.js`, `ipc-trust.js`, `pages-ipc-trust.js`, ten preload entry points and 44 inventoried boundaries; native sandbox matrix. |
| Permissions and native integrations | Check deny-by-default handling, private/held requesters, remembered origin decisions, capture lifecycle and revocation. Review external URL/file opening, clipboard, downloads, protocol handlers, macOS device-bound WebAuthn and user-invoked 1Password utility bridge. | `permissions.js`, capture state, onepassword policy/broker, entitlements and packaged fuses. Provider passkeys remain unsupported; no runtime fork permitted. |
| Profiles and private state | Attempt cross-profile/session access, popup adoption and deletion races. Check private history/session/workspace exclusion, crash residue, safeStorage, deletion markers and transient POST/page snapshots. Verify downloads remain on disk by design. | profile model/sessions/deletions, session-workspace, closed-tabs, tab-sleep, store and diagnostics. Windows/Linux native retesting needed. |
| Sync and services | Review locator-only v1 authorization, key derivation/encryption, ciphertext overwrite/deletion, weak-secret assumptions, concurrent writers and pending-write resurrection. Reconcile deployed Worker versions with reviewed source; assess body limits, rate controls, retention and operational access. | `sync.js`, `sync-crypto.js`, `tabsync.js`, Sync Worker, network inventory. Tab relay deployment/account mismatch also requires reconciliation. |
| Blocking | Verify pinned EasyList/EasyPrivacy inputs, compilation/caching, request and cosmetic integration, exceptions/private sessions, failure behavior and removal of remote scriptlet resources. Test missed-ad examples without claiming complete blocking. | `adblock.js`, `adblock/sources/pinned.json`, packaged-payload validator, coverage/integration regressions. |
| Updates and release integrity | Assess Windows fresh/cached installer verification, restart/quit races, Linux replacement, macOS signatures/profile/notary and distribution metadata trust. Examine dependency/SBOM/VEX decisions, CI permissions, immutable assets, checksum-manifest authentication and pinned signer identity. | updater, Windows verifier, release.sh, exact-tag workflows, package hooks, manifest validator and completed v1.26.0 evidence. |

Manual source/architecture review, desktop/backend penetration testing and
remediation retesting should be separately priced deliverables. Request severity,
reproduction steps, affected versions/platforms, remediation guidance and an
auditor-approved public summary/report. Ask the auditor to state limitations.

Use disposable profiles, synthetic secrets and a separately authorized staging
service. Do not test real user records, payment providers, credential managers
or third-party infrastructure without separate written authorization. Define
builds, accounts, endpoints, load limits and disclosure handling before testing.

## Findings inventory: shipped, merged and unresolved

Original R1–R6 identifiers are retained. “Shipped” describes remediation in
the public app; it does not mean independently retested or risk accepted.

| Finding | Current status at v1.26.0 | Remaining evidence/work |
| --- | --- | --- |
| R1 Linux sandbox fallback | Desktop refusal/enforcement shipped in v1.26.0. Hosted Ubuntu 22.04/24.04 kernel/launch checks passed. | Physical desktop checks were explicitly waived for this release, not passed. Restricted systems may refuse browsing. Independent native review/retest remains. |
| R2 Windows update trust | Fresh/cached signature, byte binding, install guards and retry corrections shipped in v1.26.0. Exact-tag native checks passed. Owner confirmed adjacent public Restart Now and exit/relaunch. | Independent feed-substitution/race testing and retest remain. Earlier private candidate runs stay version-bound. |
| R3 Sync locator authorization | OPEN and unchanged: locator possession authorizes ciphertext GET/PUT/DELETE. AES-GCM protects plaintext under its independent key. | Separate credential, revocation/rotation and migration design required; encryption does not solve storage authorization/durability. |
| R4 assessment/inventory | Refreshed maintainer assessment and source inventory merged. Font-recipient guard shipped with desktop source. | Validate hashes against the audit candidate; manually review dynamic channels and authorization predicates. Documentation is not auditor sign-off. |
| R5 size limits and concurrency | Request-size limits merged in Worker source, **not deployed**. Same-version writers can both succeed; pending writes can recreate deleted data. KV counters remain non-atomic. | Deploy/source-link limits under a separate authorized delivery; design atomic concurrency/deletion guarantees. No “no data loss” claim or closure. |
| R6 operational/native evidence | v1.26.0 macOS/full desktop suite and exact-tag public/package checks passed; earlier readiness UI failures keep their historical record. | Reconcile deployed Sync source, tab-relay account/name mismatch, effective logging/WAF/access/alerts and unresolved alert triage. Physical Linux evidence still absent. Independent audit remains pending. |

Before requesting proposals, refresh this inventory against the actual audit
candidate and current service deployments. Export operational evidence without
secrets; preserve expiring native logs/artifacts. Do not resolve a finding solely
because a workflow passed or a PR merged.

## Scope and funding proposal next step

Prepare a bounded statement of work with platform coverage, desktop and service
source pins, staging setup, required reports and a remediation/retest allowance.
Obtain itemized proposals and funding options; Anthony reviews scope, costs and
provider independence before any commitment. Announce a date only after a
separate owner decision and a commissioned engagement. No spending is authorized
by this preparation brief.
