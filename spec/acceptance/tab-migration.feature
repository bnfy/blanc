@tab-migration @F39
Feature: Bring Your Tabs
  People can turn an explicitly selected bookmarks folder into a reviewed,
  ordered set of quiet Blanc tabs without exposing their browsing data or
  depending on a cloud organizer.

  @F39-1 @all @D22 @runnable
  Scenario: A selected bookmarks folder becomes a reviewable candidate list
    Given I opened Bring Your Tabs without selecting a source
    When I select a bookmarks source and one of its folders
    Then its supported web pages are previewed in source order
    And exact duplicate URLs appear only once
    And no tabs, groups, or Favorites have been created

  @F39-2 @all @runnable
  Scenario: Apply preserves preview order, quiet state, and Favorite folders
    Given I reviewed selected candidates from nested source folders
    When I apply the tab migration
    Then imported tabs appear in preview order
    And only the first selected imported tab is awake and focused
    And every other imported tab is quiet and viewless
    And imported Favorites use each page's immediate source subfolder

  @F39-3 @all
  Scenario: Folder suggestions remain editable and free
    Given selected candidates span several source folders
    When I ask Blanc to suggest groups from those folders
    Then I can rename, move, ungroup, exclude, and restore candidates before apply
    And applying the reviewed groups does not require Patron

  @F39-4 @all @D22 @runnable
  Scenario: Source data is not read before explicit selection
    Given I opened Bring Your Tabs without selecting a source
    Then available source labels may be listed
    But no browser profile or bookmarks file has been read
    When I select a source
    Then Blanc reads only its bounded bookmarks snapshot

  @F39-5 @desktop @D22 @runnable
  Scenario: The utility renderer receives no full URLs or source paths
    Given a desktop tab-migration session contains candidate URLs and a source path
    When the utility renderer requests its folder and candidate projections
    Then it receives opaque identifiers, titles, hostnames, folder labels, and selection state
    But it receives no full URL or source filesystem path

  @F39-6 @all
  Scenario: A failed tab batch leaves no imported state
    Given a reviewed tab migration is ready to apply
    And its quiet-tab batch will fail
    When I apply the tab migration
    Then no imported tab or group remains
    And no imported Favorite is written

  @F39-7 @all
  Scenario: A Favorites failure retries without duplicating tabs
    Given a reviewed tab migration created its tabs and groups
    But writing its Favorites failed
    When I retry the Favorites step
    Then Blanc does not create the tabs or groups again
    And the Favorites import resumes through the add-only deduplicating path

  @F39-8 @all @runnable
  Scenario: A reviewed name matching an existing group merges
    Given the destination already has a tab group named "work"
    And I renamed a reviewed migration group to "work"
    When I apply the tab migration
    Then those imported tabs join the existing "work" group
    And no second "work" group is created

  @F39-9 @desktop @D22 @runnable
  Scenario: A stale or differently owned session cannot apply
    Given a desktop tab-migration session belongs to one window and profile
    When a stale generation, another window, or another profile tries to apply it
    Then the apply is rejected
    And no tabs, groups, Favorites, or workspaces are changed

  @F39-10 @all @D22
  Scenario: A bookmarks HTML file uses the same folder flow
    Given my source browser is available through a bookmarks HTML export
    When I choose that file in Bring Your Tabs
    Then I can select one of its folders and review the same candidate fields
    And apply follows the same ordering, grouping, and Favorites rules

  @F39-11 @all @F36 @D22 @runnable
  Scenario: Both onboarding paths reach the same migration sheet
    Given I am on first-run onboarding's import step
    When I finish a Favorites import and choose to bring a folder in as tabs
    Then the Bring Your Tabs sheet opens
    When I skip full import and choose to bring tabs without importing everything
    Then the same Bring Your Tabs sheet opens

  @F39-12 @desktop
  Scenario: Unavailable semantic assistance falls back locally
    Given on-device semantic suggestions are unavailable
    When I ask Blanc to organize selected candidates
    Then deterministic folder suggestions remain available
    And no candidate metadata is sent over the network
    And no import state is changed before I approve it

  @F39-13 @desktop
  Scenario: Workspace save stays separate from migration
    Given I successfully imported reviewed tabs and groups
    Then the imported state is available without Patron
    When I choose to save that setup as a Named Workspace
    Then Blanc uses the existing Patron-gated workspace flow as a separate gesture

  @F39-14 @all @runnable
  Scenario: Cancel destroys the ephemeral migration session
    Given a tab-migration session has candidates or embeddings in memory
    When I cancel or dismiss Bring Your Tabs
    Then the session and embeddings are destroyed
    And no migration secret enters persistence, sync, telemetry, or logs

  @F39-15 @desktop @runnable
  Scenario: A 500-candidate import keeps one live imported tab
    Given I reviewed the maximum 500 tab-migration candidates
    When I apply the tab migration
    Then the batch produces one tab-state broadcast
    And only the focused imported tab has live web contents
    And the other imported tabs remain quiet and viewless
