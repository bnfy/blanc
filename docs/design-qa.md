# Desktop design QA

## System v2 foundation and utility sheets — 2026-09-27

Review: [full-resolution crops and minimum-window captures](design-reviews/non-island-polish/v2-sheets/README.md).

- The six utility sheets use the Sunrise canvas, 20px sheet corners, 14px grouped surfaces, segmented navigation, a round close control, and Inter type. The sheet rules now live with their components instead of in the merged #437 prototype override block.
- Settings cards keep nested lists flat. The Sync choices, dropdown caret and its text padding, More links, and narrow Settings section tabs retain their intended controls.
- Favorites and History keep dates flush right at rest and reveal row actions over that edge. Downloads keeps aligned status and actions. Touch rows expose actions without covering dates.
- Checked light and dark sheets at 1280×800 and 640×480 using seeded, fictional data. The dark capture's ivory strip is a capture artifact documented in the design handoff.
- Unit: 1,962 passed. Lint and substrate checks passed. Desktop `@F16`: 9 scenarios and 42 steps passed. Full desktop acceptance: 168 scenarios and 1,005 steps passed.

The next design PRs cover prompts/dialogs and neutral frame states. A private Windows/Linux validation build is required before merge.
