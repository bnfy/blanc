@tab-gestures
Feature: Tab gestures
  On a phone the Island and the tab grid answer to the thumb: a sideways swipe
  on the Island moves between tabs, a swipe from the Island into the page opens
  the grid, a grid card closes with a sideways swipe and can be brought back,
  and a web page reloads when pulled down. Blanc's own pages don't reload.

  @F56-1 @F56 @mobile @D7
  Scenario: A sideways swipe on the Island moves to the next and previous tab
    Given tabs open on "one.example" and "two.example"
    And the active tab is on "one.example"
    When I swipe the Island toward the next tab
    Then the tab on "two.example" is the active tab
    When I swipe the Island toward the previous tab
    Then the tab on "one.example" is the active tab

  @F56-2 @F56 @mobile @D7
  Scenario: A tab grid card closes with a swipe and Undo brings it back
    Given tabs open on "one.example" and "two.example"
    When I swipe from the Island into the page
    Then the tab grid is open
    When I swipe the card for "two.example" closed
    Then no tab open on "two.example" is present
    When I undo the close
    Then a tab open on "two.example" is present

  @F56-3 @F56 @mobile @D7
  Scenario: Pulling a web page down reloads it, and Blanc's pages don't
    Given the active tab is on "b.example"
    When I pull the page down
    Then the page reloads
    When I open a new tab
    And I pull the page down
    Then the page does not reload
