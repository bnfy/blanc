@onboarding @F36 @F30
Feature: First-run onboarding
  A fresh profile is walked through the choices that shape the browser —
  default browser, imports, the island, blocking, privacy, theme — once,
  and never reads another browser's data without being asked.

  @F36-1 @all
  Scenario: A fresh profile is offered the walkthrough
    Given a fresh first run is awaiting setup
    Then the onboarding walkthrough is shown
    And every onboarding title fits in Instrument Sans in light and dark themes

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

  # F52 spec D5: the Tab Archive offer sits in "Meet the island", preset to
  # After 7 days. Continuing from that step saves it; anything else leaves it Off.
  @F36-5 @F52 @desktop
  Scenario: The island step offers Tab Archive, and continuing turns it on
    Given a fresh first run is awaiting setup
    And the onboarding walkthrough is shown
    When I reach the walkthrough's island step
    Then Tab Archive is offered on, after 7 days
    When I continue past the island step
    Then tab archiving is set to 7 days

  @F36-6 @F52 @desktop
  Scenario: Turning the offer off leaves Tab Archive off
    Given a fresh first run is awaiting setup
    And the onboarding walkthrough is shown
    When I reach the walkthrough's island step
    And I turn the Tab Archive offer off
    And I continue past the island step
    Then tab archiving is off

  @F36-7 @F52 @desktop
  Scenario: Skipping the walkthrough leaves Tab Archive off
    Given a fresh first run is awaiting setup
    And the onboarding walkthrough is shown
    When I skip the walkthrough
    Then tab archiving is off

  @F36-8 @F52 @desktop
  Scenario: A profile that finished first run is never offered Tab Archive
    Given a profile that completed first run
    When I replay the welcome tour
    And I reach the walkthrough's island step
    Then Tab Archive is not offered
    And onboarding cannot turn tab archiving on
