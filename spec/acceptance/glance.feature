@glance @desktop
Feature: Glance reference pane
  Glance keeps one tab visible as a temporary reference beside the active page
  without moving either tab across its native window or local profile.

  @F34-1 @F34 @D11
  Scenario: Choose, use, promote, resize, and close a Glance reference
    Given two ordinary tabs in one workspace for Glance
    When I summon Glance from its native keyboard shortcut
    Then Glance shows a dedicated accessible local-tab picker
    When I filter the Glance picker and choose the reference tab
    Then the active page and Glance occupy separate dominant and reference panes
    When I focus the interactive Glance page
    Then the main and reference roles do not change
    When I promote the Glance pane
    Then the two visible tabs swap main and reference roles
    When I resize the Glance divider
    Then the main pane remains larger than the reference pane
    When I close Glance
    Then the active page fills the browser page region

  @F34-1 @F34 @D11
  Scenario: Change and close the underlying Glance tab without disturbing main
    Given three ordinary tabs with one open in Glance
    When I choose Change and select the replacement tab
    Then only the Glance reference changes
    When I cancel the Change picker with Escape
    Then focus returns to the Change control
    When I close the underlying Glance tab
    Then the active page fills the browser page region

  @F34-1 @F34 @D11
  Scenario: Stack Glance below the main page in a narrow workspace
    Given two ordinary tabs in one workspace for Glance
    When I open the reference tab in Glance
    And I narrow the workspace below the side-by-side threshold
    Then Glance has a labelled stacked header above its reference content

  @F34-1 @F34 @F31 @D11
  Scenario: Wake a quiet tab only after it is chosen for Glance
    Given a quiet background tab eligible for Glance
    When I summon Glance from its native keyboard shortcut
    And I filter the Glance picker and choose the reference tab
    Then the quiet reference wakes into Glance

  @F34-1 @F34 @F31 @D11
  Scenario: A visible Glance reference is never quieted
    Given two ordinary tabs in one workspace for Glance
    When I open the reference tab in Glance
    And quiet-tab housekeeping targets the visible reference
    Then the Glance reference stays awake beside the main page

  @F34-1 @F34 @D11
  Scenario: Cancelling a Change picker after its reference closed leaves focus on the page
    Given three ordinary tabs with one open in Glance
    When I open the Change picker and close the reference tab behind it
    And I dismiss the orphaned Change picker with Escape
    Then keyboard focus is not stranded on the chrome strip

  @F34-1 @F34 @D11
  Scenario: Media started in the reference pane is audible
    Given two ordinary tabs in one workspace for Glance
    When I open the reference tab in Glance
    And media starts playing in the reference pane
    Then the reference pane is not muted as a background tab

  @F34-1 @F34 @D11
  Scenario: A tab muted as a background tab is unmuted when it opens in Glance
    Given three ordinary tabs with one open in Glance
    When media starts playing in the background replacement tab
    And I choose Change and select the replacement tab
    Then the reference pane is not muted as a background tab

  @F34-1 @F34 @F2 @D11
  Scenario: Moving the main page to a new window promotes the reference
    Given two ordinary tabs in one workspace for Glance
    When I open the reference tab in Glance
    And I move the main page to a new window
    Then the reference is the only page of the original window

  @F34-1 @F34 @F2 @D11
  Scenario: Closing the main page's group promotes the reference
    Given four ordinary tabs with the third open in Glance
    And the main page and the fourth tab share a group
    When I close that group
    Then the reference is the main page and Glance is closed

  @F34-1 @F34 @F2 @D11
  Scenario: Closing a group that holds both panes leaves no reference behind
    Given three ordinary tabs with one open in Glance
    And the main page and the reference share a group
    When I close that group
    Then the third tab is the main page and Glance is closed

  @F34-1 @F34 @D11
  Scenario: Closing the reference tab returns focus to the main page
    Given two ordinary tabs in one workspace for Glance
    When I open the reference tab in Glance
    And the reference pane holds keyboard focus
    And I close the underlying Glance tab
    Then keyboard focus is on the main page

  @F34-1 @F34 @D11
  Scenario: Closing the main page announces the promoted reference
    Given two ordinary tabs in one workspace for Glance
    When I open the reference tab in Glance
    And I close the main page tab
    Then the strip announces that the reference is now the main page

  @F34-1 @F34 @F31 @D11
  Scenario: Cancelling the picker while a quiet tab wakes leaves Glance closed
    Given a quiet background tab that loads slowly
    When I summon Glance from its native keyboard shortcut
    And I choose the slow quiet tab and cancel with Escape before it wakes
    Then Glance stays closed after the tab finishes loading
    When I summon Glance from its native keyboard shortcut
    And I filter the Glance picker and choose the reference tab
    Then the quiet reference wakes into Glance

  @F34-1 @F34 @D11
  Scenario: Closing Glance takes the Change picker with it
    Given three ordinary tabs with one open in Glance
    When I open the Change picker and close Glance from the keyboard shortcut
    Then the picker is dismissed with Glance
    And keyboard focus is not stranded on the chrome strip

  @F34-1 @F34 @D11
  Scenario: Dragging the divider keeps it under the pointer
    Given two ordinary tabs in one workspace for Glance
    When I open the reference tab in Glance
    And I drag the Glance divider 80 pixels to the left from inside its grip
    Then the divider moved 80 pixels

  @F34-1 @F34 @D11
  Scenario: Window controls stay legible over the Glance header
    Given two ordinary tabs in one workspace for Glance
    When I open the reference tab in Glance
    Then window controls over the side-by-side header ignore the page tint
    When I narrow the workspace below the side-by-side threshold
    Then window controls follow the page tint while Glance is stacked

  @F34-1 @F34 @D11
  Scenario: The Change picker stays usable when Glance is stacked
    Given three ordinary tabs with one open in Glance
    When I shrink the workspace to a small stacked window
    And I open the Change picker
    Then the Change picker is centred over the page with a visible list

  @F34-1 @F34 @D11
  Scenario: Glance explains itself with a single tab
    Given a single ordinary tab for Glance
    When I summon Glance from its native keyboard shortcut
    Then the picker says to open another tab

  @F34-1 @F34 @F3 @D11
  Scenario: Tab reorder announcements are not trapped in the hidden picker
    Given two ordinary tabs in one workspace for Glance
    When I open the Island panel
    Then the drag live region is rendered while the panel is open

  @F34-1 @F34 @F31 @D11
  Scenario: Choosing again before a cancelled wake lands opens Glance without a contradictory announcement
    Given a quiet background tab that loads slowly
    When I summon Glance from its native keyboard shortcut
    And I choose the slow quiet tab and cancel with Escape before it wakes
    And I summon Glance from its native keyboard shortcut
    And I filter the Glance picker and choose the reference tab
    Then the quiet reference wakes into Glance
    And the strip's last Glance announcement is that the reference opened

  @F34-1 @F34 @F31 @D11
  Scenario: A picker re-opened after a cancelled wake shows no stale error
    Given a quiet background tab that loads slowly
    When I summon Glance from its native keyboard shortcut
    And I choose the slow quiet tab and cancel with Escape before it wakes
    And I summon Glance from its native keyboard shortcut
    Then the fresh picker stays clean after the first wake lands

  @F34-1 @F34 @D11
  Scenario: The Glance header shows when the reference holds keyboard focus
    Given two ordinary tabs in one workspace for Glance
    When I open the reference tab in Glance
    And the reference pane is the focused pane
    Then the Glance header shows the reference has focus
    When the main page is the focused pane
    Then the Glance header shows the main page has focus
