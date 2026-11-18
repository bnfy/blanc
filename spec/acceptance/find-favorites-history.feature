@find @favorites @history
Feature: Find in page, favorites, and history
  Find-in-page, the Favorites feature (internal id stays "bookmarks"), and the
  capped, private-excluded history.

  @F8-1 @F8 @all
  Scenario: Find shows a match count and keeps the page interactive
    Given a page containing the word "widget" 3 times
    When I open find in page
    And I search for "widget"
    Then the match count shows 3
    And I can navigate to the next and previous match
    And the page content outside the find bar remains clickable

  @F9-1 @F9 @all
  Scenario: Favoriting the active page surfaces it on newtab and the favorites list
    Given the active tab is on "keep.example"
    When I add the active page to favorites
    Then the favorite control shows as active
    And "keep.example" appears on the new-tab page
    And "keep.example" appears on the favorites page

  @F9-2 @F9 @all
  Scenario: Add all open tabs to favorites
    Given tabs open on "one.example" and "two.example"
    When I add all open tabs to favorites
    Then "one.example" appears on the favorites page
    And "two.example" appears on the favorites page

  @F9-3 @F9 @all
  Scenario: Favorites rows show each site's icon
    Given a favorite for "https://icon.example/" with a saved icon
    And the favorites page is open
    Then every favorites row shows a site icon

  @F63-1 @F63 @F9 @desktop
  Scenario: The Favorites menu shows nested folders as submenus
    Given a favorite for "https://clients.example/" titled "Acme" in "Work › Clients"
    And a favorite for "https://loose.example/" titled "Loose" in no folder
    Then the Favorites menu holds "Work", then a separator, then "Loose"
    And the Favorites menu's "Work" submenu holds "Clients" with "Acme" in it

  @F63-2 @F63 @F9 @desktop
  Scenario: /save files the page into a nested folder by its name or by a path
    Given a favorite for "https://clients.example/" titled "Acme" in "Work › Clients"
    And the active tab is on "keep.example"
    When I run the slash command "/save clients"
    Then "keep.example" is a favorite in "Work › Clients"
    When I run the slash command "/save Work > Reading"
    Then "keep.example" is a favorite in "Work › Reading"

  @F63-3 @F63 @F9 @desktop
  Scenario: Editing a favorite changes its name and address, and its Start Page pin follows
    Given the Start Page has no pins
    And a favorite for "https://old.example/" titled "Old name" in no folder
    And the favorites page is open
    When I pin "Old name" from the Favorites page
    And I edit the favorite "Old name" to "New name" at "new.example/page"
    Then the Favorites page shows "New name" at "https://new.example/page"
    And Favorites hold "New name" at "https://new.example/page" and nothing at "https://old.example/"
    And the Start Page pin "New name" is at "https://new.example/page"

  @F10-1 @F10 @all
  Scenario: A visit is recorded with the final page title
    When I visit "read.example" with title "Reader"
    Then history contains one entry for "read.example" titled "Reader"

  @F10-2 @F10 @all
  Scenario: Clearing history empties the list
    Given history has at least one entry
    When I run the slash command "/clear"
    Then history is empty

  @F10-3 @F10 @all
  Scenario: History groups today's visits with their site icons
    Given history has at least one entry
    And the history page is open in the utility sheet
    Then history shows a "Today" heading
    And every history row shows a site icon
