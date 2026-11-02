# L5 owner acceptance — October 23, 2026

**Accepted for the signed Apple Silicon/macOS 27.2 candidate below.** The owner completed the remaining physical-input, matched visual, VoiceOver, theme, installation-permission and popup-focus hand checks. Final confirmation:

> Passed, including Cancel leaving Bitwarden uninstalled before retrying. Record L5 as accepted and update the plan and evidence on #1028. Keep Google baseline separate, latency deferred, and the Electron build pending.

## Candidate and provenance

- Chromium 157.0.8103.15; source `8439cabc865167f0e70cddedd22b390a3bec4438`.
- Signed/stapled ZIP SHA-256 `8783c93501a199b7194957ee2e0672178617aff8e795a2ea4411cc8884b3f985`.
- Apple Accepted `12b32e11-5d97-4639-ad5d-605ff26b2bef`; Developer ID Application: Anthony Loria, team `XYGUCY4498`.
- Separate disposable signed-owner profile; CDP 9875/local fixture 9874. The Google baseline at 9225, permanent profiles/tabs and original source/output were not used for these checks.
- At acceptance recording, strict deep signature verification passes; all 17 executable and seven selected asset hashes match the signed baseline. The archive digest is rechecked. No rebuild, re-signing or new runtime matrix was needed.

[Owner session](owner-session.json), [artifact verification](artifact-verification.json), [signed audit](signed-candidate-audit.json), [final audit](final-candidate-audit.json) and [earlier signed visual/input evidence](../l5-split-visual-parity-20261023/README.md) bind this acceptance. The earlier record's owner-pending status is historical and superseded here; its original failures and evidence remain unchanged.

## Bounded owner hand checks

| Stage | Owner-confirmed result | Supporting observation |
| --- | --- | --- |
| Visual and native input | Passed current shipping card/corner-tab comparison, narrow/wide readability, clicking/typing in both pages, divider drag/reset, Island keyboard navigation, pane/divider/menu VoiceOver names and focus return | Owner: “Passed. Continue with the theme, extension-popup, and permission-dialog checks so we can close L5.” Prior signed evidence contains 75 regression and 56 layout/input checkpoints, distinct from these human observations. |
| Installed themes | Passed spoken labelled groups, native Apply/Remove and disabled state, Return Apply with focus transfer, Space Remove, native Cancel and confirmed removal/focus return | Official Store Cherry Blossom (`lelfanicbadaahlibeimcpfpedfjccnk`) and Shaded Purple (`ilncmopnkmdbmioemmookjmhcelhlklf`) only in the disposable profile. [Setup AX snapshot](theme-ready-ax.txt.gz). Owner then requested the remaining Bitwarden checks. |
| Installation permissions | Passed spoken extension name/permissions/buttons, keyboard navigation and initial Cancel leaving Bitwarden uninstalled; retry Add extension accepted by the owner | Official Store Bitwarden `nngceckbapebfimnlniiiahkandclblb`, version 2026.10.0. Native prompt initially focused Cancel with Add extension disabled during its safety delay. Agent stopped before granting permissions. |
| Native extension popup | Passed VoiceOver web-area interaction, optional setup Skip, popup keyboard navigation, Escape dismissal/Cmd+L focus return and reopening | Owner screenshot showed the normal web-content interaction instruction. Owner completed the guidance and explicitly passed the remaining checks. [Screenshot digest/observation](owner-screenshot-observation.json); original desktop image retained locally. |

Spoken VoiceOver and physical results are owner-reported; the tool cannot hear speech. AX and screenshot observations support them without substituting for that confirmation. Earlier close/Cancel/Leave input observations remain mapped in the prior owner-session record; this final batch does not claim a fresh recovery or persistence pass.

## Gate accounting and limitations

**`[■■■■■■■□□□□□] 7/12 launch gates accepted (58.3%) · Δ +1 L5`.** Accepted: L1/L2/L3/L5/L7/L9/L10. Open: L4/L6/L8/L11/L12. Decision 2 remains open. This is bounded accessibility/input acceptance for the recorded candidate, not complete three/four-pane parity, general extension compatibility, account/vault/autofill qualification, a real Google version upgrade, current-head CI, merge or public-release approval.

**L6 remains reopened** for the independent owner-observed “Tab closed, but history persistence failed or timed out.” warning. Its earlier passing checks and this L5 confirmation do not erase that finding or establish data loss. Next priority is its concrete disposition, followed by the remaining distribution/provenance, CI and final acceptance requirements.

Current test windows/tabs are preserved. No Google baseline or ledger change is part of this publication. No build or latency benchmark ran; the Electron diagnostic build remains pending approval/unstarted. Existing native guard zero and 70-file/173-hunk footprint are historical unchanged measurements, not rerun claims.

Validate this archive with `python3 validate.py`.
