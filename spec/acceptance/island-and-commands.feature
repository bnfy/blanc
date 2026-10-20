@island
Feature: Island chrome, command palette, and slash commands
  The single custom command surface: the resting pill, the expanded command
  palette with the Quick Switcher, and slash commands. Steps are intent-level;
  each platform binds them to its native trigger (D7) and windowing (D11).

  Background:
    Given ad/tracker blocking is enabled

  @F1-1 @F1 @all
  Scenario: The resting pill reflects the active tab and its blocking state
    Given a group named "work" with 3 tabs
    And the active tab is in "work" on a page where 2 requests were blocked
    When the island is at rest
    Then the island shows back and forward controls
    And the island shows 3 direct tab dots
    And the island shows the active page's domain
    And the island shows a shield count of 2
    And the island shows the trailing action cluster

  @F1-2 @F1 @all
  Scenario: Opening the palette floats the command bar with the tab switcher
    Given 2 tabs are open
    When I open the command palette
    Then the command bar is shown over the page content
    And the list area shows the tab switcher

  @F1-3 @F1 @desktop @island-hover
  Scenario: Hover-open is off by default
    Given Island hover-open is off
    When I rest the pointer over the Island for 400 milliseconds
    Then the Island panel stays closed

  @F1-4 @F1 @desktop @island-hover
  Scenario: Hover-open waits for its dwell before opening
    Given Island hover-open is on
    When I rest the pointer over the Island for less than 300 milliseconds
    Then the Island panel stays closed
    When I keep the pointer there through the 300 millisecond dwell
    Then the Island panel opens from hover

  @F1-5 @F1 @desktop @island-hover
  Scenario: Crossing the Island does not open it
    Given Island hover-open is on
    When I cross the Island in 150 milliseconds
    Then the Island panel stays closed after 400 milliseconds

  @F1-6 @F1 @desktop @island-hover
  Scenario: Motion inside the Island does not postpone opening
    Given Island hover-open is on
    When I move within the Island every 50 milliseconds
    Then the Island panel opened during continuous motion

  @F1-7 @F1 @desktop @island-hover
  Scenario: The proximity band does not count as hovering the Island
    Given Island hover-open is on
    When I rest the pointer 100 pixels below the Island for 400 milliseconds
    Then the Island panel stays closed

  @F1-8 @F1 @desktop @island-hover
  Scenario: Closing under a resting pointer requires an exit before reopening
    Given Island hover-open is on
    And the Island panel opened normally with the pointer outside it
    And the test cursor is resting over the Island
    When I dismiss the panel without moving the pointer
    Then the resting pointer is disarmed inside the Island
    When I send another move inside the Island
    Then the Island panel stays closed after 600 milliseconds
    When I leave and re-enter the Island
    Then the Island panel opens from hover

  @F1-9 @F1 @desktop @island-hover
  Scenario: An ordinary open during the dwell wins once
    Given Island hover-open is on
    When I open the Island normally during its hover dwell
    Then exactly one Island panel is open

  @F1-10 @F1 @desktop @island-hover
  Scenario: An open shield popover blocks hover-open
    Given a tab open on "hover-shield"
    And Island hover-open is on
    And the shield popover is open for hover testing
    When I rest the pointer over the Island for 400 milliseconds
    Then the shield popover remains open without the Island panel

  @F1-11 @F1 @desktop @island-hover
  Scenario: Hover-open works with vertical tabs
    Given Island hover-open is on with vertical tabs
    When I rest the pointer over the Island through its dwell
    Then the Island panel opens from hover

  @F1-12 @F1 @desktop @island-hover
  Scenario: Turning hover-open off cancels an active dwell
    Given Island hover-open is on
    When I turn Island hover-open off halfway through its dwell
    Then the Island panel stays closed after 400 milliseconds

  @F1-14 @F1 @desktop @island-hover
  Scenario: Only the address area opens the Island on hover
    Given Island hover-open is on
    When I rest the pointer on the Island buttons beside the address for 400 milliseconds
    Then the Island panel stays closed
    When I rest the pointer over the Island for 400 milliseconds
    Then the Island panel opens from hover

  @F1-13 @F1 @desktop @island-hover
  Scenario: A pending permission prompt blocks hover-open
    Given Island hover-open is on
    When a site requests geolocation
    Then the Blanc permission prompt for geolocation is shown
    When I rest the pointer over the Island for 400 milliseconds
    Then the permission prompt remains open without the Island panel

  @F1-20 @F1 @desktop @island-hover
  Scenario: A panel opened by hover closes once the pointer leaves it
    Given Island hover-open is on
    And the Island panel has opened from hover
    When I move the pointer off the panel
    Then the Island panel closes after its grace period
    And the overlay is gone with the panel

  @F1-21 @F1 @desktop @island-hover
  Scenario: A hover-opened panel stays open once it is used
    Given Island hover-open is on
    And the Island panel has opened from hover
    When I type in the panel
    And I move the pointer off the panel
    Then the Island panel stays open after 600 milliseconds

  @F1-15 @F1 @desktop @island-autohide
  Scenario: Auto-hide gives the page the whole window
    Given a tab open on "autohide-page"
    When I turn on auto-hide
    Then the Island stays shown with a tip on bringing it back
    And then the page starts at the top of the window
    When auto-hide is turned off
    Then the page starts below the Island

  @F1-16 @F1 @desktop @island-autohide
  Scenario: The top edge reveals the Island and leaving hides it
    Given a tab open on "autohide-page"
    And the Island auto-hides
    When I point at the top edge of the window
    Then the Island is shown above the page
    When I move the pointer well below the Island
    Then the Island hides again

  @F1-19 @F1 @desktop @island-autohide
  Scenario: Resting the pointer at the top edge reveals the Island without any page movement
    Given a tab open on "autohide-page"
    And the Island auto-hides
    When the pointer rests at the top edge without the page seeing it move
    Then the Island is shown above the page

  @F1-17 @F1 @desktop @island-autohide
  Scenario: The palette keeps an auto-hidden Island shown
    Given a tab open on "autohide-page"
    And the Island auto-hides
    When I open the command palette
    Then the Island is shown above the page
    And the Island stays shown while the palette is open
    When the palette closes with the pointer well below the Island
    Then the Island hides again

  @F1-22 @F1 @desktop @island-autohide
  Scenario: Resting just below the top edge reveals the Island after a moment
    Given a tab open on "autohide-page"
    And the Island auto-hides
    When the pointer rests 30 pixels below the top edge
    Then the Island is shown above the page

  @F1-23 @F1 @desktop @island-autohide
  Scenario: Passing just below the top edge does not reveal the Island
    Given a tab open on "autohide-page"
    And the Island auto-hides
    When the pointer passes 30 pixels below the top edge for 150 milliseconds
    Then the Island stays hidden after 600 milliseconds

  @F1-24 @F1 @desktop @island-autohide
  Scenario: Without a global pointer position the page's own moves reveal and hide the Island
    Given a tab open on "autohide-page"
    And the Island auto-hides
    And the window has no global pointer position, as on native Wayland
    When the page sees the pointer at the top edge
    Then the Island is shown above the page
    When the page sees the pointer well below the Island
    Then the Island hides again

  @F1-25 @F1 @desktop @island-autohide
  Scenario: A hidden strip drags the window only through its thin top band
    Given a tab open on "autohide-page"
    And the Island auto-hides
    Then the strip has no window-drag region
    And the thin top band drags the window
    When I point at the top edge of the window
    Then the Island is shown above the page
    And the strip drags the window again

  @F1-26 @F1 @desktop @island-autohide @island-hover
  Scenario: Resting where the hidden address will appear still lets hover open the Island
    Given a tab open on "autohide-page"
    And Island hover-open is on
    And the Island auto-hides
    When the pointer rests on the page where the hidden address will appear
    Then hover-open is still armed
    And the Island is shown above the page
    When I move within the revealed address
    Then the Island panel opens from hover

  @F1-27 @F1 @desktop @island-autohide
  Scenario: The vertical rail is never reveal territory
    Given a tab open on "autohide-page"
    And the Island auto-hides with vertical tabs
    When the pointer rests at the top edge over the rail
    Then the Island stays hidden after 600 milliseconds
    When the pointer rests 30 pixels down over the rail
    Then the Island stays hidden after 600 milliseconds
    When the pointer rests at the top edge over the page pane
    Then the Island is shown above the page

  @F1-28 @F1 @desktop @island-autohide
  Scenario: A floating Island keeps a thin top band to drag the window
    Given a tab open on "autohide-page"
    And the Island auto-hides and floats
    Then the strip has no window-drag region
    And the thin top band drags the window
    And the window buttons stay on screen
    When I point at the top edge of the window
    Then the Island is revealed while the page stays at the top of the window
    And the thin top band drags the window

  @F1-29 @F1 @desktop @island-autohide
  Scenario: A floating Island leaves the page where it is
    Given a tab open on "autohide-page"
    And the Island auto-hides and floats
    When the pointer rests at the top edge without the page seeing it move
    Then the Island is revealed while the page stays at the top of the window

  @F1-18 @F1 @desktop @island-autohide
  Scenario: Auto-hide works with vertical tabs
    Given a tab open on "autohide-page"
    And the Island auto-hides with vertical tabs
    Then the page starts at the top of the window beside the rail
    When I point at the top edge of the window
    Then the Island is shown above the page

  @F6-1 @F6 @all
  Scenario: The Quick Switcher matches open tabs and favorites
    Given a tab open on "news.example"
    And a favorite for "docs.example"
    When I open the command palette
    And I type "exa"
    Then the results include the tab "news.example"
    And the results include the favorite "docs.example"

  @F6-2 @F6 @all
  Scenario: The Quick Switcher matches a group name and focuses it
    Given a group named "research" with 2 tabs that is not active
    When I open the command palette
    And I type "research"
    Then a group result "research" is listed above any tab results
    When I choose the group result "research"
    Then the active tab is one of the tabs in "research"

  @F7-1 @F7 @all
  Scenario: A slash prefix filters the command list
    When I open the command palette
    And I type "/gr"
    Then the command "/group" is listed
    And the command "/history" is not listed

  @F7-2 @F7 @all
  Scenario Outline: Running a slash command performs its action
    When I open the command palette
    And I run the slash command "<command>"
    Then <outcome>

    Examples:
      | command    | outcome                                          |
      | /new       | a new ungrouped tab opens on the new-tab page     |
      | /downloads | the downloads page opens in the utility sheet     |
      | /find      | the find bar is shown                             |

  @F7-3 @F7 @desktop
  Scenario Outline: A shortened slash command reads its argument after the typed word
    Given a tab open on "slash-arguments"
    And the appearance is set to "light"
    When I run the slash command "<typed>"
    Then <outcome>

    Examples:
      | typed        | outcome                                                    |
      | /gr work     | a group named "work" exists                                |
      | /sav Reading | the page on "slash-arguments" is a Favorite in "Reading"   |
      | /the dark    | the appearance is "dark"                                   |
      | /spa Weekend | a space named "Weekend" is saved and this window is in it |

  @F7-4 @F7 @desktop
  Scenario: A group command with no name asks for one
    Given a tab open on "slash-arguments"
    When I run the slash command "/gr"
    Then the command bar reads "/group " with "" selected
    And no group exists

  @F47-1 @F47 @desktop
  Scenario: A typed bang shows a hint row and Enter lands on the site
    Given a tab open on "bangs-start"
    When I type "!yt lofi" in the command bar
    Then the bang hint row reads "Search YouTube for “lofi”"
    When I submit the command-bar text
    Then the bang submission goes to "https://www.youtube.com/results?search_query=lofi"

  @F47-2 @F47 @desktop
  Scenario: A bare known code opens the site's home
    Given a tab open on "bangs-start"
    When I type "!yt" in the command bar
    Then the bang hint row reads "Open YouTube"
    When I submit the command-bar text
    Then the bang submission goes to "https://www.youtube.com/"

  @F47-3 @F47 @desktop
  Scenario: A bang at the end of the text works the same
    Given a tab open on "bangs-start"
    When I type "lofi !yt" in the command bar
    Then the bang hint row reads "Search YouTube for “lofi”"
    When I submit the command-bar text
    Then the bang submission goes to "https://www.youtube.com/results?search_query=lofi"

  @F47-4 @F47 @desktop
  Scenario: ! alone lists popular bangs, then the ones used recently
    Given a tab open on "bangs-start"
    When I type "!" in the command bar
    Then the picker shows the section "Popular"
    And the picker lists "!wikipedia"
    When I type "!yt lofi" in the command bar
    And I submit the command-bar text
    Then the bang submission goes to "https://www.youtube.com/results?search_query=lofi"
    When I type "!" in the command bar
    Then the picker shows the section "Recent"
    And the picker lists "!yt" first
    When I press Arrow Down in the command bar
    Then the first picker row is highlighted

  @F47-5 @F47 @desktop
  Scenario: A known prefix shows its hint above the filtered picker, and a picked row fills the input
    Given a tab open on "bangs-start"
    When I type "!y" in the command bar
    Then the bang hint row reads "Open Yahoo!"
    And the picker lists "!yt"
    When I choose the picker row "!yt"
    Then the command bar text is "!yt "

  @F47-6 @F47 @desktop
  Scenario: A custom bang resolves, and one that shadows a built-in alias wins only for that alias
    Given a custom bang "m" named "Mine" for "https://m.example/?q=%s"
    And a custom bang "ytb" named "Shadow" for "https://shadow.example/?q=%s"
    And a tab open on "bangs-start"
    When I type "!m hi" in the command bar
    And I submit the command-bar text
    Then the bang submission goes to "https://m.example/?q=hi"
    When I type "!ytb hi" in the command bar
    And I submit the command-bar text
    Then the bang submission goes to "https://shadow.example/?q=hi"
    When I type "!yt hi" in the command bar
    And I submit the command-bar text
    Then the bang submission goes to "https://www.youtube.com/results?search_query=hi"

  @F47-7 @F47 @desktop
  Scenario: Turning bangs off takes effect in the open command bar
    Given the search engine is "duckduckgo"
    And a tab open on "bangs-start"
    When I type "!yt lofi" in the command bar
    Then the bang hint row reads "Search YouTube for “lofi”"
    When I turn bangs off while the command bar is open
    Then no bang hint row is shown
    When I submit the command-bar text
    Then the search submission uses "duckduckgo" for "!yt lofi"

  @F47-8 @F47 @desktop
  Scenario: Recently used bangs skip private tabs and go with the history
    Given the active tab is private
    When I type "!yt lofi" in the command bar
    And I submit the command-bar text
    Then the bang submission goes to "https://www.youtube.com/results?search_query=lofi"
    And the recently used bangs are ""
    Given a tab open on "bangs-start"
    When I type "!gh blanc" in the command bar
    And I submit the command-bar text
    Then the bang submission goes to "https://github.com/search?q=blanc"
    And the recently used bangs are "gh"
    When I run the slash command "/clear"
    Then the recently used bangs are ""

  @F47-9 @F47 @desktop
  Scenario: No suggestion request leaves while a bang is typed
    Given the autocomplete provider returns "lofi girl"
    And a tab open on "bangs-start"
    When I type "!yt lofi" in the command bar
    Then the autocomplete provider has not received a request

  @F47-10 @F47 @desktop
  Scenario: Main refuses a direct suggestions request for bang-shaped text
    Given the autocomplete provider returns "lofi girl"
    And a tab open on "bangs-start"
    When I type "plain" in the command bar
    Then a direct suggestions request for "!yt lofi" is refused
    And a direct suggestions request for "!zzz lofi" is refused

  @F47-11 @F47 @desktop
  Scenario: Your bangs are managed through Settings
    Given a tab open on "bangs-start"
    And the Settings sheet is open
    When I add the bang "m" named "Mine" for "https://m.example/?q=%s" in Settings
    Then Settings lists the bang "m"
    When I add the bang "a" named "Shop" for "https://shop.example/?q=%s" in Settings
    Then Settings says "Replaces the built-in !a (Amazon.com)"
    When I add the bang "m" named "Again" for "https://again.example/?q=%s" in Settings
    Then Settings says "You already have !m."
    When I add the bang "bad code" named "x" for "https://x.example/?q=%s" in Settings
    Then Settings says "That bang isn't valid — check the code and the address."
    When I remove the bang "m" in Settings
    And I remove the bang "a" in Settings
    Then Settings lists no bangs
    When I type "!m hi" in the command bar
    Then no bang hint row is shown

  @F47-12 @F47 @desktop
  Scenario: Arrow Down from the hint reaches the local matches under it
    Given a loaded tab titled "lofi hip hop"
    When I type "!yt lofi" in the command bar
    Then the bang hint row reads "Search YouTube for “lofi”"
    When I press Arrow Down in the command bar
    Then the row for the tab titled "lofi hip hop" is highlighted under the hint

  @F47-13 @F47 @desktop
  Scenario: A bare unknown code searches as typed, and ! alone does nothing
    Given the search engine is "duckduckgo"
    And a tab open on "bangs-start"
    When I type "!zzzq" in the command bar
    Then no bang hint row is shown
    When I submit the command-bar text
    Then the address submission goes to "https://duckduckgo.com/?q=!zzzq"

  @F47-14 @F47 @desktop
  Scenario: Arrow keys keep the highlighted picker row in view when the list scrolls
    Given a tab open on "bangs-start"
    And ten bangs were used recently
    When I type "!" in the command bar
    Then the picker shows the section "Recent"
    And the picker shows the section "Popular"
    When I press Arrow Up in the command bar
    Then the highlighted picker row is scrolled into view
    When I press Arrow Down in the command bar
    Then the first picker row is highlighted
    And the highlighted picker row is scrolled into view

  @F47-15 @F47 @desktop
  Scenario: Picker rows show site icons from Blanc's icon server, each site asked once
    Given Blanc's icon server has an icon for every popular bang
    And a tab open on "bangs-start"
    When I type "!" in the command bar
    Then the first picker row shows a site icon
    And Blanc's icon server was asked only for popular sites, once each
    When I close the command bar and type "!" again
    Then the first picker row shows a site icon
    And Blanc's icon server was asked only for popular sites, once each

  @F47-16 @F47 @desktop
  Scenario: A private tab never asks Blanc's icon server
    Given Blanc's icon server has an icon for every popular bang
    And the active tab is private
    When I type "!" in the command bar
    Then the first picker row shows the site's letter
    And Blanc's icon server has not been asked

  @F47-17 @F47 @desktop
  Scenario: A custom bang's site is never sent to Blanc's icon server
    # github.com is in the bundled list too, so only the custom-bang rule
    # keeps it from being asked for.
    Given Blanc's icon server has an icon for every popular bang
    And a custom bang "mine" named "Mine" for "https://github.com/search?q=%s"
    And a tab open on "bangs-start"
    When I type "!mine" in the command bar
    Then the bang hint row reads "Open Mine"
    And Blanc's icon server has not been asked for "github.com"

  @F47-18 @F47 @desktop
  Scenario: Clearing history clears the kept bang icons
    Given Blanc's icon server has an icon for every popular bang
    And a tab open on "bangs-start"
    When I type "!" in the command bar
    Then the first picker row shows a site icon
    And bang icons are kept on the device
    When I run the slash command "/clear"
    Then no bang icons are kept on the device
    When I type "!" in the command bar
    Then the first picker row shows a site icon
    And Blanc's icon server was asked again for a site it answered before
