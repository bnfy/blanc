@desktop
Feature: mini windows
  A mini window is a small Blanc window opened over the app the person is in,
  from the File menu, the Dock menu, or an opt-in shortcut that works in any
  app. It isn't saved with the session, links from other apps never land in
  it, and one left unused for an hour closes by itself. Open in Blanc keeps it
  as an ordinary window.

  @F61-1 @F61
  Scenario: a mini window opens small, isn't saved, and closes after an hour unused
    When I open a mini window
    Then the mini window is small and offers Open in Blanc on the Island
    And the saved session leaves the mini window out
    When the mini window has gone unused for an hour
    Then the mini window has closed

  @F61-2 @F61
  Scenario: Open in Blanc keeps a mini window as an ordinary window
    When I open a mini window
    And I click Open in Blanc in the mini window
    Then the mini window is now an ordinary window the session saves

  @F61-3 @F61
  Scenario: a link from another app never opens in a mini window
    When I open a mini window
    And another app opens a fixture page while the mini window is focused
    Then the link opens in an ordinary window, not the mini window

  @F61-5 @F61
  Scenario: closing a mini window's last tab closes the window
    When I open a mini window
    And I close the mini window's only tab
    Then the mini window has closed

  @F61-4 @F61
  Scenario: the mini window shortcut is off until chosen
    Then the mini window shortcut is off
    When I choose a mini window shortcut
    Then the shortcut is either working or reported as unavailable
    When I turn the mini window shortcut off
    Then the mini window shortcut is off

  @F61-6 @F61
  Scenario: moving a mini window to a Space closes it and shows the Space
    Given a saved space named "Reading" that is open in no window
    When I open a mini window
    And I open a fixture page in the mini window
    And I put that page in a group named "Research" in the mini window
    And I choose "Reading" from the mini window's Spaces button
    Then the mini window has closed
    And a window shows "Reading" with that fixture page last
    And that page is still in a group named "Research" there

  @F61-7 @F61
  Scenario: a mini window moves to a new Space, unless a page in it can't move
    Given a saved space named "Reading" that is open in no window
    When I open a mini window
    And I open a fixture page in the mini window
    And I open a private tab in the mini window
    And I choose "Reading" from the mini window's Spaces button
    Then the mini window's Spaces menu says a page can't move, and nothing moved
    When I close that private tab in the mini window
    And I create the space "Later" from the mini window's Spaces button
    Then the mini window has closed
    And a window shows "Later" with that fixture page last

  @F61-8 @F61
  Scenario: moving a mini window to a Space already on screen brings that window forward
    Given a saved space named "Reading" shown in another window
    When I open a mini window
    And I open a fixture page in the mini window
    And I choose "Reading" from the mini window's Spaces button
    Then the mini window has closed
    And that other window shows "Reading" with that fixture page last, and no new window opened
