Feature: named local profile lifecycle
  Named local profiles can be renamed and permanently deleted without giving
  either action access to Personal’s browser data.

  @F36-1
  Scenario: rename and delete a named local profile
    When I rename a named local profile
    And I confirm deletion of that named local profile
    Then the named local profile and its workspaces are gone
