@first-run-onboarding @desktop
Feature: First-run onboarding
  A fresh desktop install explains optional network features, offers a bounded
  Favorites import, and exposes the two tab layouts before browsing begins.

  @F37-1
  Scenario: Complete the three-step first-run flow
    Given fresh first-run onboarding is shown
    Then privacy choices are the first setup step
    When I save the first-run privacy choices
    Then Favorites import is the second optional setup step
    When I continue without importing first-run Favorites
    Then layout and default-browser setup are offered last
    When I choose a tab layout and finish first-run setup
    Then the first-run setup card closes
