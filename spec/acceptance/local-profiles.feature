@desktop
Feature: isolated local profiles
  Named profiles are on-device browser identities with separate site and
  browsing records. Personal remains permanent and owns the existing data.

  @F33-1 @F33 @D25
  Scenario: Settings creates a profile with isolated records and sessions
    Given Personal profile settings are open
    When I create a local profile named "Work" from Settings
    Then the Work profile owns a separate window
    When I save distinct Favorites in Personal and Work
    Then each profile sees only its own Favorites
    When I open normal and private tabs in Work
    Then both Work sessions are isolated from Personal

  @F33-2 @F33 @D25
  Scenario: Settings renames and permanently deletes a named profile
    Given a local profile named "Work" and Personal profile settings
    When I rename the Work profile to "Studio" from Settings
    Then its registry entry and window title say "Studio"
    When I try to delete Studio with the wrong confirmation
    Then the Studio profile remains intact
    When I confirm deletion of Studio from Settings
    Then its windows, registry entry, and saved workspaces are removed

  @F33-3 @F33 @D25
  Scenario: a named profile workspace restores into the same isolated session
    Given a saved Work profile workspace
    When I relaunch Blanc with local profiles
    Then Personal and Work restore with their original profile identities
