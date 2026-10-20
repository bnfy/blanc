@split-view
Feature: Split View
  Two to four tabs in one window shown side by side, kept together as one
  item that survives relaunch and Spaces. Glance is the first step.

  @F53-1 @F53 @desktop @D11
  Scenario: A split shows both tabs side by side, each in its own card
    Given two loaded tabs made into a split
    Then both tabs are shown side by side, each in its own card

  @F53-2 @F53 @desktop @D11
  Scenario: Clicking into the other pane makes it the focused, active tab without hiding the first
    Given two loaded tabs made into a split
    When I focus the second pane
    Then the second pane is the active tab and both panes stay shown
    And reloading reloads only the second pane

  @F53-3 @F53 @desktop @D11
  Scenario: Selecting another tab hides the split; selecting a split tab brings both back
    Given two loaded tabs made into a split
    And another ordinary tab
    When I select the ordinary tab
    Then only the ordinary tab is shown
    When I select the split's second tab
    Then both split tabs are shown and the second pane is focused

  @F53-4 @F53 @desktop @D11
  Scenario: Visible panes never go quiet, and Glance is unavailable while a split shows
    Given two loaded tabs made into a split
    When every background tab is asked to go quiet
    Then neither split pane is quiet
    And Glance cannot open while the split shows

  @F53-5 @F53 @desktop @D11
  Scenario: Keep as split turns Glance into a split, keeping the main page's group
    Given a main page in group "Work" and a Glance reference in group "Read"
    When I keep the Glance as a split
    Then the two tabs form a split in group "Work" and Glance is closed

  @F53-6 @F53 @desktop @D11
  Scenario: Split with makes a split from the tab menu
    Given two loaded ungrouped tabs
    When I split the first tab with the second from the tab menu
    Then the two tabs form a split led by the first tab

  @F53-7 @F53 @desktop @D11
  Scenario: Remove from Split dissolves a two-pane split; the removed tab lands directly below
    Given two loaded tabs made into a split
    When I remove the first pane from the split
    Then there is no split and the removed tab sits directly below the other

  @F53-8 @F53 @desktop @D11
  Scenario: Closing the focused pane's tab leaves the other tab full-window and active
    Given two loaded tabs made into a split
    When I close the focused pane's tab
    Then there is no split and the other tab is the active full-window tab

  @F53-9 @F53 @desktop @D11
  Scenario: Close Split is one Recently closed entry that reopens the split whole
    Given two loaded tabs made into a split
    And the second split tab has gone quiet
    When I close the split
    Then Recently closed holds one split entry
    When I reopen that entry
    Then the two tabs form a split again in the same order

  @F53-10 @F53 @desktop @D11
  Scenario: Pinning a split tab removes it from the split first
    Given two loaded tabs made into a split
    When I pin the first split tab
    Then there is no split and the first tab is pinned

  @F53-11 @F53 @desktop @D11
  Scenario: Corner tabs name their panes; the corner × dissolves; the divider resizes and resets
    Given two loaded tabs made into a split
    Then the other pane's corner tab names its site and the focused one shows only its ×
    When I move the split divider with the keyboard
    Then the saved column widths change
    When I reset the split divider
    Then the column widths are equal again
    When I press the × on the first pane's corner tab
    Then there is no split

  @F53-12 @F53 @desktop @D11
  Scenario: A split survives relaunch and a Space round trip
    Given two loaded tabs made into a split
    When Blanc relaunches
    Then the two tabs form a split again in the same order
    When I save this window as a Space, switch away and come back
    Then the two tabs form a split again in the same order

  @F53-13 @F53 @desktop @D11
  Scenario: A split is one row in the panel and the rail
    Given two loaded tabs made into a split
    And another ordinary tab
    And I select the ordinary tab
    When I open the tab panel
    Then the panel shows the split as one row named "split-a + split-b"
    When I choose the split's row
    Then both split tabs are shown and the first pane is focused
    When I open the tab panel and show the split's tabs
    Then the panel lists both split tabs under the split's row
    When I show the tabs in the side list
    Then the side list shows the split as one row

  @F53-14 @F53 @desktop @D11
  Scenario: A pane's corner tab follows its page as it navigates
    Given two loaded tabs made into a split
    When the second pane navigates to a page of another kind
    Then the second pane's corner tab names the new page

  @F53-15 @F53 @desktop @D11
  Scenario: Grouping one split tab moves the whole split
    Given two loaded tabs made into a split
    When I group the first split tab as "Read"
    Then both split tabs are in group "Read" and still one split

  @F53-16 @F53 @desktop @D11
  Scenario: Moving a group that holds a split to a new window leaves no broken split
    Given two loaded tabs made into a split
    And the split is in group "Trip"
    When I move group "Trip" to a new window
    Then no tab is left pointing at a split that isn't there

  @F53-17 @F53 @desktop @D11
  Scenario: Closing the other pane takes its page off the window
    Given two loaded tabs made into a split
    When I close the second split tab
    Then the second split tab's view is no longer in the window

  @F53-18 @F53 @desktop @D11
  Scenario: Keeping a Glance as a split says when a tab changes group
    Given a main page in group "Work" and a Glance reference in group "Read"
    When I keep the Glance as a split
    Then Blanc announces that "split-reference" moves into "Work"

  @F53-19 @F53 @desktop @D11
  Scenario: Pinning the focused pane keeps it on screen
    Given two loaded tabs made into a split
    When I pin the first split tab
    Then the first split tab is the active tab

  @F53-20 @F53 @desktop @D11
  Scenario: After a divider drag ends, hovering over the divider doesn't move it
    Given two loaded tabs made into a split
    When I drag the split divider and let go
    Then hovering over the split divider doesn't move it

  @F53-21 @F53 @desktop @D11
  Scenario: Clicking an unfocused pane's corner tab focuses that pane
    Given two loaded tabs made into a split
    When I click the second pane's corner tab
    Then the second split tab is the active tab and both stay shown

  @F53-22 @F53 @desktop @D11 @island-autohide
  Scenario: The floating Island stays above a split's panes, after a relaunch too
    Given the Island auto-hides and floats
    And the active tab is split with another, as its menu does
    Then the floating pill stays above the split's panes and corner tabs
    When Blanc relaunches
    Then the floating pill stays above the split's panes and corner tabs
    When I point at the top edge of the window
    Then the floating pill slides in over the split

  @F53-23 @F53 @desktop @D11 @island-autohide
  Scenario: The pushed Island comes back above a split's panes
    Given the Island auto-hides
    And two loaded tabs made into a split
    When I point at the top edge of the window
    Then the Island is shown and the split's cards start below the strip

  @F53-24 @F53 @desktop @D11 @island-autohide
  Scenario: A pane view raised above the floating Island goes back under it at the next layout
    Given the Island auto-hides and floats
    And the active tab is split with another, as its menu does
    When a pane's view is raised above everything
    And I point at the top edge of the window
    Then the floating pill slides in over the split
