# Side-by-side Mac Chromium preview release checklist

> October 22 reconciliation: [Decision 2 package](decision2-review-package-20261022.md) and [gate reconciliation](mac-preview-gate-reconciliation-20261022.md) define the finite closeout queue. Existing evidence is credited; final acceptance remains open. Fresh October 22 authoritative footprint is 58 files/137 hunks; see [provenance reconciliation](evidence/decision2-provenance-20261022/README.md). Earlier counters/source-absence statements are dated history. Latency deferred; Electron diagnostic build pending approval.

Working release plan — October 21, 2026. Status: **not release-ready**.

**Supporting checklist only.** The [Chromium migration implementation plan](../../docs/chromium-migration-implementation-plan-2026-10-16.md) is the primary plan. Its gates, ordering and evidence requirements govern; this checklist tracks a proposed Mac preview and cannot waive or reorder them. Update primary-plan status whenever an implementation checkpoint changes it.

This defines a proposed, limited public preview track, not approval to publish or a declaration that the migration gates have passed. The existing migration plan requires broader parity and Decision 2. Approve this narrower preview scope explicitly before distribution; do not silently relabel the existing beta/cutover gate. No reliable ship date until the blocking rows below have evidence and the candidate scope is frozen.

## Running Mac preview RC readiness

**Baseline: October 22, 2026; source/evidence checkpoint `9772330a`.**

`[■□□□□□□□□□□□] 1/12 launch gates cleared (8.3%) · Δ +1 L1`

This is a count of verified launch-gate acceptance, **not percentage of engineering completed, probability of shipping, or an ETA**. Extensive prototype implementation and bounded tests exist, but L1 has its explicit owner decision; artifact-bound rows remain open. The initial denominator is the existing L1–L12 checklist; it includes owner decisions and artifact approval. Decision 2 remains an upstream prerequisite and is not implied by the bar. The owner approved the prepared scope on October 22; see the scope approval record.

Scoring: one filled cell per fully accepted L-row, no partial credit for code written, test/checkpoint counts, CI jobs or repeated stress runs. A row requires the exit-record evidence below, including applicable candidate/artifact identity and approval. Reopen a cell if a relevant regression or candidate change invalidates its evidence. Any owner-approved scope/denominator change must be recorded explicitly, never used silently to inflate progress. This tracking-only metric supersedes the former blanket restriction on showing a percentage; it does not waive any gate or authorize new builds.

| Gate | Current acceptance status | Next evidence or decision |
| --- | --- | --- |
| L1 Scope/identity | **Accepted October 22** | [Owner approval](mac-preview-scope-approval-20261022.md); implementation verified under L2/L8 |
| L2 Isolation | Open — disposable prototype evidence only | Candidate install/coexist/restart/uninstall with original data unchanged |
| L3 Security/maintenance | Open — rebase evidence exists | Supported baseline, patch/dependency review and maintenance commitment |
| L4 Google extension upgrade | Open — external upgrade gate | Actual native version increase and required Google/restart/popup evidence; baseline remains separate |
| L5 Physical input/accessibility | Open — pending | Packaged native-input and VoiceOver session |
| L6 Recovery | Open — substantial bounded evidence | Frozen candidate recovery suite and recovery-UI acceptance |
| L7 Security/privacy | Open — scoped evidence only | Candidate boundary/privacy review and distribution free of diagnostic hooks |
| L8 Signed distribution | Open — unqualified | Signed/notarized/stapled artifact and quarantined clean-Mac acceptance |
| L9 Update/retreat | Open — policy/acceptance pending | Preview update/rollback proof or explicit manual-only policy approval |
| L10 Functional smoke | Open — feature-specific evidence | Enabled-feature inventory and frozen candidate smoke |
| L11 CI/audits | Open — no RC head frozen | Exact candidate checks/alerts/audits and runtime blocker disposition; no current CI claim here |
| L12 Readiness package | Open — not completed | Instructions, exclusions, feedback/privacy route and artifact-specific go/no-go |

