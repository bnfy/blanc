@newtab-layouts @F35
Feature: Start page layouts
  The start page offers four arrangements of the same material — ledger,
  billboard, shelf, and tally. The choice is the person's, persists across
  restarts, and travels with their profile like the theme does.

  @F35-1 @all
  Scenario: The saved layout is the one that renders
    Given a profile whose start page layout is "shelf"
    When I open a new tab
    Then the start page renders the "shelf" layout

  @F35-2 @all
  Scenario: Choosing a layout persists it
    Given a new tab is open
    When I choose the "tally" start page layout from its footer
    Then the saved start page layout is "tally"
    And the start page renders the "tally" layout
