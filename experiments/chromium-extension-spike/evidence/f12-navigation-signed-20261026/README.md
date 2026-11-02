# Signed navigation repair — October 26

Source **efb1b511efb19fa3cc5a819a5ef701a2b867d7d1**, Chromium157.0.8103.15. Separate replacement candidate; no old signed master or Google baseline was modified. This is the signed follow-up to the [native navigation finding](../f12-navigation-gate-20261026/README.md), whose original8pass/6fail baseline is preserved.

Apple accepted notarization **214024e9-4c28-47b3-9575-44db8220ba11**. Stapling, ticket validation, strict Developer ID signature and Gatekeeper assessment pass. Archive SHA-256:

`19cdde2731c41f8e33309a50b872fcb0d8092072a7b6ed1bda781328da5840de`

The frozen pre-notary and final audits agree on17ARM64executable hashes, UI/blocker and compliance bytes;10Preview bundle identities and eight certificate-blocklist keys are verified. Entitlements contain no get-task-allow or disabled-library-validation exception. Seven UI/blocker assets exactly match the prior signed candidate, so no unaffected owner visual/VoiceOver/theme/L8 walkthrough was repeated. Source-bound compliance contains340components; provenance describes a local incremental build, not an independent hermetic rebuild. Initial1Password authorization timeout occurred before Apple submission and is retained separately; the authorized retry succeeded.

## Affected checks

Exactly20assertions pass on the final notarized app in fresh regular/private contexts:

- Allowed subframe requests arrive with one exact CDP-request-digest/native allow join and correct profile bit.
- Blocked subframe requests have a native refusal with **zero destination server arrivals**.
- Main-frame requests deliberately allowed by the pinned engine arrive and have an exact native allow/profile join. This is attribution proof, not a main-frame filtering claim.
- Both browsers exit normally. Their two task profiles were removed only after process-absence verification.

`affected-checks/report.json` retains all protocol/native/HTTP observations; traces and the actual fixture are archived. The oracle engine hash matches the unchanged bundled engine. No previous passing runtime matrix, owner download test, Electron build, latency measurement or Chromium rebuild was repeated during packaging/signing. The prior native build was the bounded60.28s/6step incremental build with finalguard0; fresh76files/185hunks/151clean dependency audit remains in the linked native evidence.

## Scope

This qualifies the navigation repair on the signed replacement. Privileged DevTools navigation replacement/restart attribution remains a separate unqualified case. Default-disabled pre-prefetch routing and final production/provider-parity disposition remain distinct F12/Decision2 inputs. No aggregate F12, Decision2, new launch-gate, public-release or merge approval is implied; prior owner L7/L8 approvals remain artifact-bound. Electron paused, Google baseline separate and untouched, latency deferred.
