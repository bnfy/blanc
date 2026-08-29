@platform-services
Feature: Platform services — telemetry, updates, zoom, autofill
  The features whose observable behaviour legitimately differs by platform, so the
  scenarios carry platform tags instead of @all.

  @F21-1 @F21 @all
  Scenario: A fresh profile sends nothing before its usage-ping choice is committed
    Given this is a packaged build with a fresh profile
    When the app launches
    Then no usage ping is sent
    When I commit the enabled usage ping choice
    Then exactly one launch ping is sent
    And it contains only an install id, session id, version, platform, architecture, and coarse operating-system version
    And it contains no browsing data

  @F21-2 @F21 @all
  Scenario: Declining the usage ping persists without minting an install id
    Given this is a packaged build with a fresh profile
    When I commit the disabled usage ping choice
    And the app launches again
    Then no usage ping is sent
    And no telemetry install id exists

  @F22-1 @F22 @desktop @D9
  Scenario: Desktop updates through the in-app updater
    Given a newer release is available
    Then the app can update itself through the in-app updater

  @F22-2 @F22 @mobile @D9
  Scenario: Mobile ships no self-updater
    Then the build contains no in-app self-updater
    And updates are delivered through the app store

  @F23-1 @F23 @all @D10
  Scenario: A page can be scaled and reset
    When I enlarge the page through the platform's zoom control
    Then the page content is enlarged
    When I reset the zoom
    Then the page returns to its default scale

  @F24-1 @F24 @mobile @D12
  Scenario: Saved credentials and passkeys work in a tab
    Given saved credentials exist for "login.example"
    When I focus the login form on "login.example"
    Then the system offers to fill the saved credentials
    When I complete a passkey sign-in
    Then the platform authenticator is invoked

  @F38-1 @F38 @desktop @macos @D26
  Scenario: macOS fills only a matching 1Password login after an explicit ask
    Given filling logins from 1Password is disabled by default
    And the installed 1Password app has ExactDomain, AnywhereOnWebsite, and Never Login items
    When I explicitly ask Blanc to fill the focused login form
    Then Blanc asks me to enable and configure the integration
    When I enable it and explicitly ask again
    Then only Login items whose saved-website behavior permits this page are offered
    And at most ten choices appear in a native picker
    And signup and new-password fields are not filled
    And changing the tab, navigation, document, or chosen fields cancels the fill
    And no credential is persisted, synced, logged, telemetered, or sent through renderer IPC
    And Blanc makes no 1Password request while I merely browse

  @F38-2 @F38 @desktop @macos @D26
  Scenario: The island offers Fill only for a visible, uncontradicted login form
    Given filling logins from 1Password is configured on this device
    When I open a page whose login form authoritatively declares a current-password field
    Then the island shows the fill hint
    When I navigate that tab to a page with no login form
    Then the fill hint disappears
    When I open a page whose only password field also declares new-password
    Then the island never shows the fill hint
    When I open a page whose login field is invisible
    Then the island never shows the fill hint

  @F38-3 @F38 @desktop @macos @D26
  Scenario: Fill questions open as a dialog capsule with Cancel focused and full keyboard control
    Given filling logins from 1Password is configured on this device
    When a fill confirmation question is presented
    Then the capsule is a dialog with initial focus on Cancel
    And Tab cycles focus between Cancel and Fill Login
    And pressing Enter with Cancel focused resolves the question as cancelled
    When a fill confirmation question is presented
    Then pressing Space with Fill Login focused resolves the question as confirmed
    When a fill confirmation question is presented
    Then pressing Escape cancels the question

  @F38-4 @F38 @desktop @macos @D26
  Scenario: Fill errors persist until dismissed and their announcement survives
    Given filling logins from 1Password is configured on this device
    When a no-matching-login notice is presented
    Then the notice is announced assertively
    And the notice is still visible past the auto-dismiss interval
    When I dismiss the notice
    Then the capsule is gone
    And the announcement is not retracted

  @F38-5 @F38 @desktop @macos @D26
  Scenario: A successful fill confirms politely and gets out of the way on its own
    Given filling logins from 1Password is configured on this device
    When a filled confirmation is presented
    Then the confirmation is announced politely
    And the capsule dismisses itself without any interaction

  @F38-6 @F38 @desktop @macos @D26
  Scenario: Switching tabs withdraws a pending fill question
    Given filling logins from 1Password is configured on this device
    And a fill confirmation question is presented
    When I switch to another tab
    Then the capsule is gone

  @F38-7 @F38 @desktop @macos @D26
  Scenario: The success confirmation waits while pointed at or focused
    Given filling logins from 1Password is configured on this device
    When a filled confirmation is presented
    And I hold focus on its dismiss control while hovering and then move the pointer away
    Then the confirmation stays visible past the auto-dismiss interval
