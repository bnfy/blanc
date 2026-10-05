@settings @theming
Feature: Settings and theming
  Settings validation (shared schema + sanitize-on-read == validate-on-write) and
  live theme propagation to chrome, internal pages, and web content.

  @F14-1 @F14 @all
  Scenario: An invalid search engine is rejected
    When I attempt to set the search engine to "askjeeves"
    Then the search engine remains unchanged

  @F14-2 @F14 @all
  Scenario: A retired app icon falls back to the default
    When settings contain the app icon "ember"
    Then the effective app icon is "sunrise"

  @F14-3 @F14 @all
  Scenario: Exception hostnames are normalized
    When I add "WWW.Example.com/x" to the ad-block exceptions
    Then the ad-block exceptions contain "example.com"
    And the ad-block exceptions do not contain "www.example.com"

  @F14-4 @F14 @all
  Scenario: Search suggestions can be disabled without syncing the preference
    When I turn search suggestions off
    Then search suggestions are disabled
    And the search-suggestions preference remains device-local

  @F15-1 @F15 @all
  Scenario: Switching to dark recolors chrome and internal pages live
    Given an internal blanc page is open
    When I set the theme to "dark"
    Then the chrome uses the dark palette
    And the open internal page uses the dark palette
    And no restart was required

  @F15-2 @F15 @all
  Scenario: Private tabs use the private theme scope
    When the active tab is private
    Then the chrome uses the private palette

  @F14-5 @F14 @desktop
  Scenario: Long Settings explanations open in place without changing their text
    Given the settings page is open in the utility sheet
    Then long setting explanations are folded to two lines with a More control
    When I open the first folded explanation
    Then it shows its full text, unchanged

  @F42-1 @F42 @desktop
  Scenario: Dark websites darkens a white page while Blanc is dark
    Given Blanc uses the dark theme
    And Dark websites is turned on
    When I open a website that has no dark mode
    Then the page is dark from its first paint
    And the page's own scripts cannot see the Dark Reader engine

  @F42-2 @F42 @desktop
  Scenario: Dark websites leaves pages alone while it is off or Blanc is light
    Given Dark websites is turned off
    When I open a website that has no dark mode
    Then the page keeps its own colors
    When I turn Dark websites on while Blanc uses the light theme
    Then the page keeps its own colors

  @F42-3 @F42 @desktop
  Scenario: /dark-site keeps one site in its own colors
    Given Blanc uses the dark theme
    And Dark websites is turned on
    And a website that has no dark mode is open
    When I run "/dark-site"
    Then the page returns to its own colors without a reload
    And the site appears in the Dark websites site list

  @F42-4 @F42 @desktop
  Scenario: A private tab's /dark-site choice is not saved
    Given Blanc uses the dark theme
    And Dark websites is turned on
    And a website that has no dark mode is open in a private tab
    When I run "/dark-site"
    Then the page returns to its own colors
    And the Dark websites site list is unchanged

