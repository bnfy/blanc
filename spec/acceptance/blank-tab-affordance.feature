@island @F37
Feature: A blank tab shows where to type
  The resting island on a blank tab reads as a place to enter text rather
  than as a label naming the tab, and typing on such a tab begins entry
  without first having to find and click the island.

  @F37-1 @all
  Scenario: The blank-tab island invites typing
    Given a blank new tab is active
    Then the island shows the typing prompt
    And the island shows the commands chip

  # The precondition is the whole point. Reaching a blank tab with Cmd/Ctrl+T
  # opens and focuses the island on the way, so a scenario written that way
  # would pass whether or not typing does anything at all.
  @F37-2 @all
  Scenario: Typing on a cold-launched blank tab opens the island
    Given a blank new tab is active with page content focused
    And the island starts closed
    When I type "g" into the page
    Then the island opens with "g" already entered

  @F37-3 @all
  Scenario: The commands chip opens the command list
    Given a blank new tab is active
    And the island starts closed
    When I click the island commands chip
    Then the island opens with "/" already entered

  # Closing the last tab leaves Blanc on a blank replacement tab. It should be
  # as ready for typing as one opened with Cmd/Ctrl+T, not leave the keyboard
  # on an empty page.
  @F37-4 @all
  Scenario: Closing the last tab leaves the address field ready for typing
    Given a single ordinary page is the only open tab
    When I close the only tab
    Then a blank tab replaces it with the island address field focused

  # #1505: Cmd/Ctrl+T goes to a New Tab page the window already has and
  # hasn't used, instead of stacking another empty one. Each precondition
  # leaves an ordinary page active, so the shortcut has somewhere to move from.
  @F37-5 @all
  Scenario: New Tab switches to an unused new tab
    Given an unused new tab and an ordinary page are open, with the page active
    When I press the New Tab shortcut
    Then the unused new tab is active with the island address field focused
    And no tab was opened

  @F37-6 @all
  Scenario: New Tab opens a tab once the new tab has been used
    Given a new tab that went to a page and came back, and an ordinary page active
    When I press the New Tab shortcut
    Then a new blank tab is opened and active

  @F37-7 @all
  Scenario: Grouped and pinned new tabs are left alone
    Given an unused new tab in a group, an unused pinned new tab, and an ordinary page active
    When I press the New Tab shortcut
    Then a new blank tab is opened and active

  @F37-8 @all
  Scenario: With the setting off, New Tab always opens a tab
    Given an unused new tab and an ordinary page are open, with the page active
    And switching to an unused new tab is turned off
    When I press the New Tab shortcut
    Then a new blank tab is opened and active

  @F37-9 @all
  Scenario: New Private Tab switches to an unused private new tab
    Given an unused private new tab, an unused new tab and an ordinary page are open, with the page active
    When I press the New Private Tab shortcut
    Then the unused private new tab is active
    And no tab was opened
