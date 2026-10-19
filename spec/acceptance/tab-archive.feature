@tab-archive
Feature: Tab Archive
  Blanc can close loose tabs you have not viewed in a while and keep them in
  an Archive you can search and restore from. Pinned tabs and tab groups are
  never archived, and the setting is off until you turn it on.

  @F52-1 @F52 @desktop
  Scenario: An idle loose tab is archived
    Given tab archiving is set to 12 hours
    And a loose background tab not viewed for 13 hours
    When the archive sweep runs after the grace period
    Then that tab is closed and listed in the Archive

  @F52-2 @F52 @desktop
  Scenario: Pinned and grouped tabs are never archived
    Given tab archiving is set to 12 hours
    And a pinned tab and a grouped tab not viewed for 13 hours
    When the archive sweep runs after the grace period
    Then both tabs are still open and the Archive is empty

  @F52-3 @F52 @desktop
  Scenario: Nothing is archived during the grace period
    Given tab archiving is set to 12 hours
    And a loose background tab not viewed for 13 hours
    When the archive sweep runs inside the grace period
    Then that tab is still open and the Archive is empty

  @F52-4 @F52 @desktop
  Scenario: A tab with unsaved form work is not archived
    Given tab archiving is set to 12 hours
    And a loose background tab with a typed form value not viewed for 13 hours
    When the archive sweep runs after the grace period
    Then that tab is still open and the Archive is empty

  @F52-5 @F52 @desktop
  Scenario: Restoring an archived tab opens it once, with its custom name
    Given an archived tab that I had renamed
    When I restore it from the Archive
    Then it opens as the last tab with its custom name and leaves the Archive
    And restoring the same entry again opens nothing

  @F52-6 @F52 @desktop
  Scenario: Clearing history empties the Archive
    Given an archived tab
    When I clear browsing history
    Then the Archive is empty

  @F52-7 @F52 @desktop
  Scenario: Nothing is archived right after the computer wakes from sleep
    Given tab archiving is set to 12 hours
    And a loose background tab not viewed for 13 hours
    When the computer wakes from sleep and the archive sweep runs
    Then that tab is still open and the Archive is empty

  @F52-8 @F52 @desktop
  Scenario: Restore an archived tab from the History sheet
    Given an archived tab
    When I open the Archive with the archive command
    Then the History sheet lists the archived tab
    When I restore it from the History sheet
    Then it opens as the last tab and leaves the Archive

  @F52-9 @F52 @desktop
  Scenario: Clear the Archive from the History sheet
    Given an archived tab
    When I open the Archive with the archive command
    And I clear the Archive from the History sheet
    Then the Archive is empty

  @F52-10 @F52 @desktop
  Scenario: A tab I switch to while the sweep is checking it stays open
    Given tab archiving is set to 12 hours
    And a loose background tab not viewed for 13 hours
    When I switch to that tab while the archive sweep is checking it
    Then that tab is still open and the Archive is empty
    And that tab is the active tab

  @F52-11 @F52 @desktop
  Scenario: Overlapping sweeps archive a tab only once
    Given tab archiving is set to 12 hours
    And a loose background tab not viewed for 13 hours
    When two archive sweeps start at the same time
    Then one sweep reports it was busy
    And that tab is listed in the Archive once

  @F52-12 @F52 @desktop
  Scenario: Restoring works while a private tab is active
    Given an archived tab
    And a private tab is active
    When I restore it from the Archive
    Then the restored tab is a normal tab

  @F52-13 @F52 @desktop
  Scenario: Tabs in a Space set aside are left alone, and start their idle clock again when it comes back
    Given tab archiving is set to 12 hours
    And a loose background tab not viewed for 13 hours in a Space I then set aside
    When the archive sweep runs in every window
    Then that tab is still open and the Archive is empty
    When I go back to that Space and the archive sweep runs in every window
    Then that tab is still open and the Archive is empty
