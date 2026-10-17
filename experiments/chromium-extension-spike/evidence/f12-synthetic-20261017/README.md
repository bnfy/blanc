# Synthetic corpus generation and Electron probe — October 17, 2026

Owner approval was explicit at `68892cc1`, recorded in #916 at `4abb4509`.
The coverage matrix was committed before any probe in `cf3f0abe`.
This checkpoint resumes the approved work; it does not close Spike A.

The deterministic generator emits **5,905 distinct candidate URLs**: 2,500
blocking-rule candidates, 2,500 domain-boundary near misses, and 905 exception
candidates. Both pinned lists contribute under explicit per-list caps. The
counts are derivation labels, **not measured decisions**. Generation verifies
pinned bytes, records rule/line/hash provenance and unsupported/refused rules,
and never manufactures an oracle. See `generation-summary.json` and the
committed generator for reproducibility. List-derived artifacts in this
folder also carry the terms and attribution in
[the replay NOTICE](../../fixtures/replay/NOTICE).

## Runtime evidence

| Attempt | Result | Scope / cause |
| --- | --- | --- |
| run-01 | Failed | 12 script candidates; empty SVG favicon triggered an unmanifested browser favicon request, and one authored child ID tripped the unchanged numeric-identifier privacy rule. Both faults retained. |
| run-02 | Failed | Valid authored favicon removed the first fault; the child ID still failed the privacy gate. |
| run-03 | Passed | Child IDs now use deterministic a–p encoding; no privacy rule changed. 12 script candidates, two fresh regular and two fresh private replays. |
| run-04 | Passed | Expanded to 24 candidates: script/xhr/image/stylesheet × blocking/near-miss/exception × two each. Two fresh replays per profile. |
| run-05 | Passed | Same 24 candidates, with saved DOM execution/child/load results checked against independently observed provider decisions. Final runtime source hashes match this checkpoint. |

Run 05 observes **8 blocked and 16 allowed candidate URLs** in each profile.
Each replay has 29 total provider observations (24 candidates, four authored
child fetches, one page navigation); 8 block and 21 allow. Repetitions and
profiles do not multiply the distinct-URL counts. Both stable comparisons
have zero faults. `captureProvenanceVerified` remains false; acceptance-corpus
completion remains zero because the full matrix, threshold and fork comparison
have not passed. The source-rule labels did not supply these observed answers.

All candidate scripts have authored response bytes even when Electron blocks
them. Allowed scripts executed their fixture behavior and their declared child
fetches; run 05 saves the DOM lists as well as provider and transport evidence.
No deliberately failing fork adapter was run: this does not yet demonstrate
that an actual native false negative is correctly classified end to end.

The harness checks installed Blanc 1.36.0 list hashes against generator inputs,
uses stock Electron 44.8.0 with the real provider and startup gate, and saves
wrapper/engine artifact/list resource/build/settings identities. The installed
ASAR is read-only and its hash is unchanged. All disposable profiles and CA keys
were removed after owned processes exited. No upstream acquisition, personal
profile, native build or private real-page sanity sample was run.

## Validation and limitations

- 17 generator/stability tests and 2 fixture-TLS/manifest tests pass.
- The existing 15 paired-validator tests pass; its code is unchanged here.
- Targeted JavaScript lint and `git diff --check` pass.
- The synthetic stability gate adds image/stylesheet to the reviewed
  single-frame context checks. Public recording admission stays unchanged.
- The observed probe uses third-party candidates in a main frame. First-party,
  nested/opaque frames, redirects, workers, service workers, teardown,
  speculation, sockets, WebTransport and additional resource types remain gaps.
- Native CSS/procedural/scriptlet outcomes, native hook latency and the Chromium
  adapter are pending. No block-rate parity, full corpus or native coverage is
  claimed. Coverage gaps and the original two-week deadline remain explicit.
