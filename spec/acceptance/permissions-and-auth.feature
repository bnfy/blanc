@permissions @auth
Feature: Permissions and HTTP authentication policy
  Explicit per-permission prompts with shared copy; no Blanc credential dialog.

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
  Scenario: Basic-auth challenge never prompts for credentials
    When I navigate to a URL protected by HTTP basic auth
    Then no Blanc credential prompt is shown
    And the protected navigation fails

  @F20-2 @F20 @all
  Scenario: Page-resource challenges are cancelled silently
    When a page's own fetch, XHR, and image requests receive HTTP auth challenges
    Then no Blanc credential prompt is shown
    And the page observes the 401 responses itself

  @F20-3 @F20 @all
  Scenario: A website's own sign-in form is untouched
    When I submit a website's own sign-in form
    Then the website completes the sign-in
    And no HTTP auth challenge was involved

  @F20-4 @F20 @all
  Scenario: Proxy authentication challenge never prompts for credentials
    When a proxy demands authentication for a navigation
    Then no Blanc credential prompt is shown
    And the proxied navigation fails
