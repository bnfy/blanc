@quiet-tabs
Feature: Quiet Tabs
  Blanc discards the renderer process of a tab you have not opened in a while
  and rebuilds it when you come back. The tab keeps its identity — title,
  address, favicon, and back history — the whole time.

  @F31-1 @F31 @desktop @D8
  Scenario: Quiet then wake preserves identity, history, oversized-state fallback, and redirect safety
    Given a background tab with restorable history and oversized page state
    When I quiet that background tab
    Then that tab is quiet with oversized page state dropped
    When I wake it through a redirect and activate it
    Then the same tab is functional with its address and back history intact

  @F31-1 @F31 @desktop @D8
  Scenario: A storage-bearing quiet tab can wake directly into its back history
    Given a background storage-bearing tab with back history
    When I quiet it and wake its previous history entry
    Then the previous page and session storage are intact

  @F31-2 @F31 @desktop @D8
  Scenario: The active tab is never quieted
    Given an active tab on a quietable page
    When every quiet path is asked to quiet the active tab
    Then the active tab remains awake

  @F31-3 @F31 @desktop @D8
  Scenario Outline: Protected background tabs stay awake and beforeunload remains functional
    Given a background tab protected by <reason>
    When I ask Blanc to quiet the protected tab
    Then the protected tab remains awake and functional

    Examples:
      | reason                 |
      | pinned                 |
      | muted                  |
      | audible                |
      | used media             |
      | dirty text             |
      | dirty checkbox         |
      | adopted child          |
      | non-refetchable POST   |
      | pending permission     |
      | deep scroll            |
      | beforeunload objection |
      | stored beforeunload handler |

  @F31-4 @F31 @desktop @D23
  Scenario: The sleep command quiets eligible rows without closing the panel
    Given a background tab on a quietable page
    And the tab panel is open
    When I run the manual sleep command
    Then the panel stays open and names the row quiet

  @F31-4 @F31 @desktop @D23
  Scenario: The sleep command explains when no background tab can be quieted
    Given no background tab can be quieted
    When I run the manual sleep command
    Then the panel stays open and explains that no tab can be quieted

  @F31-5 @F31 @desktop @D8
  Scenario: Quiet is visible and included in accessible names
    Given a background tab on a quietable page
    When I quiet that background tab
    And I show the vertical tab rail and panel
    Then the panel and rail expose a distinct quiet state

  @F31-5 @F31 @desktop @D8
  Scenario: The panel and rail dim quiet rows identically at rest
    Given a background tab on a quietable page
    When I quiet that background tab
    And I show the vertical tab rail and panel
    Then both quiet rows are dimmed at rest and render identically

  @F31-6 @F31 @desktop @D23
  Scenario Outline: Every delay value persists and Off leaves quiet tabs quiet
    Given a background tab on a quietable page
    When I quiet that background tab
    And I choose the quiet delay <delay>
    Then the quiet delay reads back as <delay>
    And choosing Off has not woken the quiet tab

    Examples:
      | delay |
      | off   |
      | 30m   |
      | 1h    |
      | 6h    |

  @F31-7 @F31 @desktop @D8
  Scenario: Lazy-restored tabs are viewless until the selected tab wakes
    Given two tabs are created through the lazy-restore path
    Then both restored tabs are quiet and viewless
    When I activate the saved restored tab
    Then only the selected restored tab has a live web contents

  @F31-8 @F31 @desktop @D8
  Scenario: A private tab wakes inside the private session
    Given a background private tab on a quietable page
    When I quiet that background tab
    And I activate that quiet tab
    Then the private tab is awake in the private session

  @F31-9 @F31 @desktop @D8
  Scenario: Page state never escapes snapshots into persistence, sync, or renderer IPC
    Given a quiet tab whose page state contains a unique secret
    Then the secret is absent from session persistence, tab sync, and tabs updated

  @F31-10 @F31 @desktop @D8
  Scenario: Quieting a tab releases a real renderer process, and waking brings one back
    Given a background tab on a quietable page
    And the renderer process count is recorded
    When I quiet that background tab
    Then that tab is quiet
    And the renderer process count has dropped by 1
    When I activate that quiet tab
    Then that tab is awake
    And its session storage survived the quiet reload
    And the renderer process count has returned to what it was
