# A self-test of the acceptance harness, not a product contract: it lives
# here rather than in spec/acceptance/. healing-smoke.mjs runs it and checks
# that exactly the scenarios that break the app fail.
@harness
Feature: The harness heals the app between scenarios

  Scenario: A renderer crash fails only its own scenario
    Given a fixture page is open
    When the page's renderer is crashed and the page is used again

  Scenario: The next scenario runs on a healed app
    Then the app answers
    And the harness has relaunched Blanc 1 time

  Scenario: A main-process exception fails its own scenario
    Given the app was relaunched with the environment mark "healing-check"
    When a main-process exception is raised

  Scenario: The healed app keeps its profile and environment
    Then the app answers
    And the app still carries the environment mark "healing-check"
    And the app still uses the acceptance profile directory
    And the harness has relaunched Blanc 2 times

  @harness-relaunch-after
  Scenario: A main-process exception is attributed even when an After relaunches the app
    When a main-process exception is raised

  Scenario: No extra relaunch follows an After that already relaunched
    Then the app answers
    And the harness has relaunched Blanc 2 times
