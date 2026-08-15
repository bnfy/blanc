# Glance design QA

## Comparison target

- Source visual truth: `/Users/anthonyjloria/.codex/generated_images/01a00105-81bf-76d2-abdb-8fa8f86ad02b/exec-87b179ed-cf1b-4f34-92fe-34b621afbc3a.png`
- Rendered implementation: `/private/tmp/blanc-glance-final.jpeg`
- Full-view comparison: `/private/tmp/glance-qa-final-full.png`
- Focused chrome comparison: `/private/tmp/glance-qa-final-focus.png`
- State: macOS light appearance, ordinary main tab plus one ordinary Glance
  reference tab, 68/32 horizontal split, resting Island, Glance context chip,
  no overlay or utility sheet open.
- Viewport: 1229 × 768 CSS px in the running Electron development build.
- Density normalization: the generated source is 1487 × 1058 px. Its top
  1487 × 930 region was cropped to the implementation aspect ratio and
  normalized to 1229 × 768. The Sky implementation capture is 1229 × 768 px
  and is treated as a 1× CSS-viewport capture. Comparisons therefore use equal
  pixel dimensions without stretching either visible comparison artifact.

## Findings

No actionable P0, P1, or P2 differences remain.

- Fonts and typography: trusted chrome keeps Blanc's existing UI typography,
  weight, and optical density. The domain chip remains legible without
  competing with the Island. Web-page typography is site-owned and is not a
  fidelity target for the Glance chrome.
- Spacing and layout rhythm: the main page remains visibly dominant at 68
  percent; the reference pane, divider, Island, and chip have the same
  hierarchy as the selected source. The divider begins below the strip and the
  two pills do not overlap. Rounded geometry, elevation, and inset spacing are
  consistent with Blanc's existing chrome.
- Colors and visual tokens: the implementation deliberately preserves Blanc's
  live page-sampled strip tint rather than the mock's fixed warm neutral strip.
  The context chip continues to use the existing chrome surface, border, and
  foreground tokens. This is an expected product constraint, not drift.
- Image quality and asset fidelity: both panes render real live page content
  and real favicons when available. Glance introduces no placeholder,
  hand-drawn logo, emoji, or approximate visible asset.
- Copy and content: `Open Glance…`, `choose a tab to open in glance`, the
  secondary domain, `Make Glance the main page`, `Close Glance`, and the
  divider's resize/reset help accurately describe their actions.
- Accessibility and interaction: the divider is an exposed splitter with a
  numeric main-page percentage; promote and close are real buttons with clear
  accessible names. The native shortcut, explicit chooser, selection,
  promote/swap, resize, reset, close, and narrow-window fallback are covered by
  the live pass, desktop acceptance, or pure geometry tests.

## Open questions

None. The source uses scripted GitHub/Notion content while the implementation
shows whatever real tabs the user chooses; only the Glance composition and
trusted chrome are intended to match.

## Full-view comparison evidence

The normalized side-by-side comparison shows the same dominant-main/narrow-
reference composition, a single divider, a centered primary Island, and a
small secondary context chip. The implementation's brighter sampled strip is
expected because its main page is live content rather than the mock's fixed
example.

## Focused region comparison evidence

The 520 × 220 top-right crop compares the divider junction and reference chip
at readable size. The chip's domain, promote control, close control, inset,
border, radius, and relation to the divider are all intact; no clipping or
overlap is visible.

## Comparison history

- Pass 1: compared the selected source with the running implementation at an
  equal normalized viewport. No P0/P1/P2 visual findings were identified. A
  stale pre-feature process was discovered before comparison and restarted;
  this was preview state, not a design finding.
- Final pass: restarted the final code, opened Glance through the shipped
  chooser, captured `/private/tmp/blanc-glance-final.jpeg`, and repeated both
  full-view and focused same-input comparisons. No visual fix was required and
  no actionable P0/P1/P2 finding appeared.

## Implementation checklist

- [x] Explicit tab choice rather than implicit selection.
- [x] Dominant main page and bounded resizable reference pane.
- [x] Chrome context chip with promote and close actions.
- [x] Native menu and cross-platform accelerator.
- [x] Narrow-window stacked fallback.
- [x] Quiet Tabs and per-window ownership integration.
- [x] Live interaction pass and complete automated verification.

## Follow-up polish

No P3 polish item is required for handoff.

final result: passed