**Next priority:** follow the primary plan: finish F12 request-path/current-head provenance and the Decision 2 package (visual comparison, physical-input/VoiceOver evidence and cost sheet), then resolve the proposed preview contract. Additional bounded lifecycle tests improve supporting evidence but do not independently clear L6 or increase the bar. Keep Google upgrade monitoring separate. Latency remains deferred; Electron diagnostic build remains pending approval/unstarted, neither counted as passed.

### Update log

| Date / checkpoint | Gates cleared | Change | Evidence and remaining blockers |
| --- | --- | --- | --- |
| October 22 / `9772330a` | 0/12 | Initial baseline | Latest private-only cross-profile cancellation evidence is recorded in the primary plan; all L1–L12 acceptance rows remain open |

For every future implementation update, include the bar and delta, link the new evidence, and name the next launch-blocking milestone. If only supporting tests improve, report `Δ 0 gates` and explain the specific progress. Update this table and the primary plan whenever a gate changes. A flat bar must not be disguised by changing weights or counting additional tests.

## Proposed first-preview contract

- Mac Apple Silicon first. Intel support is excluded until a native Chromium x64 artifact passes the same checklist; Electron CI on macOS Intel is not proof of that.
- Separate app name, bundle identifier, profile directory, update channel and download identity from shipping Blanc. Prove both apps can run together. Final identifiers must be chosen and checked, not inferred from the prototype.
- Fresh preview profile only. No automatic copying, migration, replacement or deletion of permanent Electron profiles. Any later importer is a separate qualification.
- Shipping Electron remains available and receives security fixes. Installing/removing the preview must not affect it or its tabs.
- Advertise only tested preview capabilities. Unqualified features must be visibly unavailable or explicitly limited; a disclaimer cannot excuse data loss in enabled features.
- Proposed included core: browsing, Island navigation/tab controls, regular/private windows, installed-extension management, Web Store install/update/removal, start-page/theme controls, and Spaces/Split View only after the release smoke below passes.
- No claim of full Electron parity, streaming-service certification, power-loss durability, performance superiority, or production profile migration.

## Launch blockers — execute in this order

All rows remain open until attached evidence identifies the candidate commit, artifact digest, architecture, OS, exact steps, result and residual limitations. Development checkpoints may inform a row but do not replace packaged-artifact acceptance.

