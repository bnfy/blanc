@permissions @auth
Feature: Permissions and authentication prompts
  Explicit per-permission prompts with shared copy, and the HTTP basic-auth modal.

  @F13-1 @F13 @all
  Scenario: A geolocation request raises the Blanc permission prompt
    When a site requests geolocation
    Then the Blanc permission prompt for geolocation is shown
    When I deny the request
    Then the denial persists for that origin

  @F13-2 @F13 @all
  Scenario: Mic capture lights the capture chip and stop clears it
    Given a tab whose site was granted microphone access
    When the site begins capturing audio
    Then the island pill shows the microphone-in-use chip
    When I stop capture for that site from the capture popover
    Then the microphone-in-use chip is hidden

  @F20-1 @F20 @all
  Scenario: Basic-auth challenge prompts for credentials
    When I navigate to a URL protected by HTTP basic auth
    Then a credential prompt is shown
    When I submit valid credentials
    Then the navigation proceeds
