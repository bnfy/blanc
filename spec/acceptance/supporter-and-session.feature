@supporter @session
Feature: App icon catalog, Patron, and session restore
  The current app icon catalog stays independent of Patron, while session restore
  preserves groups but never private tabs.

  @F17-1 @F17 @all @D6
  Scenario: A current app icon can be selected
    When I choose the app icon "ink"
    Then the app icon "ink" is applied

  @F17-2 @F17 @all
  Scenario: A retired icon cannot be restored by an active Patron
    Given an active supporter unlock
    When I choose the app icon "ember"
    Then the app icon "sunrise" is applied

  @F17-3 @F17 @all @desktop
  Scenario: Become a Patron opens Polar checkout in a real tab
    Given there is no active supporter license
    And Personal profile settings are open
    When I activate Become a Patron from Settings
    Then exactly one new tab opens on "buy.polar.sh"
    And the utility sheet is dismissed

  @F18-1 @F18 @all @D8
  Scenario: Relaunch restores groups but not private tabs
    Given a group "work" with 2 tabs
    And a group "play" with 1 tab
    And one private tab open
    When I relaunch the app
    Then the group "work" is restored with its 2 tabs
    And the group "play" is restored with its 1 tab
    And no private tab is restored
