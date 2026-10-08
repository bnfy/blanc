# F43 Phase 0, round 2 — engine view beneath the active page (2026-10-08)

Follows `docs/evidence/translate-phase0-2026-10-08/` (round 1: speed gate
failed because macOS backgrounds the never-visible engine renderer).
Owner direction for this round: test a production-safe engine
`WebContentsView` attached beneath the active page view; no `utilityProcess`,
no app-wide renderer-backgrounding switch, no feature plan.

Measurements: https://github.com/bnfy/blanc/actions/runs/37850922692 (branch
`spike/translate-phase0` at `2568c2d4533f850e9a41e3fb0fde1be2c5cc0c06`), plus two
local runs on the owner's M5. The engine is the round-1 build (run
37845357888); the workflow verified its wasm sha256
`a39e50b3…78f1` before use. Model and fixture pins as in round 1.

## Verdict

**FAIL.** Attaching the engine beneath the page speeds it up on the Intel Mac
but not enough, and it exposes the engine in two ways the gates forbid.

| Gate | Result |
|---|---|
| Intel full article ≤ 10 s (≤ 9 s to count as a clear pass) | **FAIL — 12,665 ms** per 2,000 words (unattached control: 20,362 ms) |
| Intel first viewport ≤ 3 s | **pass — 1,993 ms** per 250 words in the foreground; 2,049–2,390 ms after a tab switch, with another window focused, minimized and restored (unattached control: 7,504 ms foreground) |
| No app-wide renderer-backgrounding switch | pass: not used in any run |
| Engine not visible | pass: 0 engine-coloured pixels on every host, with the page captured (positive control) |
| Engine not hit-testable | pass: a native OS click and key press reached the page (pointer press recorded) and never the engine, on every host |
| Engine not focusable | **FAIL on all three hosted machines**: the engine document reported `document.hasFocus() === true` while idle and in the first foreground runs, then lost focus during the full-article runs. `webContents.isFocused()` stayed false. Not reproduced locally (the harness window was not the key window at that point). Unattached control: never focused. |
| Engine not accessibility-visible | **FAIL on every host**: a platform accessibility search (macOS System Events, Windows UI Automation) found the engine document's title next to the page's. Unattached control: not exposed. |
| No effect on background tabs while the engine is idle | inconclusive: see "Background tab" |

Per the owner's instruction the product gate has **not** been changed. The
first-viewport result passes only in the attached-behind placement, which
fails the focus and accessibility gates as built.

## Results

Times are medians normalized to 250 words (first viewport) or 2,000 words
(full article). First-viewport columns: foreground / after tab switch / other
window focused / window minimized / restored.

| Host | Mode | CPU | Ready ms | First viewport ms/250 | Full ms/2,000 (n) | Engine idle CPU % | Background tab rate: idle / translating | Pixels | Input | Focus | Accessibility | English |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| darwin arm64 (local) | unattached | Apple M5 ×10 | 330 | 2977 / 3654 / 3107 / 3319 / 4117 | 17332 (5) | 0 | 0.816 / 0.625 | not-visible | not-received | not-focused | not-exposed | yes |
| darwin arm64 (local) | behind | Apple M5 ×10 | 305 | 3533 / 2600 / 3978 / 3117 / 2128 | 17088 (5) | 0.2 | 0.923 / 1.103 | not-visible | not-received | not-focused | EXPOSED | yes |
| darwin arm64 | behind | Apple M1 (Virtual) ×3 | 428 | 1691 / 1667 / 1735 / 1767 / 1745 | 9331 (5) | 1 | 1.436 / 0.049 | not-visible | not-received | FOCUSED | EXPOSED | yes |
| darwin arm64 | unattached | Apple M1 (Virtual) ×3 | 723 | 1643 / 1421 / 4219 / 4588 / 10791 | 8641 (5) | 0.7 | 1.051 / 0.905 | not-visible | not-received | not-focused | not-exposed | yes |
| darwin x64 | behind | Intel i7-8700B ×4 | 531 | 1993 / 2390 / 2049 / 2311 / 2078 | 12665 (5) | 1.4 | 0.928 / 0.214 | not-visible | not-received | FOCUSED | EXPOSED | yes |
| darwin x64 | unattached | Intel i7-8700B ×4 | 1179 | 7504 / 2790 / 2204 / 2016 / 1935 | 20362 (5) | 1.1 | 0.228 / 0.382 | not-visible | not-received | not-focused | not-exposed | yes |
| win32 x64 | behind | AMD EPYC 7763 ×4 | 365 | 1610 / 1561 / 1553 / 1543 / 1570 | 8637 (5) | 0 | 1.041 / 1.02 | not-visible | not-received | FOCUSED | EXPOSED | yes |
| win32 x64 | unattached | AMD EPYC 7763 ×4 | 278 | 1568 / 1566 / 1559 / 1538 / 1525 | 8559 (5) | 0 | 1.048 / 1.031 | not-visible | not-received | not-focused | not-exposed | yes |

