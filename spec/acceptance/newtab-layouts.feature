@newtab-layouts @F35
Feature: Start page layouts
  The start page offers five layouts: four arrangements of its usual material
  and a local mahjong solitaire game. The choice is the person's, persists
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
  Scenario: Mahjong layout embeds a playable deal
    Given a profile whose start page layout is "mahjong"
    When I open a new tab
    Then the start page renders the "mahjong" layout
    And the embedded mahjong game is ready
    And rapid Undo cancels pending Mahjong feedback
    And the Mahjong completion dialog remains usable at the minimum desktop size
    And the six-control Mahjong rail fits its table at every desktop breakpoint
    And the Mahjong records sheet stays contained at the default, minimum, and zoomed desktop sizes

  @F35-4 @desktop
  Scenario: An embedded Mahjong timer pauses when another start layout is shown
    Given a profile whose start page layout is "mahjong"
    When I open a new tab
    Then the embedded mahjong game is ready
    When I make a move in embedded Mahjong
    And I choose the "ledger" start page layout from its footer
    Then the hidden embedded Mahjong timer stays paused

  @F35-5 @desktop
  Scenario: Billboard ranks local top sites and remembers a hidden site locally
    Given local history contains repeated visits for the Billboard
    And a profile whose start page layout is "billboard"
    When I open a new tab
    Then the Billboard lists "youtube.com" before "cnet.com"
    And the Billboard uses full local titles and cached site icons
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
  Scenario: Every start-page layout replaces mono UI text with Inter
    Given local history contains repeated visits for the Billboard
    And a profile whose start page layout is "mahjong"
    When I open a new tab
    Then all start-page templates use Inter instead of JetBrains Mono
    And Inter start-page typography fits at desktop size boundaries
