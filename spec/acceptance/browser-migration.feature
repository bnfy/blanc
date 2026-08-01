@browser-migration @F30 @D22
Feature: Browser data migration
  People can bring supported browser data into Blanc without exposing source
  profile paths to page content or duplicating records on retry.

  @F30-1 @all
  Scenario: Import Favorites directly from a detected browser profile
    Given a detected browser profile is offered on the Favorites page
    When I import Favorites from that browser profile
    Then its supported web Favorites are copied into Blanc
    And their immediate folders are preserved

  @F30-2 @all
  Scenario: Repeating a browser import is idempotent
    Given I already imported Favorites from a detected browser profile
    When I import Favorites from that browser profile again
    Then no duplicate Favorites are created
    And the migration result reports that every Favorite was already saved

  @F30-3 @all
  Scenario: A fresh profile offers migration during first run
    Given a fresh first run is awaiting setup
    Then browser Favorites migration is offered before browsing
    When I import Favorites from first-run setup
    Then its supported web Favorites are copied into Blanc