Full-article warm samples (ms): Intel behind 14293, 13914, 11661, 13058,
10921; Intel unattached 28049, 31168, 20993, 17485, 16432. Every raw sample
is in the summary files here.

## Observations

- **Priority.** The engine document reported `visibilityState: "visible"` in
  every state and both modes, so it is not a reliable signal of the process
  priority macOS applies. Speed is the only evidence. Attached beneath the
  page, the Intel Mac ran 1.6× faster than unattached and stayed fast after a
  tab switch, with another window focused, and even while minimized. On the
  owner's M5 the two placements were indistinguishable (about 17 s either
  way, as in round 1), so attaching does not reliably lift priority on Apple
  Silicon hardware either.
- **Windows** is unaffected by placement (8.6 s either way on this runner;
  round 1's Windows runner had a faster CPU).
- **Focus.** On every hosted machine the hidden engine document held keyboard
  focus for part of the run without any user action. A page beneath the
  active tab taking focus could swallow keystrokes. A fix (for example,
  refusing focus in the engine document or re-focusing the page) would need
  its own test; none was attempted in this round.
- **Accessibility.** The engine page appears in the window's accessibility
  tree on macOS and Windows. Screen-reader users could reach it. A fix (for
  example, an `aria-hidden` root, an empty title, or Chromium-level exclusion)
  would need its own test.
- **Background tab.** The idle-engine comparison is too noisy to settle the
  gate: the unattached control, where the engine cannot affect the window,
  ranged from 0.23 to 1.05 of the no-engine rate. While the engine was
  translating, a background tab on the 3- and 4-core macOS runners dropped to
  5–21% of its rate in the behind placement (38–91% unattached), because the
  attached engine now competes at foreground priority. Windows: no change.
  Timer intervals in the background tab were the same with and without the
  engine (about 1 s on Windows and the M1 runner, about 2 s on the Intel
  runner and the M5).
- **Idle cost.** With a model loaded and nothing to translate, the engine
  used 0–1.4% CPU.

## Method and controls

- Visible window (1280×800) with: a background tab attached once and then
  detached (as Blanc does with inactive tabs), the active page view on top,
  and the engine view at index 0 with the same bounds (`behind`) or never
  attached (`unattached`). Same sandbox, CSP and `backgroundThrottling: false`
  as round 1.
- Sequence: 10 s background-tab baseline with no engine → engine init → 10 s
  idle → 5 first-viewport runs → 1 cold + 5 warm full-article runs → tab
  switch (new page view on top, old one closed) → second window focused over
  the first → first window minimized → restored; 3 first-viewport runs in each
  state → exposure checks.
- Pixels: the engine page is magenta and the page teal. A screen capture of
  the window counted 0 magenta pixels on every host, and its 650k–3.9M teal
  pixels prove the capture saw the page.
- Input: one native click and "a" key press at the window centre
  (`CGEventPost` via `osascript` on macOS, `user32` via PowerShell on
  Windows). Only a pointer press counts as proof the native input arrived,
  because the harness also sends synthetic Tab keys (corrected after the run;
  summaries were recomputed from raw data with
  `bench/translate/resummarize-behind.mjs`, which changed no result).
- Focus: 20 synthetic Tab presses in the page, `webContents.isFocused()`, and
  the engine document's own `hasFocus()` at every state.
- Accessibility: a search of the platform accessibility tree for the engine's
  and the page's document titles; finding the page proves the search worked.
- Background tab: work units per second in a dedicated worker (process
  scheduling) and the main-thread 1 s interval (timer scheduling).

## Decision

**No-go, owner decision 2026-10-08.** On-device translation remains
desirable, but F43 on the current Bergamot/Electron architecture is paused.
The attached-beneath-page workaround fails too many independent requirements:
the Intel Mac stays above the 10-second gate, the M5 gains nothing, the engine
can take keyboard focus, it appears in the accessibility tree, foreground-
priority translation materially starves background tabs, and fixing focus and
accessibility would still leave performance marginal while relying on a fragile
hidden-but-visible view.

Resume only when at least one of these holds:

1. a materially faster engine or build exists;
2. a supported per-process priority mechanism exists that preserves renderer
   sandboxing; or
3. Electron exposes a suitable translation API.

Not to be done without a new owner decision: another measurement round,
testing `utilityProcess`, changing the product gate, or writing the feature
plan. The spike branch `spike/translate-phase0` and this evidence are kept; the
harness is not opened as a PR or merged into `main` unless the research tooling
is later judged worth retaining.
