@glance @desktop
Feature: Glance reference pane
  Glance keeps one tab visible as a temporary reference beside the active page
  without moving either tab across its native window or local profile.

  @F34-1 @F34 @D11
  Scenario: Choose, use, promote, resize, and close a Glance reference
    Given two ordinary tabs in one workspace for Glance
    When I summon Glance from its native keyboard shortcut
    Then Glance shows a dedicated accessible local-tab picker
    When I filter the Glance picker and choose the reference tab
    Then the active page and Glance occupy separate dominant and reference panes
    When I focus the interactive Glance page
    Then the main and reference roles do not change
    When I promote the Glance pane
    Then the two visible tabs swap main and reference roles
    When I resize the Glance divider
    Then the main pane remains larger than the reference pane
    When I close Glance
    Then the active page fills the browser page region

  @F34-1 @F34 @D11
  Scenario: Change and close the underlying Glance tab without disturbing main
    Given three ordinary tabs with one open in Glance
    When I choose Change and select the replacement tab
    Then only the Glance reference changes
    When I cancel the Change picker with Escape
    Then focus returns to the Change control
    When I close the underlying Glance tab
    Then the active page fills the browser page region

  @F34-1 @F34 @D11
  Scenario: Stack Glance below the main page in a narrow workspace
    Given two ordinary tabs in one workspace for Glance
    When I open the reference tab in Glance
    And I narrow the workspace below the side-by-side threshold
    Then Glance has a labelled stacked header above its reference content

  @F34-1 @F34 @F31 @D11
  Scenario: Wake a quiet tab only after it is chosen for Glance
    Given a quiet background tab eligible for Glance
    When I summon Glance from its native keyboard shortcut
    And I filter the Glance picker and choose the reference tab
    Then the quiet reference wakes into Glance
