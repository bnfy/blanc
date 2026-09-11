@duo @ios @mobile
Feature: iPhone Duo postures
  Blanc keeps one Island model across iPhone Duo's two displays and its poses.
  Where iOS places controls on a vertical side edge, the Island splits into a
  horizontal readout and system toolbar actions (D27); where it keeps
  horizontal bars, the ordinary resting pill returns. Nothing is recreated when
  the device opens or closes.

  Steps are written at the level of user intent. "The outer display" and "the
  inner display" are simulator configurations until hardware acceptance; a
  simulator pass is recorded as simulator-verified in index.md, never as
  SHIPPED.

  @F1-3 @F1 @D27
  Scenario: The outer display shows the readout and vertical actions
    Given three open tabs with the active page on news.example
    And the device is closed so Blanc is on the outer display
    Then the Island readout shows the favicon, the domain news.example, and the protection state
    And the readout sits inside the content area clear of the side bar and the camera
    And the side bar shows New Tab and Reload at the top of its action items
    And the side bar shows three tab dots with the active dot emphasized
    And no Blanc-drawn ellipsis appears anywhere in the chrome

  @F1-4 @F1 @D27
  Scenario: Opening the device restores the single pill without losing state
    Given the device is closed with the palette open and "exa" typed into it
    When I open the device upright to the inner display in portrait
    Then the palette is still open with "exa" typed into it
    And the ordinary resting pill is shown with the same tabs, dots, and domain
    And the active page was not reloaded and keeps its scroll position
    When I close the device again
    Then the readout and side bar return and the palette text is still "exa"

  @F1-5 @F1 @D27
  Scenario: Inner display in landscape and Split View keep controls on Blanc's outer edge
    Given the device is open on the inner display in landscape
    Then the Island actions sit on a vertical side edge and the readout is horizontal
    When another app shares the inner display with Blanc in Split View
    Then Blanc's actions sit on the edge farthest from the other app
    And the readout is inset from the edge shared with the other app
    And the page remains fully usable at the compact width

  @F1-6 @F1 @F11 @D27
  Scenario: A badged Downloads item survives compression
    Given the device is closed and a download is in progress
    When the available space compresses the side bar
    Then Downloads stays visible with its badge while lower-priority items move to the system overflow menu
    And every compressed action is listed in the system overflow menu by its title

  @F1-7 @F1 @F13 @F12 @D27 @D11
  Scenario: Expanded surfaces stay off the folding region
    Given the device is open and partially folded like a book
    When I open the palette
    Then the palette sheet is positioned entirely on one side of the folding region
    When I dismiss it and a page requests the microphone
    Then the permission prompt is positioned entirely on one side of the folding region
    When I dismiss it and open the protection popover from the readout
    Then the popover is positioned entirely on one side of the folding region

  @F1-8 @F1 @D27
  Scenario: The inner camera moves the chrome and the page aside only while active
    Given the device is open on the inner display in portrait
    When a page starts using the front camera
    Then the page content and the resting pill move clear of the camera region
    When the page stops using the camera
    Then the page content and the resting pill return to their previous positions

  @F8-2 @F8 @D27 @D11
  Scenario: The find capsule avoids the folding region without closing
    Given the device is open and a find for a word present 3 times is active
    When I fold the device partially
    Then the find capsule is positioned entirely on one side of the folding region
    And the match count still shows 3
    And the page stays interactive on both sides of the fold

  @F35-7 @F35 @F16 @D27 @D11
  Scenario: The start page keeps content off the fold with even columns
    Given a new tab showing the shelf layout on the inner display
    When I fold the device partially
    Then the shelf renders an even number of columns with a gutter over the folding region
    And no tile, card, or text is drawn across the folding region
    And the page does not scroll horizontally
    When I open the device flat again
    Then the shelf renders exactly as it did before folding
