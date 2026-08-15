# Blanc Glance — reference pane design

**Date:** 2026-08-15

**Status:** Implemented
**Roadmap:** Follow-up to M2 independent windows

## Product definition

Glance lets someone keep one tab visible as a temporary reference while they
work in another. It is intentionally not a general split-view workspace: the
active page stays dominant, the reference remains subordinate and easy to
dismiss, and both pages continue to be ordinary tabs in the current native
window and local profile.

The selected visual direction was **main page + narrow Glance pane**. Its
source visual truth is:

`/Users/anthonyjloria/.codex/generated_images/01a00105-81bf-76d2-abdb-8fa8f86ad02b/exec-87b179ed-cf1b-4f34-92fe-34b621afbc3a.png`

## Entry and selection

- Cmd/Ctrl+Shift+G and View → Open Glance… open the Island panel in a dedicated
  chooser state. They never guess which tab should become the reference.
- Every eligible row in the normal Island tab list also exposes a Glance
  action. The active tab cannot select itself.
- Selection is restricted to the current window runtime. A tab can never be
  moved across native windows or local-profile session boundaries by Glance.
- Windows and Linux use the same native menu and Island controls as macOS.

## Visible model and layout

- `activeTabId` remains the main page; runtime-owned `glanceTabId` identifies
  the secondary page. Glance state is intentionally transient and is not
  written to `session.json`.
- At page widths of 800px or more, the pages sit side by side at a default
  68/32 split. The main-page share is clamped to 50–78 percent.
- Below 800px, the reference stacks underneath the main page so neither page
  becomes an unusable sliver.
- An 8px divider is draggable, keyboard adjustable, and double-click/Enter
  resettable. The preferred ratio belongs to the window runtime.
- The resting Island remains centered over the dominant control region. A
  compact context chip over the secondary pane shows its favicon/domain plus
  promote and close controls; the page divider begins below the chrome strip.
- Existing page-sampled strip tint remains authoritative. Glance adds no new
  global palette or theme token.

## Interaction and lifecycle

- Promoting the reference — by its chip or by focusing its page — swaps the two
  visible tabs. No navigation or page reconstruction is required.
- Closing Glance collapses the layout but leaves its tab open in the normal tab
  model. Closing the main tab while Glance is visible promotes the reference
  into the full page instead of waking an unrelated background tab.
- Closing the glanced tab collapses Glance. Closing the window follows the
  existing runtime teardown and never attaches a page to another window.
- A quiet tab selected for Glance wakes through the existing guarded wake path.
  Both visible tab IDs are excluded from automatic Quiet Tabs candidates.
- Overlays, utility sheets, permission surfaces, cursor geometry, and page
  bounds continue to use main-owned geometry and are re-stacked above both
  page views.

## Per-workspace closed-tab recovery

The adjacent roadmap follow-up uses the same runtime boundary. Each window
owns a bounded in-memory stack of up to 25 ordinary URLs. File → Reopen Closed
Tab and Cmd/Ctrl+Shift+T pop only the focused runtime's stack. Private tabs,
blank new tabs, and teardown closes are not recoverable, and the stack is not
persisted or synced.

## Security and privacy

- Only the main process owns `WebContentsView` attachment, bounds, focus, and
  runtime membership decisions.
- Chrome renderers receive inert tab metadata and geometry through the existing
  allowlisted preload bridge. Sender-derived IPC authorization remains in
  force for every Glance action.
- Glance introduces no new storage, remote request, synced field, or page-data
  exposure. Quiet-tab recovery snapshots remain main-process-only.

## Acceptance contract

- **F34-1 / D11:** the native accelerator opens an explicit chooser; selecting
  a tab creates separate dominant/reference panes; promote swaps roles;
  resizing stays within the supported range; close restores the full page.
- **F2-5 / D11:** closed-tab recovery is isolated between independent native
  workspaces.
- Pure unit coverage owns split geometry, clamping, zero-size safety, runtime
  defaults/teardown, and Quiet Tabs exclusion of both visible panes.

## Non-goals

- More than two simultaneous page panes.
- Persisting or syncing the Glance relationship.
- Cross-window or cross-profile tab movement.
- Replacing tab groups, the Island switcher, or native window workspaces.
