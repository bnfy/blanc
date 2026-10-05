@newtab-layouts @F35
Feature: Start page layouts
  The start page offers four layouts and a separate Mahjong footer launch.
  The layout choice is the person's, persists
  across restarts, and travels with their profile like the theme does.

  @F35-1 @all
  Scenario: The saved layout is the one that renders
    Given a profile whose start page layout is "shelf"
    When I open a new tab
    Then the start page renders the "shelf" layout

  @F35-2 @all
  Scenario: Choosing a layout persists it
    Given a new tab is open
    When I choose the "tally" start page layout from its footer
    Then the saved start page layout is "tally"
    And the start page renders the "tally" layout

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
  Scenario: Every footer launches Mahjong without changing its layout
    Given a profile whose start page layout is "billboard"
    When I open a new tab
    Then each of the four layout footers launches Mahjong in a new tab

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
  Scenario: Billboard continues past its initial candidate page
    Given local history contains sixty ranked sites for the Billboard
    And the first forty-eight Billboard sites are hidden locally
    And a profile whose start page layout is "billboard"
    When I open a new tab
    Then the Billboard backfills with "site-48.example"

  @F35-6 @desktop
  Scenario: Every start-page layout uses the approved typography roles
    Given local history contains repeated visits for the Billboard
    And eight favorites fill the Start Page
    And a profile whose start page layout is "billboard"
    When I open a new tab
    Then the start page uses Newsreader for the Billboard clock and invitation headings
    And the start-page typography fits at desktop size boundaries

  @F35-7 @desktop
  Scenario: The moving-in checklist belongs to informational layouts only
    Given a profile that completed first run
    And the moving-in checklist is incomplete and not hidden
    When I open a new tab
    Then the moving-in checklist appears in all four start-page layouts

  @F35-8 @desktop
  Scenario: Billboard keeps the moving-in checklist clear of recent sites
    Given a profile that completed first run
    And the moving-in checklist is incomplete and not hidden
    And local history contains repeated visits for the Billboard
    And a profile whose start page layout is "billboard"
    When I open a new tab
    Then the Billboard moving-in checklist stays above its recent sites

  @F35-10 @desktop
  Scenario: The checklist and the footer never cover start-page content
    Given a profile that completed first run
    And the moving-in checklist is incomplete and not hidden
    And local history contains repeated visits for the Billboard
    And eight favorites fill the Start Page
    When I open a new tab
    Then no start-page layout is covered by its checklist or footer at 1440x840 or 820x840

  @F35-11 @desktop
  Scenario: The Patron upgrade sits in the same slot on every layout
    Given a profile that completed first run
    When I open a new tab
    Then every start-page layout ends with a visible Patron upgrade

  @F35-12 @desktop
  Scenario: Private start pages never offer Patron or blocked counts
    Given a private start page is open
    Then no start-page layout shows the Patron upgrade or a blocked count

  @F35-13 @desktop
  Scenario: An empty Favorites list explains how to fill it
    Given a profile with no favorites
    When I open a new tab
    Then Ledger, Shelf and Tally each show one empty Favorites hint and Billboard shows none

  @F35-14 @desktop
  Scenario: Customize chooses the layout and closes with Escape
    Given a new tab is open
    When I open Customize on the start page
    And I choose the "tally" start page layout from its footer
    Then the start page renders the "tally" layout
    And the saved start page layout is "tally"
    And Customize stays open with "tally" pressed
    When I press Escape on the start page
    Then Customize is closed and its button has focus

  @F35-15 @desktop
  Scenario: Billboard shows its recent sites as one row of short names
    Given local history contains repeated visits for the Billboard
    And a profile whose start page layout is "billboard"
    When I open a new tab
    Then the Billboard shows one row of single-line site names at 1440x840 and 820x840

  @F35-16 @desktop
  Scenario: Shelf fills full rows for its favorites and cards
    Given a group "research" with 2 tabs
    And a profile whose start page layout is "shelf"
    When I seed 6 favorites and open a new tab
    Then Shelf shows 3 columns with full rows of tiles and cards
    When I seed 2 more favorites and open a new tab
    Then Shelf shows 4 columns with full rows of tiles and cards
