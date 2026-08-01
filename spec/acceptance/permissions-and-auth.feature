@permissions @auth
Feature: Permissions and authentication prompts
  Explicit per-permission prompts with shared copy, and the HTTP basic-auth modal.

  @F13-1 @F13 @all
  Scenario: A geolocation request raises the Blanc permission prompt
    When a site requests geolocation
    Then the Blanc permission prompt for geolocation is shown
    When I deny the request
    Then the denial persists for that origin

  @F29-1 @F29 @all
  Scenario: Display sharing is selected through trusted browser chrome
    Given a visible tab on a site that can request display capture
    When the site requests display capture
    Then the Blanc display-sharing chooser names the requesting origin
    When I choose a display source
    Then only that display source is granted

  @F29-2 @F29 @all
  Scenario: A pending display-sharing request is invalidated by navigation
    Given a visible tab with the Blanc display-sharing chooser open
    When the requesting tab starts a main-frame navigation
    Then the display-sharing request is denied
    And no display source is granted

  @F20-1 @F20 @all
  Scenario: Basic-auth challenge prompts for credentials
    When I navigate to a URL protected by HTTP basic auth
    Then a credential prompt is shown
    When I submit valid credentials
    Then the navigation proceeds
