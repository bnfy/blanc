> October23 owner input: [native pane clicks repaired, border stack removed](evidence/l5-native-pointer-20261023/README.md). Owner confirms pane clicking/typing; full L5 remains open. Close-history acknowledgement warning reopens L6:6/12, delta-1.

> October23 L5 repair: [theme actions exposed as native buttons](evidence/l5-theme-accessibility-20261023/README.md); signed keyboard, AX and focused regression checks pass. Full owner input/VoiceOver acceptance remains open; 7/12, delta 0.

> October23 L10 update: [signed functional smoke accepted](evidence/l10-functional-smoke-20261023/README.md); current readiness 7/12. Theme-action AX defect keeps L5 open.

> October23 L6 update: [49 signed checkpoints and owner mapped-UI acceptance](evidence/l6-signed-acceptance-20261023/README.md) close L6; current readiness 6/12.

> October23 prior closeout: [L3 accepted](evidence/l3-closeout-20261023/README.md) and [owner L7 accepted](evidence/l7-owner-acceptance-20261023/README.md); 5/12 gates. Historical starting-state rows below retain their date.

# Mac preview gate reconciliation — October 22, 2026

Source checkpoint `8b421954`, [primary plan](../../docs/chromium-migration-implementation-plan-2026-10-16.md), [launch criteria](mac-preview-release-checklist.md). Existing runtime evidence is credited below without equating historical fixtures with a signed candidate.

**Progress:** four review documents prepared (reconciliation, Decision 2 packet, cost sheet, scope proposal). These are completed authoring deliverables, not four accepted launch gates. Final sign-offs: `[■□□□□□□□□□□□] 1/12`. No gate is reset by this reconciliation; L1 now has its owner approval record; artifact-bound gates remain open. Future updates report the specific accepted prerequisite and remaining criterion, not just this bar.

| Gate | Existing work credited | Exact remaining closure action / responsible role |
| --- | --- | --- |
| L1 scope | **Accepted:** concrete side-by-side proposal and [owner decision](mac-preview-scope-approval-20261022.md) | Closed as scope decision; artifact and Decision 2 acceptance remain separate. |
| L2 isolation | Disposable native profiles and preserved shipping profile practice | Engineer tests proposed packaged identity: coexist, restart, uninstall; compare shipping profile/tab/update state before/after. |
| L3 security/maintenance | Measured rebase, native patch design and inventory records | Owner assigns primary/backup; engineer verifies supported security revision and candidate inventory/audit, records maintenance and withdrawal policy. |
| L4 Google upgrade | Authentic install/restart baseline recorded separately | Wait for authentic newer version, then native update/network/enabled/restart/popup proof. No synthetic substitute; monitor separately. |
| L5 native input/accessibility | CDP geometry, menus, extension/theme/permission and close evidence | One physical-input/VoiceOver and matched visual session; fix only actual failures. |
| L6 recovery | Extensive session, ratio, close-cancel, write-retry, owner/profile lifecycle evidence | Freeze candidate and run bounded list below; reuse mapped historical adverse-condition evidence. No indefinite mutation matrix. |
| L7 security/privacy | [Signed repair](evidence/l7-security-repair-20261023/README.md): 80 runtime/37 source checks; both diagnostic findings resolved | **Accepted:** [owner L7 approval](evidence/l7-owner-acceptance-20261023/README.md) of exact replacement `4c86c89e7ec8` |
| L8 distribution | Prototype build guard/assets/branding implementation | Reproducible signed/notarized/stapled artifact; clean quarantined Mac Gatekeeper/install/extensions test, digest/SBOM/provenance. |
| L9 updates/rollback | Explicit manual-only proposal | Owner approves policy; operator rehearses replacement/backup/rollback in isolated profile and proves shipping channel separation. |
| L10 functionality | Store/themes/Spaces/Split implementation and bounded fixtures | One candidate smoke of enabled features; unsupported controls unavailable. |
| L11 CI | Prior PR checks and focused fixtures | Current candidate SHA: all required checks, explicit skips, CodeQL/audit review; hosted Electron jobs do not prove native parity. Not checked in this documentation task. |
| L12 go/no-go | Review packet and scope now written | Operator compiles artifact-bound report, instructions, known issues, feedback/privacy and withdrawal policy; owner approves exact artifact. |

## Bounded candidate acceptance session

Record source/upstream SHA, app/framework/assets hashes, signature, OS/architecture and profile identity before testing. Use disposable profiles and representative test tabs, never permanent profile copies.

1. Install alongside shipping Blanc; open both, restart preview, uninstall/reinstall preview and confirm shipping tabs, profile and update identity unchanged.
2. Navigation/back/forward, tabs, find/zoom, download, favorites/history/settings, basic media, private window; confirm unsupported integrations absent.
3. Store install with permission safety delay; Cancel and accept; native popup focus; theme apply/Undo/Remove Cancel/Remove; four Customize tabs and readability; clean restart persistence.
4. Close ordinary/last tab, beforeunload Cancel/Leave; multiple windows, Spaces round trip, two-pane ratio/focus, Recently Closed without duplicates; clean restart and one acknowledged crash recovery; private exclusion.
5. Reuse failure/retry evidence only after source mapping. One candidate failed-save/retry/teardown control where affected paths changed; no extra permutations without a concrete failing criterion.
6. Five matched visual states plus keyboard, pointer and VoiceOver focus/labels. Record pass/fail separately from automated results.
7. Security/distribution checks, exact-head CI and artifact report. A material failure blocks its gate; repair, then rerun the affected case and dependencies, not the entire historical matrix by default.

## Follow-up hardening, not automatic new launch work

Arbitrary load, endless restart counts, extra mutation interleavings, power-loss guarantees, additional platforms and excluded feature parity remain separate work. An observed security defect or data-loss bug in an enabled feature is always a blocker. Original three-platform beta/cutover gates remain unchanged; this proposal does not silently reclassify them.

## Priority and dependencies

**Now:** owner scope/maintenance decision; prepare existing-app visual/VoiceOver session; source-map the F12 evidence to a candidate. **Next:** isolated signed candidate, one acceptance session, exact-head CI/report. **External:** authentic Google upgrade. **Deferred by owner:** latency and Electron diagnostic build. Stop broad prefetch lifecycle expansion unless reconciliation reveals a specific unmet criterion.