| Priority / ID | Deliverable and acceptance criterion | Current evidence / next action | Responsible |
| --- | --- | --- | --- |
| P0 / L1 | Approve preview scope, supported macOS versions and Apple Silicon-only distribution; choose separate app/profile/channel identities. Explicitly record the relationship to Decision 2 and existing beta gates. | This checklist is a proposal. Freeze the feature list before more open-ended parity work. | Owner decision, agent prepares scope |
| P0 / L2 | Prove isolation: install alongside shipping Blanc, run both, open/close/restart each, remove preview; original app, settings, tabs and update ownership remain unchanged. Use controlled representative profiles, not the owner's permanent data. | Separate disposable tests exist; distributable identity/isolation is not yet signed off. | Agent + owner hand check |
| P0 / L3 | Establish supported Chromium security baseline and maintenance owner. Record upstream version/channel, relevant security fixes, patch inventory, dependency exceptions and a rehearsed incremental rebase/update path. | Rebase ledger exists; real Google upgrade gate remains open. Current developer build version alone is not release/security approval. | Agent + owner maintenance decision |
| P0 / L4 | Complete real Google-endpoint extension upgrade gate: authentic installed old version → offered newer version, native update, Google network evidence, enabled state, restart persistence and popup focus. Install, permission Cancel/accept and removal also pass on candidate. | Existing Bitwarden baseline/monitor must be preserved. A no-change callback or replacement install is not an upgrade. If no offer arrives, keep gate open; no mechanism-only fallback without separate owner decision. | Agent; owner only if consent/unlock required |
| P0 / L5 | Native physical-input and accessibility acceptance on packaged app: Island focus/typing, keyboard navigation/shortcuts, context menus, extension popup focus, permission dialogs, close/cancel, Split pane focus/divider and VoiceOver labels/order. No stuck focus or inaccessible destructive controls. | CDP/native automation is extensive but physical input remains pending. Schedule one bounded owner session after candidate stabilizes. | Owner physical check + agent evidence |
| P0 / L6 | Freeze and run one candidate recovery suite: ordinary/last-window close, beforeunload Cancel/Leave, multiwindow restart, Spaces round trip, active/inactive Split ratios/focus, Recently Closed, private restart exclusion, failed save refusal/retry and owner/profile teardown. Preserve acknowledged state; no unintended duplicates/resurrection. Inspect recovery UI without diagnostic bypass. | Recent focused fixes/tests pass boundedly, including automatic flush retry. Capped/shutdown results and subsequent recovery evidence have been published; they remain bounded development evidence. Select representative regressions and run once on candidate; investigate failures, not every conceivable interleaving. | Agent + owner recovery UI |
| P0 / L7 | Review privileged native/WebUI boundaries and privacy: untrusted web content cannot invoke host management APIs, private data is excluded from durable stores, permissions and profile scope respected, no test hooks/interposers/debug ports in distribution. Enumerate user-data locations and removal behavior. | Scoped checks exist; candidate-level security/privacy signoff still required. | Agent review + owner approval |
| P0 / L8 | Produce reproducible distributable: bundled assets/fonts, correct Sunrise branding, entitlements, Developer ID signing, notarization/stapling, Gatekeeper launch from quarantined download on a clean supported Mac. Verify extension installs/native integration in that signed identity; record checksum, SBOM and required release provenance. | Local prototype/incremental builds do not satisfy this gate. Use existing incremental outputs where supported; any new architecture/cold-build work needs a separate concrete plan. | Agent; owner signing access if needed |
| P0 / L9 | Provide a safe preview maintenance/retreat path. Prove preview-to-preview signed update and rollback using disposable profiles, or obtain explicit approval for a documented manual-update-only preview with version/security notice and withdrawal process. Shipping Electron updater must not target preview. | Electron-to-Chromium handoff is unproven and is not part of this isolated preview. Preview's own update policy still needs implementation/acceptance. | Agent + owner policy decision |
| P0 / L10 | Candidate functional smoke: navigation/back/forward, tabs/windows, downloads, find, zoom, settings, favorites/history, basic media, extension/theme apply/Undo/removal/restart. Any enabled import/sync/password-manager/native-host feature gets explicit qualification or is unavailable in this preview. | Feature-specific evidence exists; no blanket full-parity claim. Map each enabled surface to a test or exclusion. | Agent |
| P1 / L11 | Current-head CI and audits green, explicit CodeQL alerts reviewed, skipped jobs named; all known launch-blocking runtime failures closed. Archive candidate test report and artifact hashes. | PR #920 CI is useful but includes Electron jobs; it does not certify a native Mac release artifact. Recheck exact frozen head. | Agent |
| P1 / L12 | Publish readiness package: install/uninstall instructions, separate-profile warning, feature exclusions, known issues, feedback/crash-report route with privacy disclosure, support owner and withdrawal criteria. Owner performs final go/no-go on exact signed artifact. | Not yet prepared. Do not publish/merge/mark ready merely because checklist is created. | Agent drafts; owner approves release |

## Deliberately pending decisions and work

