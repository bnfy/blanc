@workspace
Feature: Named workspace preservation and recovery
  @F41-1
  Scenario: Switching preserves a dirty page in the same process
    Given a named workspace with a live unsaved draft
    When I switch to another named workspace and back
    Then the original page identity and draft are unchanged

  @F41-2
  Scenario: Opening the current workspace does not warn about private tabs
    Given a named workspace with a live unsaved draft
    When I open a private tab and select the current named workspace
    Then the workspace action is a no-op and both pages remain open

  @F41-3
  Scenario: Failed rename preserves the editor and its input
    Given two named workspaces for editing
    When I rename one workspace to the other workspace name
    Then the name and validation error stay visible in the workspace editor

  @F41-4
  Scenario: A switch decision remains visible while searching or clicking outside
    Given a named workspace with a live unsaved draft
    When I try switching with a private page and type a slash query
    Then the private switch decision remains visible

  @F41-5
  Scenario: Empty ordinary captures do not resurrect removed pages
    Given a named workspace with a live unsaved draft
    When I close its ordinary pages leaving only a private page
    Then the saved workspace has no ordinary tabs

  @F41-6
  Scenario: Quiet tabs and inactive navigation keep their workspace ownership
    Given a named workspace with a live unsaved draft
    When I quiet a grouped pinned page and switch away
    Then inactive navigation belongs to the original workspace and its quiet tab survives

  @F41-7
  Scenario: Deleting an inactive workspace reveals its live draft
    Given a named workspace with a live unsaved draft
    When I switch away and delete the inactive workspace
    Then the deleted workspace draft remains in a visible unsaved window

  @F41-8
  Scenario: Twenty five workspaces remain reachable in a small viewport
    Given twenty five named workspaces with long names
    Then the workspace list scrolls while creation controls remain visible

  @F41-9
  Scenario: Private-only secondary window does not restore old ordinary tabs
    Given a private-only secondary window bound to a named workspace
    When I close that window and reopen its workspace
    Then no removed ordinary page is restored

  @F41-10
  Scenario: A partial workspace save stays discoverable without losing the outgoing page
    Given a named workspace with a live unsaved draft
    When the incoming workspace session commit fails
    Then the original page identity and draft are unchanged

  @F41-11
  Scenario: Private discard leaves a usable retained ordinary workspace
    Given a named workspace with a live unsaved draft
    When I explicitly close a private page while switching and return
    Then the original page identity and draft are unchanged

  @F41-12
  Scenario: Switching preserves a submitted POST response without repeating it
    Given a named workspace with a submitted POST response and unsaved edits
    When I switch away from the POST workspace and return
    Then the POST response stays live without reposting or leaking page state to disk

  @F41-13
  Scenario: An active sign-in popup prevents a workspace switch
    Given a named workspace with an active sign-in popup opener family
    When I try switching workspaces during fixture sign-in
    Then the switch is refused and the sign-in callback still reaches its opener

  @F41-14
  Scenario: An active sign-in tab prevents a workspace switch
    Given a named workspace with an active sign-in tab opener family
    When I try switching workspaces during fixture sign-in
    Then the switch is refused and the sign-in callback still reaches its opener

  @F41-15
  Scenario: Anyone can save a window as a space
    Given there is no active supporter license
    When I save this window as a space named "Free for all" from the switcher
    Then a space named "Free for all" is saved and this window is in it

  @F41-16
  Scenario: The Island shows no space mark before the first space
    Then the Island shows no space mark

  @F41-17
  Scenario: A window that is in no space shows the quiet Spaces mark
    Given a space named "Elsewhere" saved from another window
    Then the Island shows the quiet Spaces mark

  @F41-18
  Scenario: The space mark names the current space and opens its menu
    Given a space named "Work" in this window, colored "#426c4c" with the symbol "briefcase"
    Then the Island's space mark reads "Work" in "#426c4c" with the symbol "briefcase"
    When I open the Spaces menu from the space mark
    Then the Spaces menu opens directly below the mark
    When I open the Spaces menu from the space mark
    Then the Spaces menu is closed

  @F41-19
  Scenario: Editing a space changes the mark as you edit
    Given a space named "Work" in this window, colored "#426c4c" with the symbol "briefcase"
    When I open the Spaces menu from the space mark
    And I edit "Work" to the color "sky" and the symbol "star"
    Then the Island's space mark reads "Work" in "#376694" with the symbol "star"

  @F41-20
  Scenario: A custom color is kept and drawn exactly
    Given a space named "Work" in this window, colored "#426c4c" with the symbol "briefcase"
    When I open the Spaces menu from the space mark
    And I give "Work" the custom color "#F5E663"
    Then the space "Work" is saved with the color "#f5e663"
    And the Island's space mark reads "Work" in "#f5e663" with the symbol "briefcase"
    And the mark's symbol is "#000000" on its color
    And the editor shows no readability note

  @F41-21
  Scenario: Undo after deleting this window's space puts the window back in it
    Given a space named "Work" in this window, colored "#426c4c" with the symbol "briefcase"
    When I open the Spaces menu from the space mark
    And I delete "Work" from its editor
    Then the Island shows no space mark
    When I undo the delete
    Then this window is in the space "Work" again

  @F41-22
  Scenario: The Spaces menu works from the keyboard
    Given spaces named "Work" and "Reading", with this window in "Work"
    When I open the Spaces menu from the space mark
    And I move "Work" down with Option or Alt and the down arrow
    Then the spaces are listed as "Reading" then "Work"
    When I press Escape in the Spaces menu
    Then the Spaces menu is closed and the space mark has focus

  @F41-23
  Scenario: With Reduce Motion a switch only cross-fades
    Given spaces named "Work" and "Reading", with this window in "Work"
    And Reduce Motion is on
    When I switch to "Reading" from the Spaces menu
    Then the space mark changes to "Reading" without sliding

  @F41-24
  Scenario: Typing a space's name in the panel switches to it
    Given spaces named "Work" and "Reading", with this window in "Work"
    When I type "Read" into the panel and pick the space result
    Then the Island's space mark reads "Reading"

  @F41-25
  Scenario: Switching from unsaved tabs leads with saving them
    Given a page open in a window that is in no space, and a saved space named "Target"
    When I open the Spaces menu from the space mark
    And I pick "Target" in the Spaces menu
    Then the switch prompt offers save, new window, close, then cancel

  @F41-26
  Scenario: Switching to a private tab redraws the space mark for the private theme
    Given a space named "Work" in this window, colored "#426c4c" with the symbol "briefcase"
    And a private tab beside an ordinary tab, with the ordinary tab selected
    When I select the private tab
    Then the Island's space mark is drawn for the private theme

  @F41-27
  Scenario: Closing the Spaces menu fades it out where it was
    Given a space named "Work" in this window, colored "#426c4c" with the symbol "briefcase"
    When I open the Spaces menu from the space mark
    And I press Escape in the Spaces menu
    Then the Spaces menu fades out below the mark before it is removed

  @F41-28
  Scenario: With Reduce Motion the closing Spaces menu only fades
    Given a space named "Work" in this window, colored "#426c4c" with the symbol "briefcase"
    And Reduce Motion is on
    When I open the Spaces menu from the space mark
    And I press Escape in the Spaces menu
    Then the Spaces menu fades out without moving

  @F41-29
  Scenario: Clicking the mark while the Spaces menu fades opens it again
    Given a space named "Work" in this window, colored "#426c4c" with the symbol "briefcase"
    When I open the Spaces menu from the space mark
    And I close the Spaces menu and click the mark again before it has faded
    Then the Spaces menu stays open below the mark

  @F41-30
  Scenario: Clicking the mark while its menu is open closes it without reopening
    Given a space named "Work" in this window, colored "#426c4c" with the symbol "briefcase"
    When I open the Spaces menu from the space mark
    And I press the space mark with the pointer, which takes focus from the menu
    Then the Spaces menu is closed and stays closed

  @F41-31
  Scenario: No colour shows a readability note, preset or custom
    Given a space named "Work" in this window, colored "#974f2a" with the symbol "plane"
    When I open the Spaces menu from the space mark
    And I open the color picker for "Work"
    Then the editor shows no readability note
    When I type the custom color "#FFFFFF" into the picker
    Then the editor shows no readability note
    And the Island's space mark reads "Work" in "#ffffff" with the symbol "plane"

  @F41-35
  Scenario: Switching between spaces never stops for a limit
    Given spaces named "One", "Two", "Three" and "Four", with this window in "One"
    And this window is showing a web page that keeps session storage
    When I switch this window to "Two", then "Three", then "Four"
    Then every switch went through
    And the space set aside first, "One", has had its web page quieted
    And "Two" and "Three" are still loaded in the background

  @F41-37
  Scenario: A set-aside space's pinned page is never quieted
    Given spaces named "One", "Two", "Three" and "Four", with this window in "One"
    And this window is showing a web page, beside a pinned web page
    When I switch this window to "Two", then "Three", then "Four"
    Then every switch went through
    And the space set aside first, "One", has had its web page quieted
    And its pinned page is still loaded

  @F41-38
  Scenario: Switching back to a space while its page is being quieted shows the page
    Given spaces named "One" and "Reading", with this window in "One"
    And this window is showing a web page
    When I switch this window to "Reading"
    And I switch back to "One" while its page is being quieted
    Then the window shows that page, awake

  @F41-39
  Scenario: Blanc never keeps more than six spaces set aside
    Given Quiet Tabs is off
    And eight spaces, with this window in the first
    When I switch this window through the other seven
    Then at most six spaces are set aside
    And the first space was released, and switching back to it brings its page back

  @F41-36
  Scenario: With Quiet Tabs off, set-aside spaces stay loaded
    Given Quiet Tabs is off
    And spaces named "One", "Two", "Three" and "Four", with this window in "One"
    When I switch this window to "Two", then "Three", then "Four"
    Then every switch went through
    And Blanc made no room because Quiet Tabs is off

  @F41-34
  Scenario: Recently deleted spaces keep their colour, their full name and when they went
    Given a space named "Work" in this window, colored "#426c4c" with the symbol "briefcase"
    And a space named "Reading list for the weekend", colored "#9b4761" with the symbol "book", deleted today
    When I open the Spaces menu from the space mark
    And I open Recently Deleted
    Then "Reading list for the weekend" is listed in "#9b4761", deleted today, with its full name as a tooltip
    And it has a trash button labelled "Delete permanently…"

  @F41-33
  Scenario: A long space name never squeezes the mark's colour square
    Given a space named "Work" in this window, colored "#f5c84c" with the symbol "music"
    When I rename "Work" to a 60-character name
    Then the mark's colour square keeps its size and place, and the name is cut short

  @F41-32
  Scenario: Space names are drawn whole, descenders included
    Given spaces named "Typing gym" and "Reading", with this window in "Typing gym"
    When I open the Spaces menu from the space mark
    Then every space name in the menu and on the mark is drawn whole

  @F41-40
  Scenario: Moving a tab to a space that is open nowhere keeps its page
    Given spaces named "One" and "Reading", with this window in "One"
    And this window is showing a web page that keeps session storage
    When I move that page to "Reading" from its tab menu
    Then this window no longer has that page and is still in "One"
    And "Reading" is set aside with that page last, still loaded
    And switching this window to "Reading" shows that same page, its session storage intact

  @F41-41
  Scenario: Moving a tab to a space shown in another window
    Given a space named "Work" saved from another window
    And this window is showing a web page
    When I move that page to "Work" from its tab menu
    Then the other window has that page last, without selecting it
    And this window no longer has that page

  @F41-42
  Scenario: The tab menu offers Move to Space only where the move can happen
    Given spaces named "One" and "Reading", with this window in "One"
    Then the tab menu's "Move to Space" is disabled for this window's only tab
    When this window is showing a web page
    Then the tab menu's "Move to Space" is enabled for that page
    And a private tab's menu has no "Move to Space"

  @F41-43
  Scenario: A move whose save fails leaves the page where it was, across a crash
    Given spaces named "One" and "Reading", with this window in "One"
    And this window is showing a web page
    And the move's save will fail once
    When I move that page to "Reading" from its tab menu
    Then the move reports that it failed and that nothing moved
    And this window still has that page, live and selected
    And "Reading"'s saved tabs list that page 0 times
    When Blanc crashes and starts again
    Then the restored window has that page
    And "Reading"'s saved tabs list that page 0 times

  @F41-44
  Scenario: A move whose transfer and recovery save both fail keeps the page across a crash
    Given spaces named "One" and "Reading", with this window in "One"
    And this window is showing a web page
    And the move's transfer and its recovery save will both fail once
    When I move that page to "Reading" from its tab menu
    Then the move reports that it failed and that nothing moved
    And this window still has that page, live and selected
    When Blanc crashes and starts again
    Then the restored window has that page
    And "Reading"'s saved tabs list that page 1 time

  @F41-45
  Scenario: A move that succeeds survives a crash
    Given spaces named "One" and "Reading", with this window in "One"
    And this window is showing a web page
    When I move that page to "Reading" from its tab menu
    Then this window no longer has that page and is still in "One"
    When Blanc crashes and starts again
    Then the restored window does not have that page
    And "Reading"'s saved tabs list that page 1 time

  @F41-46
  Scenario: Create a space from a tab when the current space is the only one
    Given a space named "One" in this window, colored "#426c4c" with the symbol "book"
    And this window is showing a web page that keeps session storage
    When I choose New Space from that page's tab menu
    And I create the tab's new space named "Reading"
    Then the new space "Reading" has that same live page and this window stays in "One"

  @F41-47
  Scenario: Cancel creating a space from a tab
    Given a space named "One" in this window, colored "#426c4c" with the symbol "book"
    And this window is showing a web page
    When I choose New Space from that page's tab menu
    And I cancel the tab's new space editor
    Then the profile still has only the space "One" and the page stays here

  @F41-48
  Scenario: A duplicate space name leaves the tab's editor open
    Given a space named "One" in this window, colored "#426c4c" with the symbol "book"
    And this window is showing a web page
    When I choose New Space from that page's tab menu
    And I create the tab's new space named "One"
    Then the tab's new space editor stays open with its error and name "One"
    And the profile still has only the space "One" and the page stays here

  @F41-49
  Scenario: A failed new-space write leaves the tab and editor intact
    Given a space named "One" in this window, colored "#426c4c" with the symbol "book"
    And this window is showing a web page
    When I choose New Space from that page's tab menu
    Given the move's save will fail once
    When I create the tab's new space named "Reading"
    Then the tab's new space editor stays open with its error and name "Reading"
    And the profile still has only the space "One" and the page stays here

  @F41-50
  Scenario: A failed transfer shows the saved new space without offering a duplicate retry
    Given a space named "One" in this window, colored "#426c4c" with the symbol "book"
    And this window is showing a web page
    When I choose New Space from that page's tab menu
    Given the new space's transfer will fail once
    When I create the tab's new space named "Reading"
    Then the Spaces list shows the saved space "Reading" and the move error
    And this window still has that page, live and selected

  @F41-51 @link-space
  Scenario: A link sent to a visible space loads in its other window
    Given a space named "Reading" saved from another window
    And a counted link to open in another space
    When I open the counted link in space "Reading"
    Then the link loads in the other window without changing either selection

  @F41-52 @link-space
  Scenario: A link sent to a set-aside space stays quiet until selected
    Given spaces named "One" and "Reading", with this window in "One"
    When I switch this window to "Reading"
    And I switch this window to "One"
    Given a counted link to open in another space
    When I open the counted link in space "Reading"
    Then space "Reading" has the counted link quiet and unrequested
    And opening space "Reading" still does not request the link until I select it

  @F41-53 @link-space
  Scenario: A link sent to a closed space is saved without loading
    Given spaces named "One" and "Reading", with this window in "One"
    And a counted link to open in another space
    When I open the counted link in space "Reading"
    Then space "Reading" has the counted link saved without a runtime or request
    When Blanc crashes and starts again
    Then space "Reading" has the counted link saved without a runtime or request
    And opening space "Reading" still does not request the link until I select it

  @F41-54 @link-space
  Scenario: A failed link write adds nothing and shows the Spaces error
    Given spaces named "One" and "Reading", with this window in "One"
    And a counted link to open in another space
    And the move's save will fail once
    When I open the counted link in space "Reading"
    Then the link failure appears in Spaces and space "Reading" has no counted link

  @F41-55 @link-space
  Scenario: New Space from a link works when only the current space exists
    Given a space named "One" in this window, colored "#426c4c" with the symbol "briefcase"
    And a counted link to open in another space
    When I choose New Space for the counted link
    And I create the link space named "Reading"
    Then space "Reading" has the counted link saved without a runtime or request

  @F41-56 @link-space
  Scenario: A failed New Space write retains the chosen link and editor draft
    Given a space named "One" in this window, colored "#426c4c" with the symbol "briefcase"
    And a counted link to open in another space
    When I choose New Space for the counted link
    And I submit the link space named "Reading" with a failed save
    Then the link editor stays open with its error and name "Reading"
    When I create the link space named "Reading"
    Then space "Reading" has the counted link saved without a runtime or request

  @F41-57 @link-space
  Scenario: A failed quiet-tab creation rolls back the saved link
    Given spaces named "One" and "Reading", with this window in "One"
    When I switch this window to "Reading"
    And I switch this window to "One"
    Given a counted link to open in another space
    And the new space's transfer will fail once
    When I open the counted link in space "Reading"
    Then the link failure appears in Spaces and space "Reading" has no counted link
