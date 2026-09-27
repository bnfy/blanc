# Desktop design QA

## System v2 foundation and utility sheets — 2026-09-27

Review: [full-resolution crops and minimum-window captures](design-reviews/non-island-polish/v2-sheets/README.md).

- The six utility sheets use the Sunrise canvas, 20px sheet corners, 14px grouped surfaces, segmented navigation, and a round close control. Newsreader sets page and section headings; Inter carries lists, controls, and body copy. The sheet rules live with their components instead of in the merged #437 prototype override block.
- Settings cards keep nested lists flat. Sync choices are flat rows; Profiles, Usage and data, Diagnostics, Patron, and Help have room for their distinct content. Report an issue has centered label and arrow with explicit padding. The redundant Blocking and Usage dividers are removed. Dropdown carets, More links, and narrow Settings section tabs retain their intended controls.
- Favorites and History keep dates flush right at rest and reveal row actions over that edge. History has a visible gap between its site icon and title. Empty Favorites uses one raised card with no warm inner fill. Downloads keeps aligned status and actions. Touch rows expose actions without covering dates.
- Checked light and dark sheets at 1280×800 and 640×480 using seeded, fictional data. The dark capture's ivory strip is a capture artifact documented in the design handoff.
- Unit: 1,962 passed after the refinement. Lint and substrate checks passed. Desktop `@F16`: 9 scenarios and 42 steps passed. Full desktop acceptance: 168 scenarios and 1,005 steps passed on the first system v2 commit.

The next design PRs cover prompts/dialogs and neutral frame states. A private Windows/Linux validation build is required before merge.