- **Latency: deferred. Do not run benchmarks.** Before public launch, the owner must explicitly decide whether measured performance is a preview gate or approve a preview without performance claims. Basic functional hangs/unusable responsiveness remain defects. This checklist does not waive any existing performance gate.
- **Electron diagnostic build: pending approval, unstarted.** Not authorized by this checklist. Determine whether any unresolved comparison actually requires it before presenting a separate build request. It is not automatically a dependency of an isolated Chromium preview.
- **Native physical input: pending.** Unlike broad hardening, L5 remains a launch blocker for the advertised controls.
- **Google upgrade gate: open.** Preserve its existing monitoring bound and authentic baseline; scope discussions do not close it.

## Follow-up hardening — not automatic preview blockers

These can follow a limited preview only when no known reproducible loss/security issue affects the enabled launch contract. Promote any such defect to L6/L7 immediately.

| Order | Follow-up | Boundary for preview |
| --- | --- | --- |
| H1 | Extended stress across simultaneous resize/save/close, same-value record replacement, long-lived retries and repeated shutdown interruption | Bounded launch regression suite must pass; no arbitrary-duration/power-loss guarantee |
| H2 | Historical orphan-record sweep, malformed/pruned history permutations and storage cleanup | Validate bounded safe handling first; any cross-profile leak, crash loop or unbounded growth is a blocker |
| H3 | Wider theme/localization/extension matrix, unusual layouts, uncommon policies and native-host combinations | Only tested capabilities advertised; accessibility of included controls still blocks |
| H4 | Cross-window whole-split drag, broader Glance parity, richer group/move menus and remaining feature polish | Hide unsupported actions; no false success or partial destructive behavior |
| H5 | Native Mac Intel, Windows and Linux distribution | Separate native build/sign/install/recovery acceptance per platform; existing Electron CI does not qualify it |
| H6 | Electron profile migration, shipping-updater handoff and replacement rollout | Required for cutover, not the proposed separate-profile preview; retain original migration gates |
| H7 | Broad comparative performance and diagnostic instrumentation | Latency remains deferred; Electron diagnostic build requires explicit approval |

## Immediate work queue

1. Prepare L1 scope/identity choices and a feature-to-test/exclusion inventory. Resolve scope with owner before scheduling release work.
2. In parallel with independent preparation, keep the existing Google upgrade monitor; prepare the bounded L5/L6 manual session and review L7 boundaries. No new build or test authorization is implied by this planning document.
3. Complete L2 isolation and L8 packaging plan, then produce/test the candidate under the appropriate explicit build/signing authorization.
4. Finish preview update policy and its tests (L9), run the frozen artifact suite once (L5/L6/L10), resolve concrete failures.
5. Verify exact-head CI/audits, assemble release notes/evidence, obtain final artifact-specific release approval.

## Exit record template

For each launch row: status (open/pass/blocked), owner, candidate SHA, artifact SHA-256, architecture/macOS, evidence path, exact outcome, remaining limitations, reviewer/date. A row passes only on its acceptance criterion. Do not convert a test's diagnostic checkpoint count into a pass count. Use the gate-count metric above for progress reporting. Do not estimate overall engineering percentage or a calendar ETA while scope and the external upgrade dependency remain unresolved.

References: [migration decisions and cutover gates](../../docs/platform-migration-electron-to-chromium-2026-10-04.md), [current rebase/evidence ledger](rebase-ledger.md), [implementation plan](tranche2-request.md).


### October 22 native visual/AX and local isolation checkpoint

[Bounded evidence](evidence/visual-ax-isolation-20261022/README.md): native/reference Find labels, matches and Escape focus pass; native settled address and private input checks pass. Native panel lacks reference secure-connection, Private, Spaces and Settings affordances. Capture dimensions differ across displays, so matched visual acceptance remains incomplete. Unique ad-hoc preview clone solves UI targeting and preserves dev two-tab order/selection; Google baseline stays separate. Final signed/fresh-profile isolation and VoiceOver remain open. `[■□□□□□□□□□□□] 1/12 (8.3%) · Δ 0 gates`. No build; latency deferred; Electron diagnostic build pending.
