@tab-migration @F39
Feature: Bring Your Tabs
  People can bring the tabs already open in another browser into Blanc and
  organize them into Named Groups without first cleaning up or bookmarking them.

  @F39-1 @desktop @D22
  Scenario: A selected browser profile exposes its verified open tabs
    Given I opened Bring Your Tabs without selecting a source
    When I select a supported browser profile with a complete restorable session
    Then its normal HTTP and HTTPS tabs are shown by source window and tab order
    And exact duplicate open tabs remain separate
    And no tabs, groups, or Favorites have been created

  @F39-2 @desktop
  Scenario: Apply preserves order, pins, and quiet state
    Given I reviewed selected open-tab candidates from multiple source windows
    When I apply the tab migration
    Then imported tabs appear in source-window and source-tab order
    And source pins remain pinned
    And only the first selected imported tab is awake and focused
    And every other imported tab is quiet and viewless
    And Favorites are unchanged

  @F39-3 @desktop
  Scenario: Source groups seed editable Named Groups
    Given selected source tabs include an eligible named source group
    When I organize the migration
    Then that name and membership seed an editable Blanc Named Group
    And single-tab, blank-group, and ungrouped tabs remain ungrouped
    And I can create, rename, move, ungroup, leave out, and restore tabs
    And no placeholder group is invented

  @F39-4 @desktop @D22
  Scenario: Source bytes are not read before explicit selection
    Given I opened Bring Your Tabs without selecting a source
    Then available browser and profile labels may be listed
    But no session file has been opened
    When I select a source profile
    Then Blanc reads only its bounded session snapshot

  @F39-5 @desktop @D22
  Scenario: The utility renderer receives no full URLs or source paths
    Given a tab-migration session contains candidate URLs and a source path
    When the utility renderer requests its candidate projection
    Then it receives opaque IDs, bounded titles, hostnames, source-window and group labels, pin, and selection state
    But it receives no full URL or source filesystem path

  @F39-6 @desktop
  Scenario: A failed tab batch leaves no imported state
    Given a reviewed tab migration is ready to apply
    And its quiet-tab batch will fail
    When I apply the tab migration
    Then no imported tab or group remains
    And Favorites are unchanged

  @F39-7 @desktop @D22
  Scenario: Quit guidance requires recoverability evidence
    Given the newest source session cannot be read while its browser is running
    When Blanc can parse an older saved restorable session as preflight evidence
    Then Blanc may ask me to quit the source browser normally
    And Blanc says tabs remain saved and restorable without promising automatic reopening
    But Blanc never force-quits or modifies that browser

  @F39-8 @desktop
  Scenario: A reviewed name matching an existing group merges
    Given the destination already has a Named Group named "work"
    And I renamed a reviewed migration group to "work"
    When I apply the tab migration
    Then those imported tabs join the existing "work" group
    And no second "work" group is created

  @F39-9 @desktop @D22
  Scenario: A stale or differently owned session cannot apply
    Given a tab-migration session belongs to one window and profile
    When a stale generation, another window, or another profile tries to apply it
    Then the apply is rejected
    And no tabs, groups, Favorites, or workspaces are changed

  @F39-10 @desktop @D22
  Scenario: Post-quit verification never falls back to stale state
    Given Blanc asked me to quit the source browser after a successful preflight
    When the exact newest session remains locked, changing, incomplete, or malformed
    Then Blanc does not import an older snapshot
    And Blanc tells me to reopen the source browser

  @F39-11 @desktop @F36 @D22
  Scenario: Onboarding reaches the separate open-tab flow
    Given I am on first-run onboarding's import step
    When I choose Bring your open tabs before or after Favorites import
    Then the same Bring Your Tabs sheet opens
    And Favorites import remains a separate F30 action

  @F39-12 @desktop @D22
  Scenario: Unsupported session formats fail closed
    Given the selected session is encrypted, malformed, oversized, or unsupported
    When Blanc attempts its explicit read
    Then no source-browser credential or OS-crypt key is requested
    And no import state is created

  @F39-13 @desktop
  Scenario: Workspace save stays separate from migration
    Given I successfully imported reviewed tabs and groups
    Then the imported state is available without Patron
    When I choose to save that setup as a Named Workspace
    Then Blanc uses the existing Patron-gated workspace flow as a separate gesture

  @F39-14 @desktop
  Scenario: Cancel destroys the ephemeral migration session
    Given a tab-migration session has candidates in memory
    When I cancel or dismiss Bring Your Tabs
    Then the session is destroyed
    And no migration secret enters persistence, sync, telemetry, or logs

  @F39-15 @desktop
  Scenario: A 500-candidate import keeps one live imported tab
    Given I reviewed the maximum 500 open-tab candidates
    When I apply the tab migration
    Then the batch produces one tab-state broadcast
    And only the focused imported tab has live web contents
    And the other imported tabs remain quiet and viewless
