@sync
Feature: Tab sync (open tabs from other devices)
  Other devices' open tabs are browsable read-only via E2EE profile sync;
  publishing is per-device opt-in and off by default.

  @F27-1 @F27 @all
  Scenario: Sharing open tabs is off by default
    Given sync is enabled on this device
    Then the "share this device's open tabs" setting is off
    And no tab snapshot for this device is published

  @F27-2 @F27 @all
  Scenario: A remote device's tab opens locally as a new ungrouped tab
    Given a synced device "MacBook Air" with 3 shared tabs
    When I open the palette and unfold "MacBook Air"
    And I choose its first remote tab
    Then it opens as a new ungrouped local tab

  @F27-3 @F27 @all
  Scenario: Turning sharing off retracts this device's tabs
    Given sharing open tabs is on and synced
    When I turn sharing off
    Then other devices no longer list this device

  @F27-4 @F27 @desktop
  Scenario: The start page offers sync once and stays quiet after Not now
    Given a profile that completed first run
    And sync is off and the sync offer has not been dismissed
    When I open a new tab
    Then the start page offers to set up sync
    When I choose Not now on the sync offer
    Then the start page no longer offers sync
    When I open a new tab
    Then the start page no longer offers sync

  @F27-5 @F27 @desktop
  Scenario: The sync offer opens Settings at the Sync section
    Given a profile that completed first run
    And sync is off and the sync offer has not been dismissed
    When I open a new tab
    And I choose Set up sync on the sync offer
    Then the settings page opens in the utility sheet under the blanc scheme
    And the Settings sheet is at the "sync" section

  @F27-6 @F27 @desktop
  Scenario: The sync command opens Settings at the Sync section
    Given a profile that completed first run
    When I run the slash command "/sync"
    Then the settings page opens in the utility sheet under the blanc scheme
    And the Settings sheet is at the "sync" section
