Feature: session recovery after an unclean exit
  Saved web tabs stay behind a safe local recovery choice after Blanc exits
  unexpectedly. Private tabs are never part of the recoverable workspace.

  @F39-1
  Scenario: restore saved tabs after an unclean exit
    Given I have two persisted tabs for crash recovery
    When Blanc exits unexpectedly and relaunches
    Then Blanc holds saved navigation behind the recovery choice
    When I choose to restore the saved session
    Then the saved crash-recovery tabs reopen

  @F39-2
  Scenario: discard the saved session after an unclean exit
    Given I have one persisted tab for crash recovery
    When Blanc exits unexpectedly and relaunches
    Then Blanc holds saved navigation behind the recovery choice
    When I choose to start fresh after the crash
    Then the saved crash-recovery tabs stay discarded

  @F39-3
  Scenario: restore each saved window in its original profile
    Given I have persisted Personal and named-profile tabs for crash recovery
    When Blanc exits unexpectedly and relaunches
    Then Blanc holds saved navigation behind the recovery choice
    When I choose to restore the saved session
    Then crash recovery preserves profile isolation and omits the private tab
