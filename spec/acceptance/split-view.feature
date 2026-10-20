@split-view
Feature: Split View
  Two to four tabs in one window shown side by side, kept together as one
  item that survives relaunch and Spaces. Glance is the first step.

  @F53-1 @F53 @desktop @D11
  Scenario: A split shows both tabs side by side, each with a header band
    Given two loaded tabs made into a split
    Then both tabs are shown side by side with a header band each

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
  Scenario: Pane headers name their tabs; the header's remove dissolves; the divider resizes and resets
    Given two loaded tabs made into a split
    Then each pane header names its tab
    When I move the split divider with the keyboard
    Then the saved column widths change
    When I reset the split divider
    Then the column widths are equal again
    When I press Remove from Split in the first pane's header
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
  Scenario: A pane header follows its page as it navigates
    Given two loaded tabs made into a split
    When the second pane navigates to another page
    Then the second pane's header names the new page and offers Back

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
