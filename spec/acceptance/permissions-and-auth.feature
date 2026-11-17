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

  @F13-3 @F13 @F13-lna @desktop
  Scenario: A public site asks before reaching an app on this device
    Given a fresh profile and an app listening on this device
    And a public website is open
    When the site asks whether it may reach apps on this device
    Then Blanc answers "prompt"
    When the site connects to the app
    Then the Blanc permission prompt asks to connect to apps on this device
    When I allow it
    Then the app receives the request
    And the site reads the permission as "granted"

  @F13-4 @F13 @F13-lna @desktop
  Scenario: Blocking is remembered, listed in Settings, and can be undone
    Given a fresh profile and an app listening on this device
    And a public website is open
    When the site connects to the app
    And I block it
    Then the app never receives the request
    And the site reads the permission as "denied"
    And connecting again is refused without a prompt
    And Settings lists the site as blocked for apps on this device
    When I remove that decision in Settings
    Then connecting again asks first

  @F13-5 @F13 @F13-lna @desktop
  Scenario: A private tab's answer is never saved
    Given a fresh profile and an app listening on this device
    And a public website is open in a private tab
    When the site connects to the app
    And I allow it
    Then the app receives the request
    And nothing is saved to the profile

  @F13-6 @F13 @F13-lna @desktop
  Scenario: A frame from another site is refused without a prompt
    Given a fresh profile and an app listening on this device
    And a public website is open
    When a frame from another site on the page connects to the app
    Then the frame's request is refused without a prompt

  @F13-7 @F13 @F13-lna @desktop
  Scenario: A localhost page reaches localhost without a prompt
    Given a fresh profile and an app listening on this device
    And a localhost page is open
    When the site asks whether it may reach apps on this device
    Then Blanc answers "granted"
    When the site connects to the app
    Then the request reaches the app without a prompt

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
