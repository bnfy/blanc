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

  @F60-4 @F60
  Scenario: the shield popover makes and removes the rule for the site in view
    Given a second local profile whose window is closed
    And the routed site is open in Personal
    When I open the shield popover
    Then it offers "Open links to this site in this profile", off
    When I turn on the popover's link routing switch
    Then a rule sends the routed site to Personal
    And the pill says "Links open here"
    And the popover's link routing switch is on
    When I turn off the popover's link routing switch
    Then no rule is left for the routed site

  @F60-5 @F60
  Scenario: /route and /route off write and remove the rule; a private tab can't
    Given the routed site is open in Personal
    When I run the slash command "/route"
    Then a rule sends the routed site to Personal
    When I run the slash command "/route off"
    Then no rule is left for the routed site
    When the routed site is open in a private tab
    And I run the slash command "/route"
    Then no rule is left for the routed site
    And the pill says "Can’t route this page"

  @F60-6 @F60
  Scenario: with the switch on, a link opened in a new tab follows a rule to another profile
    Given a local profile named "Work" and Personal profile settings
    And a saved rule sending addresses containing "/site/in-app-target" to Work
    And a Personal page has a new-tab link to "in-app-target"
    When I click the page's new-tab link
    Then the link opens in a new tab of the Personal window
    When link rules also apply to links opened in a new tab
    And I click the page's new-tab link
    Then the link opens in the Work window
    When the page opens that link in a new tab on its own
    Then the link opens in a new tab of the Personal window
