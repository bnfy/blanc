Feature: independent browser windows
  A New Window command must create a separate tab workspace. Closing that
  secondary window is a normal close, so it does not return after relaunch.

  @F32-1
  Scenario: a secondary window owns and discards its own workspace
    When I open a new browser window
    Then the browser windows have independent tab workspaces
    When I close the secondary browser window
    Then the closed secondary workspace is not persisted

  @F32-2
  Scenario: independent window workspaces restore separately
    When I open a new browser window
    And I open a tab in the secondary browser window
    And I relaunch Blanc
    Then the browser windows restore their independent workspaces
