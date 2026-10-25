@F57 @desktop
Feature: Shared Spaces
  @F57-1
  Scenario: Choose the Spaces this device shares
    Given a Shared Spaces fixture with a local Work Space
    When I open the Shared Spaces selection sheet
    Then the Work Space is checked with its tab count
    And cancelling the sheet leaves sharing off

  @F57-2
  Scenario: A new remote tab stays quiet
    Given a Shared Spaces fixture with the Work Space shared
    When device B adds a tab to Work
    Then the remote tab appears quiet

  @F57-3
  Scenario: A remote close preserves local recovery
    Given a Shared Spaces fixture with the Work Space shared
    When device B closes the background Work tab
    Then its parked page appears once in Recently closed

  @F57-4
  Scenario: Active navigation waits without an echo
    Given a Shared Spaces fixture with the Work Space shared
    When device B navigates the active Work tab
    Then the active tab keeps its displayed address without republishing it

  @F57-5
  Scenario: An older Worker does not disable ordinary sync
    Given a Shared Spaces fixture with a local Work Space
    When the Worker does not support Spaces
    Then the sheet reports Spaces unavailable and Favorites still sync

  @F57-6
  Scenario: A local-only navigation does not close the tab elsewhere
    Given a Shared Spaces fixture with the Work Space shared
    When the shared tab navigates to an internal page
    Then device B still sees its last shareable web page

  @F57-7
  Scenario: Deleting a Space frees a full account immediately
    Given a Shared Spaces fixture with the Work Space shared
    When the account storage is full and I delete Work
    Then the next encrypted write succeeds without waiting for retention expiry
