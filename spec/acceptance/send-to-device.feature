@sync @send-to-device
Feature: Send to device
  A page sent from one synced Blanc device waits on another in a short
  Sent to this device list until it is opened or dismissed (F55).

  @F55-1 @F55 @desktop
  Scenario: A page sent here waits first in the Other devices drawer
    Given "Pocket Phone" sent the page "Sent needle" here
    When I open the Island panel for sent pages
    Then the Other devices button shows 1
    When I toggle Other devices
    Then the drawer lists "Sent needle" from "Pocket Phone" first

  @F55-2 @F55 @desktop
  Scenario: Opening a sent page opens it in a new tab and hides it
    Given "Pocket Phone" sent the page "Sent needle" here
    When I open the Island panel for sent pages
    And I toggle Other devices
    And I open the sent page "Sent needle"
    Then a tab is open on the sent page's address
    And no page is waiting from another device

  @F55-3 @F55 @desktop
  Scenario: Dismissing a sent page hides it without opening it
    Given "Pocket Phone" sent the page "Sent needle" here
    When I open the Island panel for sent pages
    And I toggle Other devices
    And I dismiss the sent page "Sent needle"
    Then no page is waiting from another device
    And no tab is open on the sent page's address

  @F55-4 @F55 @desktop
  Scenario: /send sends the current page to the named device
    Given "Pocket Phone" can receive pages
    And a web page is open
    When I run "/send pocket phone" in the Island panel
    Then the page was sent to "Pocket Phone"
    And the Island panel says "Sent to Pocket Phone."

  @F55-5 @F55 @desktop
  Scenario: /send on an older sync server says sending isn't available
    Given "Pocket Phone" can receive pages
    And the sync server can't take sent pages yet
    And a web page is open
    When I run "/send Pocket Phone" in the Island panel
    Then the Island panel says "Sending isn't available yet."

  @F55-6 @F55 @desktop
  Scenario: /send without other devices says so
    Given no other device can receive pages
    And a web page is open
    When I run "/send Pocket Phone" in the Island panel
    Then the Island panel says "No other devices"

  @F55-7 @F55 @desktop
  Scenario: A private tab offers no /send
    Given "Pocket Phone" can receive pages
    And a private web page is open
    When I type "/se" into the Island command bar
    Then the commands list has no "/send"

  @F55-8 @F55 @desktop
  Scenario: A page sent here waits on the Ledger start page
    Given a profile whose start page layout is "ledger"
    And "Pocket Phone" sent the page "Sent needle" here
    When I open a new start page
    Then the start page lists the sent page "Sent needle" from "Pocket Phone"
    When I dismiss "Sent needle" on the start page
    Then the start page lists no sent page
