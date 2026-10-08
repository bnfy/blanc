# Translation feasibility harness (F43 Phase 0)

Measures Mozilla's Bergamot engine inside an unattached, sandboxed Electron
`WebContentsView`, the placement the F43 design uses. Spec:
`docs/superpowers/specs/2026-10-08-on-device-translation-design.md`.

Pins live in `inputs.json`; Blanc-authored markup cases in `fixtures/markup.json`.
Downloads from Mozilla's bucket and Wikipedia are research-only: shipped Blanc
fetches only approved artifacts mirrored on Blanc infrastructure. Downloads and
results stay in the gitignored `.cache/` and `results/` directories; the
Wikipedia fixture is CC BY-SA and is never committed.

## Run

1. Engine: the `translate-phase0` workflow's `build-engine` job builds it from
   the pinned `mozilla/translations` commit. Download it:
   `gh run download <run-id> --name translate-engine --dir bench/translate/.cache/engine`
2. Inputs: `node bench/translate/fetch-inputs.mjs`
3. Measure: `npx electron bench/translate/harness/main.js --out=bench/translate/results/<label>`
   (add `--host=window` only if the unattached view cannot start; record that divergence)
4. Verdict: `node bench/translate/verdict.mjs bench/translate/results/*/summary.json`

Pushing `spike/translate-phase0` (or dispatching the workflow) runs steps 1–3 on
`macos-15`, `macos-15-intel` and `windows-latest`.

## Diagnostic variant

Chromium lowers the process priority of renderers with no visible widget, and
the engine view is never visible. Running Electron with
`--disable-renderer-backgrounding` removes that for every renderer in the app
(not acceptable for shipping as-is), which shows the speed ceiling. The workflow
runs both variants on every runner; summaries record
`host.rendererBackgrounding`, the table labels the diagnostic rows, and only
production-shaped rows count toward the Intel speed gate.
