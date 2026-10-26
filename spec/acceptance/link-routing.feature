@desktop
Feature: open links from other apps where they belong
  Rules in Settings → Profiles send a link another app hands Blanc to a
  profile, and optionally a Space, chosen by its domain. A link no rule
  matches opens in the window used last, as before. Rules stay on the device.

  @F60-1 @F60
  Scenario: the group is offered only when there is somewhere to route to
    Given Personal profile settings are open
    Then the Open links from other apps group is hidden
    When I create a local profile named "Work" from Settings
    Then the Open links from other apps group is shown
    And its last row reads "Everything else: the window you used last"

  @F60-2 @F60
  Scenario: a rule added in Settings sends a domain's links to its profile
    Given a local profile named "Work" and Personal profile settings
    When I add a rule in Settings for a pasted link to the routed site
    Then the rule keeps just the routed site's domain
    When I choose the Personal profile for that rule
    Then the rule is saved for the routed site pointing at Personal
    When another app opens a link no rule matches
    Then the link opens in the Work profile window, the window used last
    When another app opens a link to the routed site
    Then the link opens in the Personal window, not the window used last

  @F60-3 @F60
  Scenario: deleting a profile removes its rules and its links fall through
    Given a local profile named "Work" and Personal profile settings
    And a saved rule sending the routed site to Work
    When the Work profile is deleted
    Then no rule points at Work
    When another app opens a link to the routed site
    Then the link opens in the Personal window
