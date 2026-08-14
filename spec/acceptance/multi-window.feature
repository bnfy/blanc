@desktop
Feature: independent browser windows
  Each native window owns its own tabs, groups, overlays, and utility sheets.
  Restoring or closing one workspace must not redirect or erase another.

  @F32-1 @F32 @D11
  Scenario: a secondary window owns and discards its own workspace
    When I open a new Blanc window
    Then both windows have independent tab workspaces
    When I open a page in the secondary window
    Then the primary window workspace is unchanged
    When I close the secondary Blanc window
    Then its workspace is removed from the session

  @F32-2 @F32 @D11
  Scenario: independent window workspaces restore separately
    Given a secondary window with its own page
    When I relaunch Blanc with multiple windows
    Then both independent window workspaces are restored
