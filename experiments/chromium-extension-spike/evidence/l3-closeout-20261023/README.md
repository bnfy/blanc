# L3 security-baseline and maintenance closeout — October 23, 2026

**L3 is accepted for the owner-selected Mac preview baseline.** This closes the written baseline/maintenance criterion by reconciling existing execution evidence and the already-recorded owner policy. It does not approve public distribution, Decision 2, the economics/capacity worksheet, or the separate Google extension-upgrade gate.

Candidate: source `09985c160803f3432f0d2b40a21caa13e249e53c`, Chromium `157.0.8103.15`, upstream `1aa07b638799e59656559ae6c6649d4b197f555e`, signed archive SHA-256 `4c86c89e7ec81791ef8bedf525187b302c313f913a5e5b07a26d4d2a45b9ef00`. Apple accepted `1818186c-4b95-4571-b822-397bf8705161`. [L7 owner acceptance](../l7-owner-acceptance-20261023/README.md) applies to this same artifact.

## Criterion reconciliation

| L3 requirement | Verified evidence / disposition |
| --- | --- |
| Supported upstream version/channel | Fresh official Mac metadata reports Beta `157.0.8103.15` at exactly `1aa07b6387…`. Stable remains `156.0.8078.48`; Dev is `158.0.8106.0`. This is the current Beta explicitly selected by the owner for the preview, **not a Stable-channel release**. Version/channel are recorded without implying that Beta is vulnerability-free or has a Stable support guarantee. |
| Relevant security fixes | Reverified ancestry of all five previously identified .6→.15 memory-safety fixes. Their eight affected files still match the reviewed .15 target. The older .6 missing-fix finding is resolved; no invented CVE, severity or exploit reproduction. |
| Patch inventory and dependencies | Current authoritative inventory is 62 existing upstream files / 162 zero-context hunks. All nine changed dependency HEADs reverified against the reviewed pins; the inventory's dependency audit reports clean resolved Git checkouts. New copied/generated Blanc files remain separately accounted for under the standing rule. No new dependency exception. |
| Rehearsed guarded update path | The [Beta15 update](../beta15-update-20261022/README.md) documents exact source/dependency selection, six overlapping patch-file reconciliations, an owner-approved large-build exception, preserved cache/toolchain/old output, subsequent signing/notarization and 76 bounded runtime checks. The [L7 repair](../l7-security-repair-20261023/README.md) then exercises ordinary incremental preparation/build: 43.44 seconds, 15 steps, final zero-action guard and 80 signed checks. The large update cost is retained as measured work, not relabeled as a cheap routine increment. |
| Named maintenance owner and withdrawal route | The owner named Anthony Loria and explicitly selected “Sole maintainer; suspend when unavailable.” [Recorded policy](../../preview-manual-maintenance-policy.md) requires reviewing upstream security notices each working day, suspension when unavailable, and withdrawal for known exploitable defects/unsupported baselines. The live PR status route and manual update/rollback instructions exist. No backup, staffing commitment, automatic patch service or remote disable is invented. |

The five verified upstream fixes cover File System Access teardown, persistent-memory size validation, menu destruction, CDM promise callbacks and image-decode cancellation. `verified-baseline.json` records exact commits, current file hashes, dependency pins, inventory and candidate identity. This is targeted patch/source review plus the signed acceptance record, not a complete audit of Chromium's entire codebase or every dependency's vulnerability database.

## What remains separate

- **L4:** actual Google-served extension version upgrade; current baseline remains untouched. An install or no-change updater callback is not an upgrade pass.
- **Decision 2 cost/capacity:** actual human-attention and provider billing data remain unmeasured. The staffing/CI cost sheet stays open on those points. They are not falsely inferred from build duration and do not silently become a new requirement of the written L3 identity/baseline criterion.
- **L5/L6/L8/L10/L11/L12:** physical controls/accessibility, the remaining artifact-bound recovery/functional acceptance, clean-machine/provenance/distribution, exact-head CI and final owner release approval remain as written.
- Beta selection must be reconsidered when official metadata/security notices change. This point-in-time acceptance is not permanent support authorization.

No build, signing, runtime or profile mutation was required for this reconciliation. The original Stable fetch timed out; a single retry returned HTTP200. The browser fetch tool could not read the JSON endpoints; direct HTTPS retrieval from the same official endpoints succeeded, with headers/raw JSON retained. No third-party source substituted for the upstream metadata.

**Readiness: 5/12 gates (41.7%), delta +2 this turn: owner-approved L7 plus completed L3.** Next independent executable gate is the bounded signed-candidate L6 recovery acceptance; L4 remains externally gated and L5 requires the owner hand check. Latency and the Electron diagnostic build remain deferred/pending. Google baseline remains separate and unchanged.

Sources: [official Mac Beta metadata](https://chromiumdash.appspot.com/fetch_releases?channel=Beta&platform=Mac&num=3), [official Mac Stable metadata](https://chromiumdash.appspot.com/fetch_releases?channel=Stable&platform=Mac&num=1), [official Mac Dev metadata](https://chromiumdash.appspot.com/fetch_releases?channel=Dev&platform=Mac&num=3). Raw responses are archived with this record.
