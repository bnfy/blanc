@tabs
Feature: Tabs and tab groups
  Tab lifecycle and the named-group model. Groups have names not colors, exist
  only while non-empty, and the pill shows standalone pins plus the active
  section while accounting for every other tab in its global remainder.

  @F2-1 @F2 @all
  Scenario: Reopen closed tab restores the last-closed URL
    Given a tab open on "a.example"
    When I close that tab
    And I reopen the last closed tab
    Then a tab open on "a.example" is present

  @F2-2 @F2 @all
  Scenario: Duplicate tab
    Given the active tab is on "b.example"
    When I duplicate the active tab
    Then a second tab open on "b.example" is present

  @F2-3 @F2 @all
  Scenario: Pinning a tab orders it ahead of unpinned tabs
    Given tabs open on "one.example" and "two.example"
    When I pin "two.example"
    Then "two.example" is marked pinned
    And "two.example" is ordered before "one.example"

  @F2-4 @F2 @all
  Scenario: A plain new tab opens ungrouped
    Given the active tab is in a group named "work"
    When I open a new tab
    Then the new tab has no group
    And the new tab is on the new-tab page

  @F2-5 @F2 @desktop @D11
  Scenario: Reopen-closed history stays inside its native workspace
    Given a different closed page in each of two Blanc windows
    When I reopen the last closed tab in the secondary window
    Then the secondary window restores only its own closed page
    When I reopen the last closed tab in the primary window
    Then the primary window restores its own closed page

  @F2-6 @F2 @all
  Scenario: Closing a group is one undo step
    Given a group "research" holding 3 tabs
    When I close the group "research"
    And I reopen the last closed tab
    Then a group named "research" holds 3 tabs
    And the group's tabs are in their original order

  @F2-7 @F2 @desktop
  Scenario: Recently closed is a bounded undo list the user can clear
    Given recently closed contains "older.example" and "newer.example"
    When I open the command palette
    And I unfold recently closed
    Then recently closed exposes no recovery-tier jargon
    When I forget the newest recently closed tab
    Then recently closed contains only "older.example"
    When I clear recently closed from the panel
    Then recently closed is empty

  @F2-8 @F2 @desktop
  Scenario: Recently closed sits folded under Pinned and folds again on every open
    Given recently closed contains "older.example" and "newer.example"
    When I open the command palette
    Then Recently closed is folded directly under Pinned with 2 entries
    When I unfold recently closed
    And I close and reopen the command palette
    Then Recently closed is folded directly under Pinned with 2 entries

  @F3-1 @F3 @all
  Scenario: Creating a group moves the active tab into it
    Given the active tab has no group
    When I run the slash command "/group work"
    Then a group named "work" exists
    And the active tab is in "work"

  @F3-2 @F3 @all
  Scenario: The pill shows standalone pins, the active section, and every omitted tab
    Given a standalone pinned tab
    And a group "work" with 2 tabs
    And a group "play" with 3 tabs
    When I activate a tab in group "work"
    Then the island shows 3 direct tab dots
    And the island shows 3 more tabs
    When I activate a tab in group "play"
    Then the island shows 4 direct tab dots
    And the island shows 2 more tabs

  @F3-3 @F3 @all
  Scenario: Collapsing a group tucks its tabs away in the panel
    Given a group "work" with 3 tabs
    When I open the command palette
    And I collapse the group "work"
    Then the panel shows a "3 tabs tucked away" row for "work"

  @F3-4 @F3 @all
  Scenario: Removing a group's last tab prunes the group
    Given a group "solo" with 1 tab
    When I close the last tab in "solo"
    Then the group "solo" no longer exists

  @F3-5 @F3 @all
  Scenario: Pinning a grouped tab keeps it in that group
    Given the active tab is in a group named "work"
    When I pin "anchor"
    Then "anchor" is marked pinned
    And "anchor" is shown inside the group "work"

  @F46-1 @F46 @desktop
  Scenario: Rename Tab… names the right-clicked tab
    Given a tab open on "rename-first"
    And a tab open on "rename-other"
    When I choose Rename Tab… for the tab on "rename-first"
    Then the command bar reads "/rename rename-first" with "rename-first" selected
    When I type "Budget" and press Enter in the command bar
    Then the tab on "rename-first" is labelled "Budget"
    And the tab on "rename-other" is labelled "rename-other"

  @F46-2 @F46 @desktop
  Scenario: A name stays through navigation to another site
    Given a tab on "rename-first" named "Budget"
    When that tab goes to "rename-second" on another site
    Then the tab on "rename-second" is labelled "Budget"

  @F46-3 @F46 @desktop
  Scenario: /rename with no name restores the page title
    Given a tab on "rename-first" named "Budget"
    When I run the slash command "/rename"
    Then the tab on "rename-first" is labelled "rename-first"

  @F46-4 @F46 @desktop
  Scenario: Reset Tab Title restores the page title
    Given a tab on "rename-first" named "Budget"
    When I choose Reset Tab Title for the tab on "rename-first"
    Then the tab on "rename-first" is labelled "rename-first"

  @F46-5 @F46 @desktop
  Scenario: A name survives relaunch
    Given a tab on "rename-first" named "Budget"
    And the saved session holds the name "Budget"
    When I relaunch Blanc
    Then the tab on "rename-first" is labelled "Budget"

  @F46-6 @F46 @desktop
  Scenario: A private tab's name never reaches session.json
    Given a private tab on "rename-private" named "Secret plan"
    And a tab on "rename-first" named "Budget"
    Then the saved session holds the name "Budget"
    And the saved session does not contain "Secret plan"

  @F46-7 @F46 @desktop
  Scenario: A shortened /rename names the tab with the words after it
    Given a tab open on "rename-first"
    When I run the slash command "/ren Weekly"
    Then the tab on "rename-first" is labelled "Weekly"

  @F46-8 @F46 @desktop
  Scenario: Choosing /rename without a name asks for one
    Given a tab on "rename-first" named "Budget"
    When I run the slash command "/ren"
    Then the command bar reads "/rename Budget" with "Budget" selected
    And the tab on "rename-first" is labelled "Budget"

  @F46-9 @F46 @desktop
  Scenario: Enter on an untouched rename prompt keeps the page title after the page retitles
    Given a tab open on "rename-first"
    When I choose Rename Tab… for the tab on "rename-first"
    And the page on "rename-first" retitles itself to "(3) rename-first"
    And I press Enter in the command bar
    Then the tab on "rename-first" is labelled "(3) rename-first"

  @F46-10 @F46 @desktop
  Scenario: A renamed tab keeps its name in the command panel while it loads
    Given a tab on "rename-first" named "Budget"
    When the page on "rename-first" starts loading
    Then the command panel row for "rename-first" reads "Budget"
