@desktop
Feature: default page zoom
  Default page zoom is the size web pages open at. Zooming a site saves a size
  for that site in the current profile, and ⌘0 forgets it. Blanc's own pages
  stay at 100%, private tabs save nothing, and no list of visited sites reaches
  Chromium's files.

  @F62-1 @F62
  Scenario: the default reaches new tabs and pages they open, not Blanc's pages
    Given the default page zoom is 75%
    When I open the zoom page
    Then the zoom page is at 75%
    When the zoom page opens a child tab
    Then the child tab is at 75%
    When I open a new tab
    Then the new tab is at 100%

  @F62-2 @F62
  Scenario: changing the default in Settings reaches open pages, not saved sites
    Given the zoom page is open
    And the other zoom page is open
    When I zoom in on the other zoom page
    And I choose 75% for Default page zoom in Settings
    Then the zoom page is at 75%
    And the other zoom page is at 110%

  @F62-3 @F62
  Scenario: a site held at 100% stays there, and ⌘0 returns it to the default
    Given the default page zoom is 75%
    And the zoom page is open
    When I zoom in on the zoom page three times
    Then the zoom page is at 100%
    When the zoom page navigates on its own host
    Then the zoom page is at 100%
    When I relaunch Blanc and open the zoom page
    Then the zoom page is at 100%
    When I reset the zoom on the zoom page
    Then the zoom page is at 75%

  @F62-4 @F62
  Scenario: tabs on a site follow each other and other sites don't
    Given the zoom page is open
    And a second tab is open on the zoom page's site
    And the other zoom page is open
    When I zoom in on the second tab
    Then the zoom page is at 110%
    And the other zoom page is at 100%

  @F62-5 @F62
  Scenario: a private tab's zoom is never saved
    Given the zoom page is open
    And a private tab is open on the zoom page's site
    When I zoom in on the private tab
    Then the private tab is at 110%
    And the zoom page is at 100%
    And no site zoom is saved

  @F62-6 @F62
  Scenario: profiles keep their own zoom
    Given the zoom page is open
    And a Work profile tab is open on the zoom page's site
    When I zoom in on the Work profile tab
    Then the Work profile tab is at 110%
    And the zoom page is at 100%
    And Settings in the Work window lists only the Work profile's site
    And no site zoom is saved

  @F62-7 @F62
  Scenario: zoom keeps working after a PDF
    Given the default page zoom is 75%
    And the zoom page is open
    When the zoom page shows a PDF and then a web page
    Then the zoom page is drawn at 75%
    When I zoom in on the zoom page
    Then the zoom page is drawn at 80%

  @F62-8 @F62
  Scenario: a quiet tab wakes at the current default
    Given the zoom page is open
    And the other zoom page is open
    When the zoom page goes quiet
    And the default page zoom is 75%
    And the zoom page wakes
    Then the zoom page is at 75%

  @F62-9 @F62
  Scenario: Settings lists saved sites, and removing one updates open tabs
    Given the zoom page is open
    When I zoom in on the zoom page
    Then Settings lists the zoom page's site at 110%
    When I remove the zoom page's site in Settings
    Then the zoom page is at 100%
    And no site zoom is saved

  @F62-10 @F62
  Scenario: browsing at a default leaves no hosts in Chromium's preferences
    Given the default page zoom is 75%
    And the zoom page is open
    When I relaunch Blanc
    Then Chromium's preferences hold no zoom for the zoom page's site
