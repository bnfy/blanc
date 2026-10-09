@F44
Feature: Interface language
  Blanc's own interface text comes from one catalog. Users can follow the OS
  language or pin a supported one; brand names and slash commands never change;
  websites see the same language signals whatever the interface language is.
  Desktop binding: test/desktop/interface-language-smoke.mjs (each scenario needs
  a fresh launch, which the shared-app Cucumber harness cannot provide).

  @F44-1
  Scenario: System resolves to a supported OS language
    Given the OS prefers "de-DE"
    And German is selectable
    And the interface language is "System"
    When Blanc starts
    Then the interface language is "de"

  @F44-2
  Scenario: A pinned language wins over the OS
    Given the OS prefers "de-DE"
    And German is selectable
    And the interface language is "English"
    When Blanc starts
    Then the interface language is "en"

  @F44-3
  Scenario: Choosing a language asks to relaunch and applies after it
    Given the OS prefers "en-US"
    And German is selectable
    When the user chooses "Deutsch" in Settings
    Then Settings offers to relaunch to apply
    And after a relaunch the interface language is "de"

  @F44-4
  Scenario: A pinned language that is no longer available renders English
    Given the OS prefers "de-DE"
    And German is selectable
    And the stored interface language is "fr"
    When Blanc starts
    Then the interface language is "en"
    And the stored interface language is still "fr"

  @F44-5
  Scenario: Websites are unaffected by the interface language
    Given the OS prefers "de-DE"
    When a page is loaded with the interface language "English" and again with "Deutsch"
    Then the Accept-Language header is the same both times
