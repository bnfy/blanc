> October23 L11 harness maintenance: affected fixture sources now pass values as CDP protocol arguments, render request-derived text without HTML interpolation, and compare parsed URL origins/hosts. Original runtime observations retain their dates and candidate identities; those suites were not rerun by this source-only maintenance. See [L11 repair record](../l11-repair-20261023/README.md).

# L5 theme action accessibility repair — October 23, 2026

The installed-theme rows were nested inside `role=option` elements. macOS flattened their Apply/Remove controls into option text. The repair separates installed themes into a labelled section with individually labelled groups and native buttons, while preserving the list-box/combobox contract for extension search. Theme button focus survives re-render, moves from Apply to Remove when Apply becomes disabled, and returns to search after removal.

## Exact candidate

- Source: `c506e4aa10e4c843009ac85656b5a951451bf9d0` on PR #1028.
- Chromium: `157.0.8103.15`; Apple Silicon, macOS 27.2.
- Signed archive SHA-256: `777180c90c2b4fafb10c4e0442704fff2875763bf9d479714733151a1c150dfe`.
- Developer ID Application: Anthony Loria (`XYGUCY4498`), separate preview identity and helper IDs.
- Apple accepted submission `5461db97-8bd3-441d-9fdc-84de4d6152b6`; stapling, ticket validation, strict signature and Gatekeeper accepted.
- Seventeen Mach-O hashes and six checked UI/blocker assets are unchanged through the tests; ten bundle identities checked. No get-task-allow or disabled library validation.
- Native build guard: zero actions. This was an assets-only preparation and package/signing operation; no Chromium compilation, latency run or Electron diagnostic build.

## Results

- 16 focused source tests, scoped ESLint, and nine packaging tests pass.
- [Native observations](native-observations.md): real Tab/Shift-Tab/Return/Space, Apply, removal Cancel/Remove, filtering, clean-restart persistence, and extension search navigation pass. Installed actions are visible as native AX buttons.
- 75 signed runtime checkpoints pass: 17 regular security, 16 private security, 19 bridge/scope, 17 core functional and six encrypted-session/recovery checks. Reports and runnable fixtures are archived by suite.
- Core functional checks cover navigation/back/forward/reload, find/zoom, favorite/history, download/audio, start-page settings and restart. Recovery checks cover exact encrypted tabs/selection, loading close and post-ack crash survivors.

## Qualification and retained failures

The theme-action L5 defect is repaired. Full L5 remains open for the bounded owner physical-input, matched visual and VoiceOver acceptance session. Readiness stays **7/12 (58.3%), delta 0 gates**. Existing L6/L7/L10 acceptance is mapped to unchanged native/security mechanisms and supplemented by the current candidate checks above; historical full matrices are not relabelled as newly run.

The first scope invocation was refused by the sandbox before it could bind localhost (`scope/sandbox-refusal.log.gz`); the permitted invocation completed all 19 checks. A sandboxed final `codesign` audit also returned an invalid-signature diagnostic; the identical unmodified candidate passed strict verification and all final hash comparisons when run with access to macOS signature services. This was an execution-environment limitation, not repaired by re-signing. The initial source-test invocation only executed the nine Store tests; `focused-tests-final.log.gz` is the complete 16-test run. These are not counted as application test failures or extra passes.

Only disposable test profiles were used. Cleanup is recorded in `cleanup.json`; no dev, shipping or Google baseline profile was changed. The accepted master candidate and stapled archive are retained under `/private/tmp/blanc-l5-repair/`. Raw logs are gzip-compressed without changing their decoded bytes. The SSH signing key remains available as previously requested; only this operation's remote staging/job is removed.

No merge or public release approval is implied. Google upgrade qualification, full L5, remaining distribution/provenance and exact-head CI/readiness work remain separate. Latency is deferred and the Electron diagnostic build remains pending approval/unstarted.
