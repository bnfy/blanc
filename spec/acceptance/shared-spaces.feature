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

  @F57-8 @two-clients
  Scenario: Two complete desktop clients converge through the Worker
    Given a Shared Spaces fixture with the Work Space shared
    And a second complete desktop client sharing Work
    Then both complete clients exchange quiet tabs in both directions
    And a complete client defers active navigation until its tab changes
    And a complete client receives one remote close entry
    And both complete clients rejoin dormant edits without duplicate tabs
    And the complete clients stay within their request budgets

  @F57-9 @peer-driver
  Scenario Outline: Shared Spaces fault and retention rules
    Then the Shared Spaces peer driver verifies "<case>"

    Examples:
      | case                                       |
      | two Work Spaces                            |
      | tombstone budget and expiry                 |
      | stale replica recovery at the Space cap     |
      | lost index reconciliation                  |
      | stale read cannot roll back                 |
      | same-version writes replay pending fields   |
      | unrecoverable write is reported honestly    |
      | exact occurrence dedupe and stale sidecar   |
      | 429 backoff and fair recovery               |

  @F57-10 @shared-crash
  Scenario: A deferred close survives a hard crash
    Given a Shared Spaces fixture with the Work Space shared
    When device B closes the active Work tab
    And the Shared Spaces client crashes and restores
    Then cold restore applies the deferred close and resumes persistence

  @F57-11 @shared-crash
  Scenario: A merged tab survives a hard crash before the next autosave
    Given a Shared Spaces fixture with the Work Space shared
    When device B adds a tab to Work
    And the Shared Spaces client crashes and restores
    Then the merged remote tab survives the crash without a duplicate

  @F57-12 @shared-crash
  Scenario: A crash after the blob write retries its missing index entry
    Given a Shared Spaces fixture with a local Work Space
    When an index write fails after the new Space blob succeeds
    And the Shared Spaces client crashes and restores
    Then the restored client retries the missing index entry

  @F57-13
  Scenario: A background page with unsaved input waits for a remote navigation
    Given a Shared Spaces fixture with the Work Space shared
    And the background Work tab has unsaved input
    When device B navigates the background Work tab
    Then the background tab keeps its page and its input
    When its input is cleared and Shared Spaces applies again
    Then the background tab follows the remote navigation

  @F57-14
  Scenario: Failed server erasure can be retried without losing credentials
    Given a Shared Spaces fixture with the Work Space shared
    When erasing the server copy fails once
    Then Settings keeps the credentials and offers an erasure retry
    When I retry erasing the server copy
    Then the erasure completes and sync turns off
