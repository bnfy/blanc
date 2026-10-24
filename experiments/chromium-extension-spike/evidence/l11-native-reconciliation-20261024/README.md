# L11 Chromium applicability reconciliation — October 24, 2026

The target is the native Chromium 157.0.8103.15 preview, not an Electron release. This reconciles the existing requirements; it does not waive repository checks or award L11. **Readiness remains 9/12 (75%), delta 0.**

## Requirement and evidence boundary

| Requirement | Current evidence | Disposition |
| --- | --- | --- |
| Native candidate identity and integrity | `candidate-reverification.json`: all 458 files and five symlinks exactly match the accepted inventory; strict deep signature, stapled ticket and Gatekeeper pass. `artifact-authentication.json`: pinned GitHub/Sigstore identity and four artifact digests verified. | Satisfied for source `7c427328100d1ba76cb7e8b651a1f36d74ec86c6`, archive `ffcfefdfbb5421619f3ba359bb4c5d92134b468ac8475c18eda12153a7f5e4ed`. No app launched or profile opened. |
| Native security, certificate and recovery qualification | [Frozen signed evidence](../l11-native-replacement-20261023/README.md), [current acceptance mapping](../../preview-candidate-acceptance-map-20261023.md), L7 owner approval, and current inventory equality. Committed changes from candidate source to checked PR head are documentation/evidence only. | Existing bounded acceptance applies; no new runtime tests, broader lifecycle proof or live compromised-certificate handshake claimed. |
| Exact-head CodeQL and repository checks | `ci-before.json`, complete pagination: 25 success, three failures, two named skips on `9ce2d81f4854681f6386d569db80495da98d292e`; CodeQL explicitly reports no new changed-code alerts. | This is not all-green CI. Later heads require their own checks. |
| Dependency audit | Substrate fails three undici advisory families across four workspaces. [Scoped lockfile repair](../l11-undici-20261024/README.md), current audits and SBOM checks retained. | Next actionable blocker: publish patched versions and verify hosted substrate on the resulting head. No suppression or dependency major upgrade. These Node dependencies are tooling/shared app dependencies, not proof of a Chromium engine flaw. |
| Linux/Windows sandboxed duplicate/reopen | Two `modified-link-clicks` failures execute the shipping Electron harness. Both failed clone trials remain in [historical evidence](../l11-sandbox-duplication-20261023/README.md). | Unresolved shared-repository merge obligation. They do not demonstrate a defect in the native Chromium candidate. The separate Electron build and unpublished app patch are paused; no new Electron work or test weakening. |
| Full L11 sign-off | The original checklist asks for current-head CI/audits green. | Still OPEN. The applicable native portion is supported; shared CI failures stay visible. Separating applicability does not change branch protection, authorize merge, or close the gate. |

Skipped checks are `installed-intel` and `linux-native-diagnostics`; these are not native Apple Silicon artifact acceptance. The passing desktop jobs also exercise Electron and must not be presented as native Chromium certification.

## Next native launch decisions

After dependency validation, L4 still needs a genuine Google-offered version increase; its separate baseline remains untouched. Decision 2 still needs cost/capacity disposition and deferred latency evidence or an explicit owner decision about that requirement. L12 remains NO-GO pending those prerequisites and final artifact-specific approval. Do not manufacture more lifecycle tests or an Electron rebuild to substitute for these inputs.

The earlier mistaken coupling of the Electron build to native acceptance is superseded by this matrix; historical failure/build records remain intact. No compilation, signing, profile mutation, release, or merge was performed for this reconciliation.
