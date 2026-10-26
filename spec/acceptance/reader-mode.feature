@reader-mode
Feature: Read an article without changing the original page
  Reader Mode is free and manually activated. It simplifies the loaded article
  locally and retains the original page for return without reloading.

  @F58-1
  Scenario: Extract a readable article into a separate sandbox
    Given a Reader Mode test article is open
    When I enter Reader Mode for the test article
    Then the reader contains the article without hidden content or page scripts

  @F58-2
  Scenario: Return to the same document and scroll position
    Given a Reader Mode test article is open
    When I enter Reader Mode for the test article
    And I exit Reader Mode for the test article
    Then the original Reader Mode test document and scroll position are unchanged

  @F58-3
  Scenario: Reader appearance is remembered locally
    Given a Reader Mode test article is open
    When I enter Reader Mode for the test article
    And I choose sepia Reader Mode with large sans-serif text
    And I exit Reader Mode for the test article
    And I enter Reader Mode for the test article
    Then the reader remembers the chosen appearance
