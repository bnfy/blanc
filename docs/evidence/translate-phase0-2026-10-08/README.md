# F43 Phase 0 — on-device translation feasibility (2026-10-08)

Spec: `docs/superpowers/specs/2026-10-08-on-device-translation-design.md`
Plan: `docs/superpowers/plans/2026-10-08-translation-phase0-feasibility.md`
Engine build: https://github.com/bnfy/blanc/actions/runs/37845357888
Measurements: https://github.com/bnfy/blanc/actions/runs/37847944632
Branch `spike/translate-phase0` at `9b4f16ec8d6c9b97868e163f61fc027d95c5fb8e`, based on `origin/main` `78fa99bf38595df1336532c46f6f6a30a24a43be`.

## Verdict

**Speed gate: FAIL.** The Intel Mac median was 20,011 ms per 2,000 words with
the designed engine host (limit 10,000 ms). The English-output check passed on
every host.

The failure is macOS process priority, not raw engine speed. Chromium lowers
the priority of renderers with nothing visible on screen. The F43 engine view is
never shown, so on macOS its renderer runs as a background process. With that
lowering disabled (diagnostic only, see below), the same Intel Mac took
9,709 ms, and the owner's M5 went from 18,565 ms to 8,750 ms. Windows and the
hosted Apple Silicon VM were not slowed by it.

Owner decision required before any feature work (see "Options").

## Provenance

- Engine: mozilla/translations `69455acaecbe8650cdba988dbcf7c10ca20e7c48` (Bergamot v0.6.0), emsdk 3.1.8, built on `ubuntu-22.04` in 6 minutes. Upstream output was already wrapped as `loadBergamot` (wrap: upstream). `bergamot-translator.wasm` sha256 `a39e50b3012239e80b1578418636ed1c015c122171da22ff03a4df05432f78f1`, 4,962,438 bytes (1,880,572 gzipped); `bergamot-translator.js` sha256 `bf408bd65b96c24ef97e7867e68471955ba4386456510a7edaf23cb50b6d851c`, 92,034 bytes.
- Model: fr→en base-memory; decompressed hashes match `bench/translate/inputs.json` on every host.
- Article fixture: fr.wikipedia "Tour Eiffel" revision 240161358 (CC BY-SA 4.0); response sha256 `4680cf2e…9507` verified on every host; 2,062 words used; text not committed (the summaries here contain no Wikipedia text).
- Markup fixtures: `bench/translate/fixtures/markup.json` (Blanc-authored).
- Sources are research-only; production still requires Blanc-mirrored, approved artifacts.
- Engine host: unattached `WebContentsView` (no window), as designed. It started on every host; the `--host=window` fallback was not needed. A local check with the view inside a hidden `BrowserWindow` was no faster (17,850 ms median on the M5), because a hidden window is also backgrounded.
- Electron 44.5.1, `sandbox: true`, `backgroundThrottling: false`, CSP `default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'none'`; fallback GEMM (no `mozIntGemm`).
- Hosted runners are shared VMs (`macos-15` is a 3-core virtual M1; `macos-15-intel` an i7-8700B; `windows-latest` an AMD EPYC with 4 vCPUs). The local rows are the owner's Apple M5 (10 cores, 24 GB).
- "Diagnostic" rows run Electron with `--disable-renderer-backgrounding`, which removes the priority lowering for **every** renderer in the app. They show the ceiling and never count toward the gate.

## Controls

- Pinned-hash negative controls: a wrong vocab hash and a wrong fixture hash were both refused.
- CSP negative control: removing `'wasm-unsafe-eval'` made the engine fail to load (`Bergamot aborted while loading`); restoring it passed.
- English check positive control: the French source scored 0.001 English / 0.244 French function-word ratio (`isEnglish: false`); the output scored 0.364 / 0.002 (`isEnglish: true`). This proves English-like output, not translation quality.
- Stub-engine smoke test: the unattached view, preload, CSP header, 42 MB input transfer and worker script import all worked before the real engine existed.

## Results

