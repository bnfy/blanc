@onboarding @F36 @F30
Feature: First-run onboarding
  A fresh profile is walked through the choices that shape the browser —
  default browser, imports, the island, blocking, privacy, theme — once,
  and never reads another browser's data without being asked.

  @F36-1 @all
  Scenario: A fresh profile is offered the walkthrough
    Given a fresh first run is awaiting setup
    Then the onboarding walkthrough is shown

  @F36-2 @all
  Scenario: Skipping still records the privacy choices
    Given a fresh first run is awaiting setup
    And the onboarding walkthrough is shown
    And my stored privacy choices differ from the ones on screen
    When I skip the walkthrough
    Then the privacy choices shown on screen are saved
    And the onboarding walkthrough is dismissed

  @F36-3 @all
  Scenario: A profile that finished first run is not asked again
    Given a profile that completed first run
    When I open a new tab
    Then the onboarding walkthrough is not shown

  @F36-4 @desktop
  Scenario: The walkthrough reads no other browser profile until asked
    Given a fresh first run is awaiting setup
    And the onboarding walkthrough is shown
    When I reach the walkthrough's import step
    Then only the bookmarks-file import is offered
    And the browser lookup has not run
