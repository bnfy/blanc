# L11 owner decision: native Chromium preview acceptance

Prepared October28. L4 is accepted; readiness is10/12. This proposal does not close L11 until explicitly approved.

Reviewed head0cf24019:24successful checks,3failures,2skips, none pending. CodeQL explicitly reports no new PR alerts. The reviewed code is identical to signed source260f98ff for native/generated/packaging paths; the head adds evidence only. Raw check results and complete-log failure excerpts are in ci-review.json.

The three failures are confirmed as two Electron44.9.1 sandbox clone assertions (actual allowed, expected SecurityError) and Firefox companion addons-linter development-tool dependency-policy findings. They remain real repository merge obligations. No native Chromium defect is identified by those logs. Neither shipping Electron nor the Firefox companion is included in the native Preview package.

Current native candidate: source260f98fffd336cc3fa250b5ed25a31ee2c7ea404; archivea323f660c99beecb2d085acb22f778081a8326474cb44e90b3df1a44e203d31a. DeveloperID signing, AppleAccepted76944658-9890-4866-9ef5-f7c076febc65, stapling, ticket, strict signature and Gatekeeper pass. Changed inherited-origin/scriptlet paths pass20native and20signed affected checks; the production scriptlet wrapper has4focused safety controls. Existing unaffected evidence is retained at its recorded scope. This is local incremental native acceptance, not a hosted independent Chromium build or complete product certification.

## Proposed gate wording requiring owner approval

For this bounded native Mac preview, L11 requires: the reviewed source's applicable CI and CodeQL results; no unresolved Chromium-relevant audit finding; signed native artifact integrity and source-bound dependency/compliance records; affected native acceptance plus explicit reuse of unchanged controls. The two paused Electron runtime failures and Firefox companion development-tool audit remain visible merge blockers, outside this native-preview gate.

Approval changes only L11's preview applicability. It does not waive branch protection or repository CI, authorize an Electron build, merge, release, final L12 go/no-go, or accept aggregate F12/Decision2. Without approval, the existing all-green L11 wording continues to block acceptance. No tests or audit policy have been weakened or suppressed.

## Owner acceptance

October28: owner answered “Approve native-preview L11 scope” to the exact proposal above, retaining shared Electron/Firefox failures as repository merge blockers. L11 accepted for this bounded native preview. Readiness11/12,delta+1L11. No merge/release/L12 approval.
