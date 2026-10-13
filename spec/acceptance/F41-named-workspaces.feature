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
  Scenario: A custom color is kept and drawn readably
    Given a space named "Work" in this window, colored "#426c4c" with the symbol "briefcase"
    When I open the Spaces menu from the space mark
    And I give "Work" the custom color "#F5E663"
    Then the space "Work" is saved with the color "#f5e663"
    And the Island's space mark reads "Work" in "#6d6400" with the symbol "briefcase"
    And the editor says the color is shown as "#6D6400" in light mode

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
