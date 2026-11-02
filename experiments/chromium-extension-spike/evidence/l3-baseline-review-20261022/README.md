# L3 baseline and maintenance review — October 22

L2 acceptance was committed and pushed as26940e23. This is the next L3 security/maintenance closeout review, not a source update or L3 pass.

## Baseline result

Candidate native source is157.0.8103.6, upstream41520584daa68d0040db7746ae562a0ff82187f6 (October14 commit). Official Mac channel metadata retrieved October22 reports Stable156.0.8078.48, Beta157.0.8103.15 at1aa07b638799e59656559ae6c6649d4b197f555e, and Dev158.0.8106.0. Thus candidate is an older Beta, not the current Beta or Stable. This does not itself establish exploitability; the actual delta below determines the remediation requirement.

Official Gitiles range pagination completed six pages/581 commits. Full diff has1,894 changed paths. Six overlap Blanc's62-file patch inventory: browser BUILD.gn, chrome_content_browser_client.cc, search/search.cc, ui/browser_commands.cc, ui/omnibox/omnibox_next_features.cc and ui/webui/chrome_web_ui_configs.cc. DEPS rolls Skia,V8,ANGLE,PDFium,DevTools,Dawn,ICU,libvpx,WebRTC and optional internal/platform dependencies. Full upstream patch remains local with its hash in delta-summary.json; selected overlap/security/DEPS patch archived here. This is source scope, not a predicted build duration or cold-build authorization.

## Concrete missing upstream fixes

Public upstream commit messages describe at least five memory-safety fixes in the update range:

- 0b07ac7d6c5b48130d50a447f02a1d38e753e1a6: File System Access lock promotion can use freed receiver storage during manager teardown, including Incognito callbacks.
- 66ac08fa276070074f25a329e6371d5fd4792b1a: malformed persistent metrics segment sizes can underflow and cause out-of-bounds writes.
- d3ffcebca08613d4e907c16ba65745d5768fbab9: defer MenuRunnerImpl destruction to avoid a menu callback use-after-free.
- bcc2e3b13da9320d2632151e53e35cc63f94dacb: drain CDM promises safely to prevent iterator invalidation/use-after-free on callbacks.
- c09065c7aae301c629cab91cb257f2d2a4aba2ee: cancel stale image decode tasks to prevent request-ID collision/use-after-free.

Eight affected source files in the candidate checkout match the older pinned upstream byte-for-byte, as pinned-source-check.json records. No Blanc backport of these fixes is present. These are upstream descriptions and verified missing fixes, not an exploit reproduction, assigned severity, or complete CVE/security audit. Other delta/dependency changes remain to review. **L3 stays blocked pending a reviewed current baseline or complete justified backport set and candidate requalification.** Retain the existing signed candidate for evidence; do not publish it as security-cleared.

## Maintenance decision

The owner named Anthony Loria and explicitly chose “Sole maintainer; suspend when unavailable.” Anthony is the primary security-update and withdrawal owner. No backup was invented. This supersedes the draft requirement for a named backup: distribution must pause whenever he cannot review security updates. Manual-only operation cannot remotely disable installed copies; the release/security notice must tell users when to stop using a withdrawn preview. The notice route and withdrawal rehearsal remain L9/L12 work.

## Next concrete package

Prepare an isolated, reversible157.0.8103.15 source/dependency update, review the six patch overlaps and changed dependency pins, then inspect the guarded build plan before compiling. Reuse incremental outputs only when the guard accepts them; do not silently start a cold build or alter the retained Google156/157 fixture. Build/sign/notarize a replacement only after source review. Rerun impacted native enforcement/recovery tests and artifact acceptance; reconsider L2 if its accepted artifact is replaced. Latest-Stable rollout would be a separate baseline decision; no silent downgrade/repointing.

No native source, build output, app, profile, keychain, GitHub comment or release state changed in this review. No latency or Electron build. Google baseline ledger/evidence remain uncommitted and separate. Progress remains2/12, delta0; ownership decision resolved, baseline work is actionable.

Sources: [official Stable metadata](https://chromiumdash.appspot.com/fetch_releases?channel=Stable&platform=Mac&num=3), [official Beta metadata](https://chromiumdash.appspot.com/fetch_releases?channel=Beta&platform=Mac&num=3), [official Dev metadata](https://chromiumdash.appspot.com/fetch_releases?channel=Dev&platform=Mac&num=3), and [exact upstream delta](https://chromium.googlesource.com/chromium/src/+log/41520584daa68d0040db7746ae562a0ff82187f6..1aa07b638799e59656559ae6c6649d4b197f555e). Raw paginated JSON is archived; initial browser-tool URL failures did not supply evidence and were replaced by successful direct official fetches.

## October23 follow-up

The old-candidate missing-fix finding above is resolved in the requested .15 replacement: all five commits are included, nine dependency pins verified, signed security/recovery/isolation regressions pass. See [the update evidence](../beta15-update-20261022/README.md). This dated .6 review remains historical; it does not describe the updated candidate as still missing those fixes. Full review/maintenance cost and release acceptance remain separate.
