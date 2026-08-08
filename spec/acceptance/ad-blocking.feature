@adblock
Feature: Ad and tracker blocking
  The user-facing contract is identical across platforms; the engine diverges
  (D1: WKContentRuleList on iOS vs programmatic interception on Android/desktop)
  and the per-site exception mechanism diverges (D2). Neither is observable in
  these scenarios — that is the point.

  Background:
    Given ad/tracker blocking is enabled

  @F12-1 @F12 @all @D1
  Scenario: Blocking increments the per-tab shield count
    When I load a page that requests known trackers
    Then the shield count for the tab is greater than 0

  @F12-2 @F12 @all @D2
  Scenario: Allowing ads on a site drops its shield count and persists
    Given the active tab is on "ads.example" with a shield count greater than 0
    When I run the slash command "/allow-ads"
    Then the shield count for "ads.example" becomes 0
    And "ads.example" is in the ad-block exceptions
    When I reload "ads.example"
    Then ads are still allowed on "ads.example"

  @F12-3 @F12 @all
  Scenario: The global toggle turns blocking off and on
    When I run the slash command "/block-ads"
    Then ad/tracker blocking is disabled
    When I run the slash command "/block-ads"
    Then ad/tracker blocking is enabled

  # A per-site exception outranks the global switch, so "/block-ads" has to
  # lift the exception to mean anything on a site the user allowed — as a bare
  # global toggle it reads as broken there while unblocking every other site.
  @F12-4 @F12 @all @D2
  Scenario: Blocking ads again on an allowed site lifts its exception
    Given the active tab is on "ads.example"
    When I run the slash command "/allow-ads"
    Then the ad-block exceptions contain the active site
    When I run the slash command "/block-ads"
    Then the ad-block exceptions do not contain the active site
    And ad/tracker blocking is enabled

  # Without this the allow-listed state is invisible: the shield hides at a 0
  # count, so an allowed site looks exactly like a site with nothing to block.
  @F12-5 @F12 @all
  Scenario: The chrome shows when ads are allowed on the current site
    Given the active tab is on "ads.example"
    When I run the slash command "/allow-ads"
    Then the pill shows that ads are allowed here
    When I run the slash command "/block-ads"
    Then the pill no longer shows that ads are allowed here

  # The shield is a control, not just a badge: its popover is "the same
  # surface that allowed it" from the parity contract, one click from the
  # pill. Only the on/off state and the site toggle are asserted here — the
  # count line inside the popover follows D13 on iOS (binary, no number).
  @F12-6 @F12 @all @D2 @D13
  Scenario: The shield opens a site popover that toggles protection for the site
    Given the active tab is on "ads.example"
    When I open the shield popover from the pill
    Then the shield popover shows protection on for the active site
    When I flip the shield popover toggle
    Then the ad-block exceptions contain the active site
    And the shield popover shows protection off for the active site
    When I flip the shield popover toggle
    Then the ad-block exceptions do not contain the active site
    And the shield popover shows protection on for the active site
