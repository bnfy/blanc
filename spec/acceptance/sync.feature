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
  Scenario: The moving-in checklist can be hidden permanently
    Given a profile that completed first run
    And the moving-in checklist is incomplete and not hidden
    When I open a new tab
    And I resize the desktop window to 900 by 600
    Then the moving-in checklist shows "0/2"
    When I hide the moving-in checklist
    Then the moving-in checklist remains hidden
    When I open a new tab
    Then the moving-in checklist remains hidden

  @F27-5 @F27 @desktop
  Scenario: The moving-in checklist opens Settings at Sync and tracks progress
    Given a profile that completed first run
    And the moving-in checklist is incomplete and not hidden
    When I open a new tab
    And I choose Set up Sync from the moving-in checklist
    Then the settings page opens in the utility sheet under the blanc scheme
    And the Settings sheet is at the "sync" section
    When I mark Sync complete in the moving-in checklist
    Then the Sync task stays checked at "1/2"

  @F27-6 @F27 @desktop
  Scenario: The sync command opens Settings at the Sync section
    Given a profile that completed first run
    When I run the slash command "/sync"
    Then the settings page opens in the utility sheet under the blanc scheme
    And the Settings sheet is at the "sync" section

  @F27-7 @F27 @desktop
  Scenario: Completion waits until the covered start page can show it
    Given a profile that completed first run
    And the moving-in checklist is incomplete and not hidden
    When I open a new tab
    Then the moving-in checklist shows "0/2"
    When I mark tab migration complete in the moving-in checklist
    And I choose Set up Sync from the moving-in checklist
    Then the Settings sheet is at the "sync" section
    When I mark Sync complete in the moving-in checklist
    Then the moving-in completion waits behind Settings
    When I close the Settings sheet
    Then the moving-in checklist briefly confirms completion
    And the moving-in checklist retires