| Host | CPU | Ready ms (end-to-end) | Cold ms | Warm median ms (n) | Warm ms / 2,000 words | Words/s | Recreate ready ms | Engine peak Δ MB | Total peak Δ MB | Total after destroy vs pre MB | Markup kept html / markers / wiki | English |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| darwin arm64 (view, backgrounding off — diagnostic) | Apple M5 ×10 | 165 | 9037 | 9021 (5) | 8750 | 229 | 164 | 382 | 424 | -43 / -36 | 8/8 / 8/8 / 29/40 | yes |
| darwin arm64 (view) | Apple M5 ×10 | 283 | 21715 | 19141 (5) | 18565 | 108 | 311 | 380 | 418 | -44 / -43 | 8/8 / 8/8 / 29/40 | yes |
| darwin arm64 (view, backgrounding off — diagnostic) | Apple M1 (Virtual) ×3 | 423 | 10576 | 10605 (5) | 10286 | 194 | 314 | 381 | 421 | -65 / -61 | 8/8 / 8/8 / 29/40 | yes |
| darwin arm64 (view) | Apple M1 (Virtual) ×3 | 695 | 7388 | 8513 (5) | 8257 | 242 | 319 | 381 | 421 | -34 / -34 | 8/8 / 8/8 / 29/40 | yes |
| darwin x64 (view, backgrounding off — diagnostic) | Intel i7-8700B @ 3.20GHz ×4 | 377 | 11007 | 10010 (5) | 9709 | 206 | 412 | 371 | 411 | -20 / -19 | 8/8 / 8/8 / 29/40 | yes |
| darwin x64 (view) | Intel i7-8700B @ 3.20GHz ×4 | 1425 | 23959 | 20631 (5) | 20011 | 100 | 931 | 367 | 407 | 24 / 25 | 8/8 / 8/8 / 29/40 | yes |
| win32 x64 (view, backgrounding off — diagnostic) | AMD EPYC 9V74 ×4 | 218 | 7434 | 7056 (5) | 6844 | 292 | 234 | 340 | 382 | -60 / -66 | 8/8 / 8/8 / 29/40 | yes |
| win32 x64 (view) | AMD EPYC 9V45 ×4 | 182 | 5367 | 5005 (5) | 4855 | 412 | 259 | 348 | 391 | -55 / -63 | 8/8 / 8/8 / 29/40 | yes |

Warm samples (ms), designed host:

- M5 local: 15921, 20118, 17010, 21742, 19141
- M1 VM: 7439, 7457, 9512, 8513, 8559
- Intel Mac: 22120, 21329, 17144, 14786, 20631
- Windows: 5182, 5029, 4966, 4931, 5005

The macOS designed-host samples vary far more than the diagnostic ones (M5
diagnostic: 8821–9050), consistent with a background process being scheduled
around other work.

End-to-end readiness (input transfer / worker start / engine load / model load
→ total), designed host: M5 66 / 8 / 27 / 161 → 283 ms; Intel Mac
842 / 183 / 39 / 234 → 1,425 ms; Windows 93 / 13 / 15 / 55 → 182 ms. Startup
is not a concern on any host.

Sizes: engine 1.9 MB gzipped (5.0 MB); fr→en model files 26.2 MB gzipped
(23.2 + 2.6 + 0.4 MB) and 37.2 MB decompressed.

## Memory and reclamation

Engine renderer (including its worker) peaked about 340–380 MB above its idle
baseline on every host; the whole Electron process tree peaked about
380–420 MB above baseline. Terminating the worker released most of it (M5
designed host: engine 428 MB settled → 198 MB after worker terminate). After destroying the view, total process-tree memory was at or
below the pre-view level on every host except the Intel Mac designed host,
which ended 24 MB above (25 MB after the recreate cycle) — under the plan's
50 MB flag, and its pre-view sample was taken unusually early (128 MB versus
171 MB for the Intel diagnostic run). A destroy-and-recreate cycle reached
readiness in 164–931 ms and showed no growth across cycles.

## Markup fidelity (owner judgement required)

- Blanc fixtures: structure kept in **8/8 HTML mode and 8/8 marker mode**:
  nested emphasis, links with every attribute, lists, spans, entities and
  `translate="no"` all survived.
- Protected strings: `{count}` and `%s` survived; **`{{dossier}}` was
  translated to `{{folder}}`** in both modes. Production must replace template
  placeholders with markers before translation.
- Spacing: one space moved across an element boundary
  (`<kbd>S</kbd>to save`).
- Wikipedia paragraphs (HTML mode): 29/40 kept identical structure. The 11
  differences are mostly legitimate word reordering that moves links and
  spans; at least one paragraph duplicated a link element. Side-by-side detail
  is in the local `quality.html` (not committed: it contains CC BY-SA text).
- Translation quality on the article read as fluent English in spot checks;
  final judgement is the owner's.

## Options (for the owner; none started)

1. **Keep the engine out of a backgrounded renderer on macOS.** For example, run
   it in an Electron `utilityProcess` (spec approach C, previously rejected for
   weaker sandboxing), or give the engine view on-screen presence so Chromium
   treats it as foreground. Each needs its own measurement; the diagnostic rows
   suggest the Intel Mac would land near 9.7 s, just under the limit.
2. **Accept the result with a different gate.** Viewport-first translation
   means the first screen (roughly 200–300 words) would take about 2–3 s on the
   Intel Mac even in the designed host, with the rest of the article following.
   The 10 s full-article gate could be replaced by a first-screen gate.
3. **Stop here.** Do not build F43 on this engine.

App-wide `--disable-renderer-backgrounding` is not an option for shipping: it
would remove the priority lowering for every background tab.

## Decision

Pending owner review.
