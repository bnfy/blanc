## Owner acceptance — L12 GO

The owner explicitly approved the measured operating plan, F12/Decision 2 and L12 GO for signed Chromium158.0.8127.2 source0353d3e33443fc54fbc75dea0bbe0bd1d009e374, archive SHA-25608e34d602a46a6c381421850eb09ed5c05e73b1ac5221f8cc69054677b717f8e. All12 Mac-preview evaluation gates are accepted in their documented scopes. The approved available-load timing policy applies; existing-resource allocations and active chat minutes remain unpriced/unmeasured as disclosed. This authorizes neither merge nor public publication or full migration. Next: Chromium visual and feature parity against shippingv1.44.1, preserving157fallback and the separate Google baseline.

# Chromium 158 launch-gate closeout for owner decision

**L12 remains NO-GO pending final review and owner decision.** This packet follows the owner's explicit authorization to repair the isolated reference and to run timing under available load without a 90% idle admission threshold. It does not rewrite historical results or request a new waiver.

## Exact candidate

Chromium **158.0.8127.2**, source **0353d3e33443fc54fbc75dea0bbe0bd1d009e374**. Archive **Blanc-Chromium-Preview-158.0.8127.2-0353d3e3-arm64.zip**, SHA-256 **08e34d602a46a6c381421850eb09ed5c05e73b1ac5221f8cc69054677b717f8e**. Apple accepted **58770fc8-39eb-4acd-8884-b9f0bddb6534**. [Candidate evidence](../chromium158-staging-20261028/signed-candidate/README.md) records Developer ID, notarization/staple, Gatekeeper, authenticated manifest, and 460-file/5-symlink readback. The 157 fallback is preserved.

## New evidence resolving the prior technical gaps

- [Native 158 timing](../l12-chromium158-timing-20261028/README.md): all 312 page validations, prescribed warm-up plus five repetitions per profile; median p99 **4.544 ms regular / 3.367 ms private**, both below 5 ms. This uses native hook-to-applied-decision timing and source-matched assets. It is an available-load run, not an idle-qualified result.
- [Reference repair](../l12-reference-repair-20261028/README.md): formerly disputed protective outcomes now pass without weakening Chromium. The final correction also passes disable/re-enable and site-exception cleanup. Exact corrected source is authenticated; the original 1.36.0 reference is retained unchanged. The final corrected-reference corpus passes all 312 page validations and 12 full repetitions, with source hashes matching the authenticated correction. Two regular/private stability repetitions pass all 112 browser assertions; four direct cleanup checks pass.
- [Genuine 158 rebase](../chromium158-staging-20261028/source-snapshot-verification.json): 78 tracked upstream files/170 hunks plus 23 added source files, with all source hashes verified; 75 native affected checks and 11 signed checks passed. This is a real major-version update, not a dummy rebase for accounting.
- [Measured cost/effort worksheet](../../decision2-cost-sheet-20261022.md): recorded staging-to-build window **4h06m33s**, build-wrapper time **2h53m**, and direct owner confirmation of **no hands-on work outside this chat and no new paid runner/service/hardware charge**. Active chat minutes and existing-resource allocations are not invented. This supplies the original §2 staffing/CI cost sheet with the measurements and owner confirmation now available; unknown allocations remain explicitly unpriced.

## Preserved scope and decision boundary

L1–L11 retain their previously accepted Mac-preview scope and source-mapped unchanged owner checks. No new Safari/VoiceOver/physical-input observation is claimed for unchanged controls. Changed 158 paths have the affected checks above. Google upgrade evidence remains separate. Broad Electron builds, public publication, merge, automatic shipping-channel retargeting, and full three-platform migration are not authorized here.

The maintainer remains Anthony Loria on existing Macs, with no new paid services proposed, security review/withdrawal policy and the two-owner-day/one-calendar-week stop rules retained. Recorded elapsed time is not an active-labor measurement. Known Electron sandbox and companion-tooling CI failures remain repository merge blockers outside the approved native-preview L11 scope; no branch-protection bypass is requested.

The corrected-reference corpus run and frozen-source verification are complete. The owner must now explicitly accept the operating plan and approve L12 for this exact candidate. This is a go/no-go decision for the already approved separate Mac preview, not permission to publish or merge. The earlier NO-GO decisions remain valid historical records.

## CI review

The candidate-evidence head `dfbe4d7ad4420e6f285353a02467ee3e032a85b2` has a successful CodeQL result with no new alerts. Its three failed jobs were inspected: both modified-link tests report the existing Electron `allowed` versus `SecurityError` sandbox defect, and substrate reports the known companion `addons-linter` advisories. No Chromium failure was identified; three other jobs were still running in this snapshot. Raw diagnostics are included here. This is not an all-green claim or a result for a later evidence commit.

## Decision requested

Approve the measured existing-Mac operating plan, F12/Decision 2 and L12 GO for source `0353d3e33443fc54fbc75dea0bbe0bd1d009e374`, archive SHA-256 `08e34d602a46a6c381421850eb09ed5c05e73b1ac5221f8cc69054677b717f8e`. The owner-directed available-load timing policy applies; actual idle is retained. Existing resource allocations and active chat minutes remain explicitly unpriced/unmeasured, while actual new infrastructure spending and external hands-on work are confirmed absent. The original stop rules remain intact. Prior accepted controls retain their documented scopes; no new observation or broader migration acceptance is invented.
