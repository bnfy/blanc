@glance @desktop
Feature: Glance reference pane
  Glance keeps one tab visible as a temporary reference beside the active page
  without moving either tab across its native window or local profile.

  @F34-1 @F34 @D11
  Scenario: Open, promote, resize, and close an explicitly chosen Glance tab
    Given two ordinary tabs in one workspace for Glance
    When I summon Glance from its native keyboard shortcut
    Then the Glance picker waits for an explicit tab choice
    When I open the reference tab in Glance
    Then the active page and Glance occupy separate dominant and reference panes
    When I promote the Glance pane
    Then the two visible tabs swap main and reference roles
    When I resize the Glance divider
    Then the main pane remains larger than the reference pane
    When I close Glance
    Then the active page fills the browser page region
