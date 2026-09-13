Feature: Named workspace preservation and recovery
  @F41-1
  Scenario: Switching preserves a dirty page in the same process
    Given a named workspace with a live unsaved draft
    When I switch to another named workspace and back
    Then the original page identity and draft are unchanged

  @F41-2
  Scenario: Opening the current workspace does not warn about private tabs
    Given a named workspace with a live unsaved draft
    When I open a private tab and select the current named workspace
    Then the workspace action is a no-op and both pages remain open

  @F41-3
  Scenario: Failed rename preserves the editor and its input
    Given two named workspaces for editing
    When I rename one workspace to the other workspace name
    Then the name and validation error stay visible in the workspace editor

  @F41-4
  Scenario: A switch decision remains visible while searching
    Given a named workspace with a live unsaved draft
    When I try switching with a private page and type a slash query
    Then the private switch decision remains visible

  @F41-5
  Scenario: Empty ordinary captures do not resurrect removed pages
    Given a named workspace with a live unsaved draft
    When I close its ordinary pages leaving only a private page
    Then the saved workspace has no ordinary tabs

  @F41-6
  Scenario: Quiet tabs and inactive navigation keep their workspace ownership
    Given a named workspace with a live unsaved draft
    When I quiet a grouped pinned page and switch away
    Then inactive navigation belongs to the original workspace and its quiet tab survives

  @F41-7
  Scenario: Deleting an inactive workspace reveals its live draft
    Given a named workspace with a live unsaved draft
    When I switch away and delete the inactive workspace
    Then the deleted workspace draft remains in a visible unsaved window

  @F41-8
  Scenario: Twenty five workspaces remain reachable in a small viewport
    Given twenty five named workspaces with long names
    Then the workspace list scrolls while creation controls remain visible

  @F41-9
  Scenario: Private-only secondary window does not restore old ordinary tabs
    Given a private-only secondary window bound to a named workspace
    When I close that window and reopen its workspace
    Then no removed ordinary page is restored

  @F41-10
  Scenario: A failed session commit rolls back without losing the outgoing page
    Given a named workspace with a live unsaved draft
    When the incoming workspace session commit fails
    Then the original page identity and draft are unchanged

  @F41-11
  Scenario: Private discard leaves a usable retained ordinary workspace
    Given a named workspace with a live unsaved draft
    When I explicitly close a private page while switching and return
    Then the original page identity and draft are unchanged
