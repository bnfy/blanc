@arc-import @F45
Feature: Arc Spaces import
  People leaving Arc can bring their Spaces, pinned tabs, folders and
  Favorites into Blanc without rebuilding them by hand.

  @F45-1 @desktop
  Scenario: Arc's file is read only after the person asks
    Given Arc's sidebar file exists on this device
    When I open Bring Your Tabs
    Then Blanc offers to bring Spaces from Arc
    And Arc's sidebar file has not been read

  @F45-2 @desktop
  Scenario: A Patron gets one space per selected Arc Space
    Given I am a Blanc Patron with room for three more spaces
    And an Arc sidebar with Spaces named "Work" and "Reading"
    When I bring both Spaces from Arc
    Then Blanc creates spaces named "Work" and "Reading" in one write
    And their loose pinned tabs are pinned and their folders are groups
    And no window is switched to either space

  @F45-3 @desktop
  Scenario: A selection that does not fit creates nothing
    Given I am a Blanc Patron with room for one more space
    And an Arc sidebar with Spaces named "Work" and "Reading"
    When I bring both Spaces from Arc
    Then Blanc explains that only one more space fits
    And no space is created

  @F45-4 @desktop
  Scenario: Without Patron each Space opens in its own window
    Given Blanc Patron is not active
    And an Arc sidebar with Spaces named "Work" and "Reading"
    When I bring both Spaces from Arc
    Then two new windows open with each Space's tabs and groups
    And only the selected tab in each window has loaded

  @F45-5 @desktop
  Scenario: Arc's Favorites join a Favorites folder named Arc
    Given an Arc sidebar with two top-row Favorites, one already in Blanc
    When I bring the Favorites from Arc
    Then one Favorite is added to a folder named "Arc"
    And the existing Favorite is unchanged

  @F45-6 @desktop
  Scenario: The page sees names and counts, never URLs or paths
    Given an Arc sidebar with Spaces that use a separate Arc profile
    When Blanc shows the Arc preview
    Then the page receives Space names, counts and opaque ids only
    And no URL, file path, Arc id or Arc profile name reaches the page

  @F45-7 @desktop
  Scenario: Linux imports a chosen file
    Given Blanc is running on Linux
    When I open Bring Your Tabs
    Then Blanc explains that Arc never came to Linux
    And offers to choose a copied StorableSidebar.json file
