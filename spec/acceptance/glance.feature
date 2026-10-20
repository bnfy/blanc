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
    And the Island shows no tab dots while Glance is open
    When I focus the interactive Glance page
    Then the main and reference roles do not change
    When I promote the Glance pane
    Then the two visible tabs swap main and reference roles
    When I resize the Glance divider
    Then the main pane remains larger than the reference pane
    When I close Glance
    Then the active page fills the browser page region
    And the Island shows its tab dots again

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

  @F34-1 @F34 @D11
  Scenario: A reference that already holds keyboard focus when Glance opens is the focused pane
    Given two ordinary tabs in one workspace for Glance
    When the reference tab takes keyboard focus while it is in the background
    And I open the reference tab in Glance
    Then the recorded focused pane is the pane that holds keyboard focus

  @F34-1 @F34 @D11
  Scenario: Reload with focus in the reference reloads the reference
    Given two ordinary tabs in one workspace for Glance
    When I open the reference tab in Glance
    And the reference pane is the focused pane
    And I press the reload command
    Then only the reference page reloaded

  @F34-1 @F34 @D11
  Scenario: Close Tab with focus in the reference closes the reference tab only
    Given two ordinary tabs in one workspace for Glance
    When I open the reference tab in Glance
    And the reference pane is the focused pane
    And I press the close-tab command
    Then the reference tab is closed and the main page has focus
    When I press the close-tab command
    Then the main page tab is closed

  @F34-1 @F34 @D11
  Scenario: Replacing the reference hands commands back to the main page
    Given three ordinary tabs with one open in Glance
    When the reference pane is the focused pane
    And the replacement tab becomes the reference without a focus change
    And I press the reload command
    Then only the main page reloaded
    And the Glance header shows the main page has focus

  @F34-1 @F34 @D11
  Scenario: Find with focus in the reference searches the reference
    Given two ordinary tabs in one workspace for Glance
    When I open the reference tab in Glance
    And the reference pane is the focused pane
    And I press the find command
    Then the find capsule sits over the reference pane and searches it
    When I promote the Glance pane
    Then the find capsule is closed

  @F34-1 @F34 @D11
  Scenario: Zoom and Back follow focus into the reference
    Given a main page and a reference on another site, both with history
    When the reference pane is the focused pane
    And I press the zoom-in command
    Then only the reference page is zoomed
    When I press the back command
    Then only the reference page went back

  @F34-1 @F34 @F38 @D11
  Scenario: The 1Password fill and its hint follow the focused pane
    Given 1Password fill is configured and the Glance reference shows a login form
    When the reference pane is the focused pane
    Then the 1Password fill targets the reference pane
    And the Island shows the fill hint
    When the main page is the focused pane
    Then the 1Password fill targets the main page
    And the Island hides the fill hint

  @F34-1 @F34 @F38 @D11
  Scenario: A reference navigation leaves a 1Password question about the main page alone
    Given 1Password fill is configured and the Glance reference shows a login form
    When the main page is the focused pane
    And a fill confirmation question is presented
    And the reference pane navigates to another page
    Then the fill question is still showing
    When the main page navigates to another page
    Then the fill question is gone

  @F34-1 @F34 @D11
  Scenario: A mouse gesture in the reference acts on the reference
    Given two ordinary tabs in one workspace for Glance
    When I open the reference tab in Glance
    And I draw the reload gesture in the reference pane
    Then only the reference page reloaded

  @F34-1 @F34 @D11
  Scenario: A link that opens a new tab from the reference opens into Glance
    Given a Glance reference with a link that opens a new tab
    When I click that link in the reference pane
    Then the new tab is the reference and the old reference stays open
    And the main page is unchanged

  @F34-1 @F34 @D11
  Scenario: A background-tab click in the reference stays in the background
    Given a Glance reference with a link that opens a new tab
    When I click that link in the reference pane as a background tab
    Then a background tab opened and Glance shows the same reference

  @F34-1 @F34 @F11 @D11
  Scenario: A private reference opens its new tab privately into Glance
    Given a private Glance reference with a link that opens a new tab
    When I click that link in the reference pane
    Then the new tab is the reference and the old reference stays open
    And the new reference is private

  @F34-1 @F34 @D11
  Scenario: The Glance header goes back and reloads the reference
    Given a main page and a reference on another site, both with history
    Then the Glance header's Back button is enabled
    When I click Back in the Glance header
    Then only the reference page went back
    And the Glance header's Back button is disabled
    When I click Reload in the Glance header
    Then only the reference page reloaded
    When the reference starts a slow load
    Then the Glance header's Reload button reads Stop

  @F34-1 @F34 @D11
  Scenario: Right-clicking the Glance header addresses the reference tab
    Given two ordinary tabs in one workspace for Glance
    When I open the reference tab in Glance
    Then a right-click on the Glance title addresses the reference tab
    And a right-click on a Glance header button addresses no tab

  @F34-1 @F34 @D11
  Scenario: Find pressed in the other pane starts a fresh search there
    Given two ordinary tabs in one workspace for Glance
    When I open the reference tab in Glance
    And the main page is the focused pane
    And I press the find command
    And I search the page for "widget"
    And the reference pane is the focused pane
    And I press the find command
    Then the find capsule is fresh and bound to the reference

  @F34-1 @F34 @D11
  Scenario: The Island stays clear of the macOS traffic lights while Glance is open
    Given two ordinary tabs in one workspace for Glance
    When I open the reference tab in Glance
    Then a full-width Island stays clear of the window's traffic lights
    When I narrow the workspace below the side-by-side threshold
    Then a full-width Island stays clear of the window's traffic lights

  @F34-1 @F34 @F28 @D11
  Scenario: The Island stays clear of the Windows and Linux window controls while Glance is open
    Given two ordinary tabs in one workspace for Glance
    When I open the reference tab in Glance
    Then a full-width Island stays clear of the Windows and Linux window controls
    When I narrow the workspace below the side-by-side threshold
    Then a full-width Island stays clear of the Windows and Linux window controls
    When I switch the Glance window to vertical tabs
    Then a full-width Island stays clear of the Windows and Linux window controls
    And the Glance window returns to its usual layout

  @F34-1 @F34 @F3 @D11
  Scenario: The Island's controls stay inside it when the main pane is narrow
    Given twelve ordinary tabs with one open in Glance
    When I narrow the main pane to its smallest side-by-side width
    Then every Island control stays inside the Island
    And the Island's address stays readable
    And the Island shows no tab dots while Glance is open
    And the Glance window returns to its usual layout

  @F34-1 @F34 @F11 @D11
  Scenario: The divider leaves room for the Island's chips too
    Given twelve ordinary tabs and a private main page with one open in Glance
    When I narrow the main pane to its smallest side-by-side width
    Then every Island control stays inside the Island
    And the Island's address stays readable
    And the Glance window returns to its usual layout

  @F34-1 @F34 @F3 @D11
  Scenario: The Island makes room for a new chip and grows back when it goes
    Given twelve ordinary tabs in a narrow window
    When a download starts
    Then the Island makes room for the downloads button
    When the download indicator goes away
    Then the Island shows as many tab dots as before
    And the Glance window returns to its usual layout

  @F34-1 @F34 @D11
  Scenario: Stacked on Windows and Linux, the Island keeps its address readable in a small window
    Given twelve ordinary tabs with one open in Glance
    When the window is as small as it goes with the Windows and Linux window controls
    Then every Island control stays inside the Island
    And the Island's address stays readable
    And a full-width Island stays clear of the Windows and Linux window controls
    And the Glance window returns to its usual layout

  @F34-1 @F34 @F12 @D11
  Scenario: A growing blocked count leaves the Island's dots alone
    Given twelve ordinary tabs in a narrow window
    When the active page's blocked count grows from 9 to 123
    Then the Island's tab dots were not rebuilt
    And the Glance window returns to its usual layout

  @F34-1 @F34 @F3 @D11
  Scenario: The Island re-fits when the interface font finishes loading
    Given twelve ordinary tabs in a narrow window
    When the interface font finishes loading with wider letters
    Then the Island's address is whole and its controls fit
    And the Glance window returns to its usual layout

  @F34-1 @F34 @F9 @D11
  Scenario: Close Tab from the find bar on the reference hands focus to the main page
    Given two ordinary tabs in one workspace for Glance
    When I open the reference tab in Glance
    And the reference pane is the focused pane
    And I press the find command
    And I press the close-tab command in the find bar
    Then the reference tab is closed and the main page has focus

  @F34-1 @F34 @F2 @D11
  Scenario: A new window's first Glance layout already leaves room for the Island
    Given twelve ordinary tabs with one open in Glance
    When I narrow the main pane to its smallest side-by-side width
    And I open Glance in a new window just wide enough to stay side by side
    Then its first layout already stops the divider at the Island's minimum
    And the Glance window returns to its usual layout

  @F34-1 @F34 @D11
  Scenario: The Glance header stays clear of the Windows and Linux window controls at its narrowest
    Given two ordinary tabs in one workspace for Glance
    When I open the reference tab in Glance
    And the strip draws the Windows and Linux window controls
    And I drag the Glance divider as far right as it goes
    Then the Glance header's buttons are clear of the window controls
    And the Glance window returns to its usual layout

  @F34-1 @F34 @F28 @D11
  Scenario: Stacked with vertical tabs on Windows and Linux, the Island's controls stay inside it
    Given twelve ordinary tabs with one open in Glance
    When the strip draws the Windows and Linux window controls
    And the window is 700 pixels wide
    And I switch the Glance window to vertical tabs
    Then every Island control stays inside the Island
    And the Island's address stays readable
    And the Island stays clear of the window controls and the tab rail
    And the Glance window returns to its usual layout

  @F34-1 @F34 @D11
  Scenario: The Glance title keeps its room beside the Windows and Linux window controls
    Given two ordinary tabs in one workspace for Glance
    When I open the reference tab in Glance
    And the window is 1200 pixels wide
    And the strip draws the Windows and Linux window controls
    Then the Glance title shows at least ten characters
    And Make main still says what it does
    And the Glance window returns to its usual layout

  @F34-1 @F34 @D11
  Scenario: A new tab opened with focus in the reference makes the main page the focused pane
    Given two ordinary tabs in one workspace for Glance
    When I open the reference tab in Glance
    And the reference pane is the focused pane
    And I press the new-tab command
    Then the recorded focused pane is the main page

  @F34-1 @F34 @D11
  Scenario: Activating the window again keeps the focused pane truthful
    Given two ordinary tabs in one workspace for Glance
    When I open the reference tab in Glance
    And the reference pane is the focused pane
    And another Blanc window takes the foreground and this one is activated again
    Then the recorded focused pane is the pane that holds keyboard focus

  @F34-1 @F34 @D11
  Scenario: Glance opens and closes with the chrome's motion
    Given two ordinary tabs in one workspace for Glance
    When I open the reference tab in Glance
    Then the Glance header and divider glide in on the chrome's curve
    When I choose Change from the Glance header
    Then the Change picker grows out of the Change control
    When I press Escape in the Change picker
    Then the picker is still drawn while it leaves

  @F34-1 @F34 @D11
  Scenario: With Reduce Motion Glance only fades
    Given two ordinary tabs in one workspace for Glance
    And Reduce Motion is on
    When I open the reference tab in Glance
    Then the Glance header and divider only fade
    When I narrow the workspace below the side-by-side threshold
    And I close Glance
    Then the leaving stacked header and divider do not move

  @F34-1 @F34 @D11
  Scenario: Choosing an awake tab says nothing about opening
    Given two ordinary tabs in one workspace for Glance
    When I summon Glance from its native keyboard shortcut
    And I filter the Glance picker and choose the reference tab
    Then the live region never said Opening

  @F34-1 @F34 @D11
  Scenario: Picker rows read like the panel's rows
    Given a quiet background tab and a private background tab eligible for Glance
    When I summon Glance from its native keyboard shortcut
    Then the quiet row is dimmed and says quiet only to assistive tech
    And the private row carries the private chip
    And every picker row has a tooltip with its title and host
    And the row names join their parts with commas

  @F34-1 @F34 @D11
  Scenario: Arrow keys move the highlight quietly
    Given twelve ordinary tabs with one open in Glance
    When I choose Change from the Glance header
    And I press ArrowDown in the picker
    Then the live region did not re-announce the count
    When I type "a" into the picker filter and press Home
    Then the caret is at the start of the filter and the first row is still highlighted

  @F34-1 @F34 @D11
  Scenario: A chosen quiet tab says Opening while it wakes
    Given a quiet background tab that loads slowly
    When I summon Glance from its native keyboard shortcut
    And I choose the slow quiet tab in the picker
    Then the chosen row says Opening and the live region says it
    And the other rows are dimmed while it wakes

  @F34-1 @F34 @F11 @D11
  Scenario: A private reference shows the private chip in the header
    Given twelve ordinary tabs and a private main page with one open in Glance
    Then the Glance header shows no private chip
    When I choose Make main
    Then the Glance header shows the private chip
    And the header's identity cross-faded rather than swapping

  @F34-1 @F34 @D11
  Scenario: The picker is a dialog named by its heading
    Given two ordinary tabs in one workspace for Glance
    When I summon Glance from its native keyboard shortcut
    Then the picker has the dialog role and is labelled by its heading

  @F34-1 @F34 @D11
  Scenario: Make main names both pages
    Given two ordinary tabs in one workspace for Glance
    When I open the reference tab in Glance
    And I choose Make main
    Then the strip announces "glance-reference is now the main page; glance-main is in Glance"

  @F34-1 @F34 @F14 @D11
  Scenario: /glance opens the picker filtered to the typed text
    Given twelve ordinary tabs in one workspace
    When I run the slash command "/glance many-3"
    Then the Glance picker is open with the filter "many-3" and one row

  @F34-1 @F34 @D11
  Scenario: /glance with Glance open opens the Change picker
    Given two ordinary tabs in one workspace for Glance
    When I open the reference tab in Glance
    And I run the slash command "/glance"
    Then the Change picker is open

  @F34-1 @F34 @D11
  Scenario: /glance with nothing else open still opens the picker
    Given a single ordinary tab for Glance
    When I run the slash command "/glance work"
    Then the picker says to open another tab and keeps the filter "work"

  @F34-1 @F34 @D11
  Scenario: Open Link in Glance makes the link the reference
    Given two ordinary tabs in one workspace for Glance
    When I open a link from the main page in Glance
    Then the linked page is the reference and the main page is untouched
    When I open a link from the reference in Glance
    Then the linked page replaced the reference

  @F34-1 @F34 @F11 @D11
  Scenario: Open Link in Glance from a private page stays private
    Given a private main page and an ordinary tab
    When I open a link from the main page in Glance
    Then the reference is a private tab in the private session

  @F34-2 @F34 @D11
  Scenario: A Glance opens as a centered card over the page
    Given two ordinary tabs in one workspace for Glance
    And the window's page is 1440 by 860
    When I open the reference tab in Glance
    Then the Glance is a large centered card over the whole main page

  @F34-3 @F34 @D11
  Scenario: The card keeps its header on screen when the window shrinks and grows
    Given two ordinary tabs in one workspace for Glance
    And the window's page is 1440 by 860
    When I open the reference tab in Glance
    And the window's page is 700 by 500
    Then the card keeps its share of the page with its header on screen
    When the window's page is 1300 by 820
    Then the card keeps its share of the page with its header on screen

  @F34-4 @F34 @D11
  Scenario: Moving the card keeps it there for the next Glance
    Given two ordinary tabs in one workspace for Glance
    And the window's page is 1440 by 860
    When I open the reference tab in Glance
    And I move the Glance card by -120, -16
    Then the Glance card has moved by -120, -16
    When I close Glance
    And I open the reference tab in Glance
    Then the Glance card has moved by -120, -16

  @F34-5 @F34 @D11
  Scenario: Resizing the card from an edge, and double-clicking its header to reset it
    Given two ordinary tabs in one workspace for Glance
    And the window's page is 1440 by 860
    When I open the reference tab in Glance
    And I drag the Glance card's left edge 300 to the right
    Then the Glance card is 300 narrower with its right edge where it was
    When I double-click the Glance card's header
    Then the Glance is a large centered card over the whole main page

  @F34-6 @F34 @D11
  Scenario: Switching to another tab closes the Glance, and switching back doesn't bring it back
    Given three ordinary tabs with one open in Glance
    When I switch to the replacement tab
    Then Glance is closed and the replacement tab fills the page
    When I switch back to the original main page
    Then Glance stays closed

  @F34-7 @F34 @D11
  Scenario: Choosing the Glance tab itself opens it as the tab
    Given three ordinary tabs with one open in Glance
    When I choose the Glance tab from the tab list
    Then the Glance tab is the current tab and Glance is closed

  @F34-8 @F34 @D11
  Scenario: Open as tab makes the Glance page the current tab and keeps the old page open
    Given three ordinary tabs with one open in Glance
    When I choose Open as tab on the Glance card
    Then the Glance tab is the current tab and Glance is closed
    And the original main page is still open

  @F34-9 @F34 @D11
  Scenario: Escape on the card's header closes it; Escape inside the Glance page goes to the page
    Given three ordinary tabs with one open in Glance
    When I press Escape inside the Glance page
    Then the Glance page received the Escape and Glance is still open
    When I press Escape on the Glance card's header
    Then Glance is closed and the original main page fills the page

  @F34-10 @F34 @D11
  Scenario: Clicking and scrolling the page behind keeps the Glance open
    Given three ordinary tabs with one open in Glance
    When I click and scroll the main page beside the card
    Then Glance is still open over the main page

  @F34-15 @F34 @D11
  Scenario: Closing the main page while a Glance is open makes the Glance page the current tab
    Given three ordinary tabs with one open in Glance
    When I close the main page
    Then the Glance tab is the current tab and Glance is closed
