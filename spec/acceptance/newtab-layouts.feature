@newtab-layouts @F35
Feature: The Start Page and its widgets
  The Start Page is Billboard, with optional widgets (Favorites and On your
  other devices) placed beside or under the clock, a shortcut count, and a
  separate Mahjong footer launch. The widget choice belongs to this device;
  a profile that used Ledger, Shelf or Tally gets the widgets that showed
  what that layout showed, once.

  @F35-1 @desktop
  Scenario Outline: Each old layout's widgets show on Billboard
    Given a profile that last used the "<layout>" start page layout
    When I open a new tab
    Then the start page shows Billboard with the "<layout>" widgets

    Examples:
      | layout    |
      | ledger    |
      | shelf     |
      | tally     |
      | billboard |

  @F35-2 @desktop
  Scenario: Customize turns a widget on and every open Start Page follows
    Given a profile whose start page layout is "billboard"
    And a new tab is open
    And a new tab is open
    When I turn on the "favorites" widget in Customize
    Then the start page shows the "favorites" widget
    And the saved widgets have "favorites" on
    When I go back to the first Start Page
    Then the start page shows the "favorites" widget

  @F35-3 @all
  Scenario: Mahjong opens as a playable managed tab
    Given a profile whose start page layout is "billboard"
    When I open a new tab
    And I launch Mahjong from the start-page footer
    Then the original start page remains on "billboard" in a separate tab
    And the standalone mahjong game is ready
    And rapid Undo cancels pending Mahjong feedback
    And Mahjong correctness flows pass in the renderer
    And a copied Mahjong deal opens identically in another managed tab
    And the Mahjong completion dialog remains usable at the minimum desktop size
    And the six-control Mahjong rail fits its table at every desktop breakpoint
    And the Mahjong records sheet stays contained at the default, minimum, and zoomed desktop sizes

  @F35-4 @desktop
  Scenario: The footer launches Mahjong whatever the widgets
    Given a profile whose start page layout is "billboard"
    When I open a new tab
    Then the footer launches Mahjong in a new tab with each widget setup

  @F35-9 @desktop
  Scenario: A private footer launches a private standalone game
    Given a private start page is open
    When I launch Mahjong from the start-page footer
    Then Mahjong is a private managed tab

  @F35-5 @desktop
  Scenario: Billboard ranks local top sites and remembers a hidden site locally
    Given local history contains repeated visits for the Billboard
    And a profile whose start page layout is "billboard"
    When I open a new tab
    Then the Billboard lists "youtube.com" before "cnet.com"
    And the Billboard uses short site names, full-title tooltips and cached site icons
    When I hide "youtube.com" from the Billboard
    Then "youtube.com" is absent from the Billboard
    And the Billboard dismissal stays in local page storage without deleting history

  @F35-5 @desktop
  Scenario: Billboard keeps a pinned site at the front of its row
    Given local history contains repeated visits for the Billboard
    And the Start Page has no pins
    And a profile whose start page layout is "billboard"
    When I open a new tab
    And I pin "cnet.com" to the Billboard
    Then the Billboard lists "cnet.com" first, pinned
    And the Start Page keeps the page last visited on "cnet.com" pinned
    When I unpin "cnet.com" from the Billboard
    Then the Billboard lists "youtube.com" before "cnet.com"
    And the Billboard keeps no pins

  @F35-5 @desktop
  Scenario: A pinned Billboard site outlasts history
    Given local history contains repeated visits for the Billboard
    And the Start Page has no pins
    And a profile whose start page layout is "billboard"
    When I open a new tab
    And I pin "cnet.com" to the Billboard
    And I clear browsing history
    And I open a new tab
    Then the Billboard shows only "cnet.com", pinned, opening the page last visited
    When I unpin "cnet.com" from the Billboard
    Then "cnet.com" is absent from the Billboard
    And the Billboard keeps no pins

  @F35-5 @desktop
  Scenario: A pinned favorite leads the Favorites card
    Given eight favorites fill the Start Page
    And the Start Page has no pins
    And a profile whose start page layout is "shelf"
    When I open a new tab
    And I pin "Favorite 8" on the Start Page
    Then "Favorite 8" leads the Start Page's favorites, pinned
    And the Start Page keeps "Favorite 8" pinned
    When I unpin "Favorite 8" on the Start Page
    Then the Start Page's favorites are back in their saved order

  @F35-5 @desktop
  Scenario: A tab's menu pins its page to the front of an open Start Page
    Given eight favorites fill the Start Page
    And the Start Page has no pins
    And a profile whose start page layout is "tally"
    When I open a new tab
    And I open "Pinned Article" in another tab
    And I choose "Pin to Start Page" from that tab's menu
    Then that tab's menu offers "Unpin from Start Page"
    And the Start Page keeps "Pinned Article" pinned
    When I go back to the Start Page tab
    Then "Pinned Article" leads the Start Page's favorites, pinned

  @F35-5 @desktop
  Scenario: The Favorites page pins a favorite to the Start Page
    Given eight favorites fill the Start Page
    And the Start Page has no pins
    And a profile whose start page layout is "ledger"
    And the favorites page is open
    When I pin "Favorite 8" from the Favorites page
    Then the Favorites page marks "Favorite 8" as pinned to the Start Page
    And the Start Page keeps "Favorite 8" pinned
    When I open a new tab
    Then "Favorite 8" leads the Start Page's favorites, pinned

  @F35-5 @desktop
  Scenario: Billboard continues past its initial candidate page
    Given local history contains sixty ranked sites for the Billboard
    And the first forty-eight Billboard sites are hidden locally
    And a profile whose start page layout is "billboard"
    When I open a new tab
    Then the Billboard backfills with "site-48.example"

  @F35-6 @desktop
  Scenario: The Start Page uses the approved typography roles with every widget setup
    Given local history contains repeated visits for the Billboard
    And eight favorites fill the Start Page
    And a profile whose start page layout is "billboard"
    When I open a new tab
    Then the start page uses Instrument Sans for the Billboard clock and invitation headings
    And the start-page typography fits at desktop size boundaries

  @F35-7 @desktop
  Scenario: The moving-in checklist shows whatever the widgets
    Given a profile that completed first run
    And the moving-in checklist is incomplete and not hidden
    When I open a new tab
    Then the moving-in checklist appears with every widget setup

  @F35-8 @desktop
  Scenario: The moving-in checklist opens from the footer's left
    Given a profile that completed first run
    And the moving-in checklist is incomplete and not hidden
    When I open a new tab
    Then the moving-in checklist pill sits on the footer's left with Customize centred
    When I open the moving-in checklist
    Then the moving-in checklist popover opens above its pill
    When I press Escape on the start page
    Then the moving-in checklist popover closes and its pill has focus

  @F35-10 @desktop
  Scenario: The checklist and the footer never cover start-page content
    Given a profile that completed first run
    And the moving-in checklist is incomplete and not hidden
    And local history contains repeated visits for the Billboard
    And eight favorites fill the Start Page
    When I open a new tab
    Then no widget setup is covered by its checklist or footer at 1440x840 or 820x840
    And every widget setup keeps the footer's left group on one line with Customize centred from 1000 to 1320 wide

  @F35-11 @desktop
  Scenario: The Patron upgrade sits in the footer and closes for 90 days
    Given a profile that completed first run
    And the Patron upgrade has never been closed
    When I open a new tab
    Then every widget setup shows the Patron upgrade on the footer's left
    When I close the Patron upgrade
    Then the Patron upgrade stays hidden on a new tab
    When 90 days pass since the Patron upgrade was closed
    And I open a new tab
    Then every widget setup shows the Patron upgrade on the footer's left

  @F35-12 @desktop
  Scenario: Private start pages never offer Patron or blocked counts
    Given a private start page is open
    Then no widget setup shows the Patron upgrade or a blocked count

  @F35-13 @desktop
  Scenario: An empty Favorites list explains how to fill it
    Given a profile with no favorites
    When I open a new tab
    Then the Favorites card shows one empty Favorites hint and the plain Start Page shows none

  @F35-14 @desktop
  Scenario: Customize turns a widget on and closes with Escape
    Given a profile whose start page layout is "billboard"
    And a new tab is open
    When I open Customize on the start page
    And I turn on the "devices" widget in Customize
    Then the saved widgets have "devices" on
    And Customize stays open with the "devices" widget on
    When I press Escape on the start page
    Then Customize is closed and its button has focus

  @F35-15 @desktop
  Scenario: Billboard shows its recent sites as one row of short names
    Given local history contains repeated visits for the Billboard
    And a profile whose start page layout is "billboard"
    When I open a new tab
    Then the Billboard shows one row of single-line site names at 1440x840 and 820x840
    And the line under the clock gives the week's blocked count alone

  @F35-16 @desktop
  Scenario: The shortcut count steps from 1 to 12
    Given local history contains repeated visits for the Billboard
    And a profile whose start page layout is "billboard"
    And a new tab is open
    When I press More shortcuts 6 times
    Then the shortcut count is 12, saved, with focus on More shortcuts
    And Customize says "6 sites so far. More appear as you browse."

  @F35-17 @desktop
  Scenario: A widget card moves with its grip and stays clear of the shortcuts
    Given local history contains repeated visits for the Billboard
    And eight favorites fill the Start Page
    And a group "Research" with 2 tabs
    And a group "Travel planning" with 2 tabs
    And a group "Reading list" with 2 tabs
    And a profile whose start page layout is "ledger"
    And a new tab is open
    When I press "Right" on the "favorites" card's grip
    Then the "favorites" card is on the "right" at position 1, announced and saved
    And no shortcut tile, group chip or card overlaps another or the footer from 1000 to 1440 wide

  @F35-18 @desktop
  Scenario: Billboard centers whatever it shows between the window top and the footer
    Given a profile that completed first run
    And the moving-in checklist is incomplete and not hidden
    And a profile whose start page layout is "billboard"
    When I open a new tab
    Then the Billboard content is centered between the window top and the footer at 1280x800, 900x900, 700x1000 and 1440x600
    Given local history contains repeated visits for the Billboard
    When I open a new tab
    Then the Billboard content is centered between the window top and the footer at 1280x800, 900x900, 700x1000 and 1440x600

  @F35-19 @desktop
  Scenario: Play the Sunrise when Blanc opens
    Given the launch Sunrise is turned off
    When I open a new tab
    Then the start page does not play the Sunrise
    Given the launch Sunrise is turned on
    When I open a new tab
    Then the start page plays the Sunrise over its layout, without taking clicks
    And the Sunrise removes itself when it ends
    When I open a new tab
    Then the start page does not play the Sunrise
